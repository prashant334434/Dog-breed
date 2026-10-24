import * as SQLite from 'expo-sqlite';
import { loadSnapshot, saveBreeds } from '../db/database';
import { normalizeBreed, type Breed } from '../domain/breed';
import fixture from './fixtures/breed.json';

// Fake synchronous connection that records SQL, so we can assert what the cache layer does.
const sql: string[] = [];
let rows: { data: string }[] = [];
const fakeDb = {
  execSync: (s: string) => void sql.push(s),
  getFirstSync: (s: string) => (s.includes('user_version') ? { user_version: 0 } : null),
  getAllSync: (s: string) => (s.includes('FROM breeds') ? rows : []),
  runSync: (s: string) => void sql.push(s),
  prepareSync: (s: string) => ({ executeSync: () => void sql.push(s), finalizeSync: () => {} }),
  withTransactionSync: (task: () => void) => {
    sql.push('BEGIN');
    task();
    sql.push('COMMIT');
  },
};
jest.mock('expo-sqlite', () => ({ openDatabaseSync: jest.fn() }));
jest.mocked(SQLite.openDatabaseSync).mockReturnValue(fakeDb as unknown as SQLite.SQLiteDatabase);

const breed = normalizeBreed(fixture) as Breed;
beforeEach(() => (sql.length = 0));

it('only uses the synchronous API (async results race the JS thread in Release builds)', () => {
  expect(Object.keys(fakeDb).every((k) => k.endsWith('Sync'))).toBe(true);
  expect(() => loadSnapshot()).not.toThrow();
});

it('creates the schema when the stored version differs', () => {
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../db/database').loadSnapshot();
  });
  expect(sql.join(' ')).toMatch(
    /DROP TABLE IF EXISTS breeds.*CREATE TABLE IF NOT EXISTS breeds.*PRAGMA user_version = \d+/s,
  );
});

it('saves a snapshot in one transaction and prunes only when asked', () => {
  saveBreeds([breed, breed]);
  expect(sql).toEqual([
    'BEGIN',
    expect.stringContaining('INSERT OR REPLACE'),
    expect.stringContaining('INSERT OR REPLACE'),
    'COMMIT',
  ]);
  sql.length = 0;
  saveBreeds([breed], { prune: true });
  expect(sql.at(-2)).toContain('DELETE FROM breeds WHERE synced_at <');
});

it('drops rows that are not valid breeds when reading the cache', () => {
  rows = [{ data: JSON.stringify(breed) }, { data: '{"id": 1}' }];
  expect(loadSnapshot().breeds.map((b) => b.name)).toEqual(['Affenpinscher']);
});
