import * as SQLite from 'expo-sqlite';
import { isBreed, type Breed, type Group } from '../domain/breed';

// The DB is a cache of server data, never user data, so a schema change just drops and re-syncs.
// Bump when the persisted Breed shape changes.
const SCHEMA_VERSION = 2;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS breeds (
    id TEXT PRIMARY KEY NOT NULL,
    data TEXT NOT NULL,          -- normalized Breed JSON
    synced_at INTEGER NOT NULL   -- ms epoch of the sync/refresh that wrote this row
  );
  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    label TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );`;

// Synchronous API only, on purpose. expo-sqlite's async API builds JS results on a Swift
// cooperative-pool thread while the JS thread keeps running; in iOS Release builds that race
// corrupted the Hermes heap (intermittent EXC_BAD_ACCESS on launch and sync; see DECISIONS.md §3).
// Sync calls run on the JS thread: a full 283-row save is one ~1 MB transaction, measured in
// PERFORMANCE.md, and calls can never interleave, so no extra locking is needed.
let instance: SQLite.SQLiteDatabase | null = null;

function db() {
  if (instance) return instance;
  const d = SQLite.openDatabaseSync('breeds.db');
  d.execSync('PRAGMA journal_mode = WAL');
  if (d.getFirstSync<{ user_version: number }>('PRAGMA user_version')?.user_version !== SCHEMA_VERSION) {
    d.execSync(`DROP TABLE IF EXISTS breeds; DROP TABLE IF EXISTS groups; DROP TABLE IF EXISTS meta;
      ${SCHEMA} PRAGMA user_version = ${SCHEMA_VERSION};`);
  }
  return (instance = d);
}

export interface Snapshot {
  breeds: Breed[];
  groups: Group[];
  lastSyncedAt: number | null;
}

export function loadSnapshot(): Snapshot {
  const d = db();
  const rows = d.getAllSync<{ data: string }>('SELECT data FROM breeds');
  const groups = d.getAllSync<Group>('SELECT id, name, label FROM groups');
  const meta = d.getFirstSync<{ value: string }>("SELECT value FROM meta WHERE key = 'lastSyncedAt'");
  const breeds = rows.map((r): unknown => JSON.parse(r.data)).filter(isBreed);
  return { breeds, groups, lastSyncedAt: meta ? Number(meta.value) : null };
}

/** Upserts in one transaction. `prune` deletes rows absent from a complete snapshot. */
export function saveBreeds(breeds: Breed[], { prune = false } = {}) {
  const d = db();
  d.withTransactionSync(() => {
    const now = Date.now();
    const stmt = d.prepareSync('INSERT OR REPLACE INTO breeds (id, data, synced_at) VALUES ($id, $data, $now)');
    try {
      for (const b of breeds) {
        stmt.executeSync({ $id: b.id, $data: JSON.stringify(b), $now: now });
      }
    } finally {
      stmt.finalizeSync();
    }
    if (prune) d.runSync('DELETE FROM breeds WHERE synced_at < ?', now);
  });
}

export function saveGroups(groups: Group[]) {
  const d = db();
  d.withTransactionSync(() => {
    d.runSync('DELETE FROM groups');
    for (const g of groups) d.runSync('INSERT INTO groups (id, name, label) VALUES (?, ?, ?)', g.id, g.name, g.label);
  });
}

export function setLastSyncedAt(timestamp: number) {
  db().runSync("INSERT OR REPLACE INTO meta (key, value) VALUES ('lastSyncedAt', ?)", String(timestamp));
}
