# Technical decisions

Each entry: what was chosen, what it was weighed against, and why. Findings from profiling the live API come first, because several decisions rest on them.

## 0. What the source data actually looks like

Before writing any types I pulled all 283 records and profiled them. These findings shaped the parser and the filters:

| Finding | Count | Handling |
|---|---|---|
| The default page size is **30 (10 pages)**, not 48 | n/a | Always send `page[size]=48` → 6 pages. A client relying on the default silently makes 10 requests. |
| `meta.pagination.last` is **missing on the last page** | 1 page | Page count = `last ?? ceil(records / pageSize)` |
| `male_height` / `female_height` are **`{}`** (empty object, not null) | 4 / 6 | `parseRange` returns `null`; UI shows "Unknown" |
| `coat`, `traits`, `origin` null or empty | 1–2 each | Each degrades to empty fields; the breed still lists |
| `"wire"` lives in **`coat.type`**, not `coat.length` | 35 | The coat filter's "Wire" matches `coat.type === 'wire'` (so a breed can be both Short and Wire) |
| `"hairless"` is a coat length the spec doesn't list | 4 | Added as a fifth coat option rather than dropping those breeds |
| Up to **10** images (spec says 9) | 78 breeds | No fixed-size assumptions |
| Image `attribution.author` missing | 61 images | Shown as "unknown author", never dropped |
| `attribution.license_url` missing | 197 images | License shown as plain text, linked only when a URL exists |
| `origin.era` / `origin.region` missing | 104 / 50 | Shown as "Unknown" |

All of this is handled in one place, `src/domain/breed.ts → normalizeBreed(unknown)`, the only trust boundary between raw JSON and typed data. Everything downstream works with a `Breed` whose fields are non-optional (`T | null` or `[]`). `src/__tests__/breed.test.ts` builds each messy variant from a real API record.

## 1. Expo (managed) running in Expo Go

**Chosen:** Expo SDK 58, with no native code of our own. **Rejected:** bare React Native.

Every dependency (expo-sqlite, expo-image, FlashList v2, NetInfo, react-native-screens) ships in Expo Go, so `npm run ios` works in under 3 minutes with no CocoaPods or Gradle step, which the brief requires. A production build is still one command (`npx expo run:ios --configuration Release`), and that's how the memory numbers in PERFORMANCE.md were measured.

## 2. State management: Zustand

**Chosen:** a single Zustand store (`src/store/breedStore.ts`). **Rejected:** Redux Toolkit, Jotai, Context+Reducer.

- **Normalized cache:** `breedsById` / `groupsById` hold one copy of each record. Rows hold a reference to it, never a copy, and a detail refresh (`GET /breeds/:id`) updates the one entry, which updates both the list and the detail screen.
- **Works outside React.** The sync service (`src/sync/sync.ts`) reads and writes the store directly (`useBreedStore.getState()`). It isn't a component and shouldn't need to be one. With Context this would mean threading dispatch through props or a ref.
- **Selector subscriptions:** the sync banner re-renders on `sync` changes only, not when filters change. Context re-renders every consumer on any change.
- **RTK** would add slices, actions and a provider for about 10 fields and 5 setters. Its strengths (devtools-driven debugging, RTK Query, large teams) don't pay off at this size. **Jotai** fits UI atoms better than an entity cache that a non-React service writes to.
- The store is about 50 lines. Filters and search live there too, so the list and the filter sheet share them without prop drilling.

## 3. Persistence: expo-sqlite

**Chosen:** SQLite (`src/db/database.ts`). **Rejected:** AsyncStorage, WatermelonDB.

- **AsyncStorage:** the normalized dataset is about 1 MB of JSON. On Android, AsyncStorage rows are read through a 2 MB `CursorWindow` and the default total cap is 6 MB, so one blob works today and fails as soon as the payload grows. Splitting it into keys means rebuilding a database badly.
- **WatermelonDB:** needs a native build (JSI adapter), which breaks the "runs in Expo Go" quick start. Its strengths (lazy queries, sync protocol, relations) are for large, writable, synced datasets, not a 283-row read-only catalogue that fits in memory.
- **SQLite** gives atomic multi-row writes, so a crash mid-sync never leaves half a dataset, and per-row upserts for detail refreshes.

**Only the synchronous expo-sqlite API is used. This was found the hard way.** The first iOS **Release** build crashed intermittently with `EXC_BAD_ACCESS` inside Hermes: on cold start with a populated cache, and during syncs. Expo Go (dev and production JS) never reproduced it. How it was tracked down:

1. Crash reports pointed at a different place every time (GC root marking, `JSON.parse`, `recordStackTrace`, a write barrier). That's heap corruption, not a logic bug.
2. Bisecting by count of crash reports gave misleading results: macOS stops writing reports for a process that crashes repeatedly. I switched to **process-liveness checks** (launch, wait, is the PID alive?) and **lldb** (launch suspended, attach, catch the fault).
3. lldb caught the fault with **two threads inside Hermes at once**: the JS thread dispatching a UI event, and a Swift-concurrency cooperative-pool thread in `ExpoSQLite.NativeStatement` → `ExpoModulesJSI.JavaScriptArray.setValueUnchecked` → `HermesRuntimeImpl::setValueAtIndexImpl`. expo-sqlite's async API (via the expo-modules JSI scheduler in this SDK) builds its JS result objects off the JS thread. Hermes isn't thread-safe, so every `*Async` call could corrupt the heap. Pinning expo-sqlite 58.0.9 didn't help, because the race is in the shared async bridge.

**Fix:** `src/db/database.ts` uses only `openDatabaseSync`, `getAllSync`, `withTransactionSync`, `prepareSync`/`executeSync` and `runSync`, which run on the JS thread. Sync calls can't interleave, so no extra locking is needed either.

| Release build, iPhone 17 Pro simulator | Async API | Sync API |
|---|---|---|
| Cold launches with cache, process alive after 8 s | 23/25 | **80/80** |
| Launches that run a full 6-page sync | crashed repeatedly | **30/30** |
| Maestro stress (relaunch + pull-to-refresh) ×5 per round | failed every round | **3/3 rounds** |

**Cost:** measured in dev mode (pessimistic), reading the cache takes 13–20 ms once at startup, and a full 283-row transactional save takes 23–36 ms once per background sync. That's at most ~2 frames once per sync. If it mattered, the save could be chunked across frames. `src/__tests__/database.test.ts` fails if an async method is used again. This is an upstream bug worth reporting to expo with the lldb trace.

**Schema**

```sql
breeds (id TEXT PK, data TEXT /* normalized Breed JSON */, synced_at INTEGER)
groups (id TEXT PK, name TEXT, label TEXT)
meta   (key TEXT PK, value TEXT)          -- 'lastSyncedAt'
PRAGMA user_version = 2                   -- schema version
```

- The **normalized** JSON is stored, not the raw API JSON, so a cold start is just `JSON.parse` with no re-normalizing. If the persisted shape changes, bump `SCHEMA_VERSION`: the tables are dropped and re-synced. That's safe because the DB is a **cache of server data**, never user data, so no migrations are needed.
- **Filtering happens in memory, not in SQL.** Filtering 283 records in JS takes well under a millisecond, and the whole dataset is already in the store. SQL `WHERE` clauses would duplicate the filter logic in two languages. So rows are just `id → JSON`; indexed columns get added the day a query needs them.
- **Pruning** uses `synced_at`: after a *complete* sync, rows older than that sync's timestamp are deleted (breeds removed upstream).

## 4. API layer: a ~30-line `fetchJson`, no React Query

**Chosen:** `src/api/http.ts` (timeout, exponential backoff with jitter) plus `src/api/dogApi.ts`. **Rejected:** React Query, SWR.

React Query's cache would be a **second** cache next to SQLite. Keeping the two consistent (hydrating RQ from SQLite, writing RQ results back) is more code than the problem needs. In this app SQLite + Zustand already *is* the cache, and the remaining pieces RQ would provide are retry, dedupe and refetch triggers:

- **Retry:** `fetchJson` retries network errors, timeouts, 5xx and 429 up to 3 times with `500ms × 2^attempt × jitter(0.5–1.5)`. Other 4xx errors aren't retried (they won't fix themselves). Tested in `api.test.ts`, including the exact backoff schedule.
- **Dedupe:** `syncAll()` keeps one in-flight promise, so pull-to-refresh, reconnect and foreground events share a single run.
- **Refetch triggers:** see §6.

If the app grew paginated, writable or per-user server state, React Query with a SQLite persister would be the next step.

## 5. Assembling 6 pages into one dataset

`fetchAllBreeds()`:

1. Fetch **page 1**. It returns the page count (`last`). If page 1 fails after retries, the sync fails and the cached data stays on screen.
2. Fetch **pages 2–6 in parallel** with `Promise.allSettled`. Each page retries independently, so one flaky page doesn't fail the sync.
3. **Stream** each page into the store as it lands. On first launch the list shows breeds after the first round-trip instead of after six, and the banner shows "page 3 of 6".
4. **Merge by id** into a `Map`. Offset pagination can shift if the dataset changes mid-sync, so a breed can appear on two pages.
5. **Partial results never shrink the cache.** If any page failed, the successful pages are upserted, nothing is pruned, `lastSyncedAt` is *not* advanced (freshness stays honest), and the banner reads "Updated 4 of 6 pages. Some breeds may be out of date."

## 6. Offline-first sync strategy

```
launch ─► hydrate from SQLite (no network) ─► interactive
                     │
                     └─► stale (> 6h) or last sync errored? ──► syncAll() in background
reconnect (offline → online) ─► same check
app foregrounded            ─► same check
pull-to-refresh             ─► syncAll() (forced)
open a breed                ─► refreshBreed(id) via GET /breeds/:id (best effort, silent on failure)
```

- **"Online" means the Dog API answers**, not just that Wi-Fi is up. NetInfo's reachability probe is pointed at `HEAD {API}/groups` instead of Google, so a captive portal or an API outage both show as "Offline · showing saved data".
- **Freshness indicator:** the banner shows one of four states (offline / syncing with page progress / partial-or-failed with Retry / "Last synced 2 hours ago"), re-rendered every 30s. It's an `accessibilityLiveRegion`, so screen readers announce changes.
- **Not done:** sync while the app is killed (expo-background-task). For a read-only catalogue that changes rarely, syncing on launch, foreground and reconnect covers the real need. Add it when data must be fresh *before* the user opens the app.

## 7. Image caching: variants, when to upgrade, size limits

Measured per image: `thumb` 200×200 ≈ 20 KB · `medium` 450×600 ≈ 62 KB · `large` 900×1200 ≈ 196 KB · original `url` ≈ 3.2 MB JPEG.

| Surface | Variant | When cached |
|---|---|---|
| List row (56 pt) | `thumb` of the first image | **Prefetched to disk after every sync**: 283 × ~20 KB ≈ 6 MB, so the whole list works offline |
| Detail hero | `medium`, with `thumb` as instant placeholder | On view |
| Gallery | `large` on Wi-Fi/Ethernet, `medium` on cellular/unknown; `thumb` placeholder | On view |
| Original `url` | **Never downloaded** | Multi-MB and adds nothing at phone resolution |

**Size limits:** iOS uses `Image.configureCache({ maxDiskSize: 150 MB, maxMemoryCost: 32 MB })` (SDWebImage LRU; disk size configurable via `EXPO_PUBLIC_IMAGE_DISK_CACHE_MB`). The memory cap was lowered from 64 MB to 32 MB after Release profiling: peak memory while flinging all 283 rows dropped from 158 MB to ~146 MB, with no measurable FPS change. Android uses Glide's built-in 250 MB LRU disk cache. No custom eviction code: both platforms already evict least-recently-used entries natively. Because the thumbs are always the most recently prefetched, they're the last thing evicted.

**Known edge:** offline, the gallery requests `medium`. If a photo was only ever viewed on Wi-Fi (`large`), the cached `thumb` placeholder shows instead. That's acceptable degradation, not a broken image.

## 8. List performance: payload richness per row, not row count (requested callout)

283 rows is a small list. The real cost is that **each record is heavy**: 11 trait scores, temperament array, coat, origin, two weight and two height ranges, other names, kennel clubs and up to 10 images × 4 URLs + attribution (~3.5 KB of JSON per breed). Virtualization alone doesn't help if every mounted row walks that structure on render. What I did:

1. **Normalize once, at ingest, off the render path.** `normalizeBreed` precomputes everything the list needs as flat scalars: `sizeBand`, `coatFilters`, `searchText` (name + other names, lowercased, accent-stripped). Filtering and search never touch nested data, and nothing is re-derived per frame.
2. **Rows read only a few scalars + one 200 px thumb.** `BreedRow` uses `name`, `sizeBand`, `coat.length`, `hypoallergenic` and `images[0].thumb`. Traits, origin, the other images and attribution aren't read until the detail screen.
3. **Pass references, not copies.** List items hold a reference to the normalized record, so building the list allocates no per-row objects beyond a tiny `{type, key, breed}` wrapper, and `React.memo` on the row compares by reference.
4. **FlashList v2 with recycling:** `getItemType` separates header and row pools, `recyclingKey` on `expo-image` stops a recycled cell flashing the previous breed's photo, and grouping uses flattened sticky headers (one list, not nested lists).
5. **Right-sized images:** list thumbnails are 200 px webp (~20 KB) rather than `medium`/`large`. Decoded bitmap memory is about 160 KB per visible thumb instead of about 2 MB for a decoded `medium`.
6. **The trade-off:** the store keeps the *whole* rich record in memory, about 1 MB for 283 breeds, instead of a slim list model plus on-demand detail reads from SQLite. At this size that's cheap and makes detail navigation instant and fully offline. If the catalogue grew 10–100×, I'd keep a slim `BreedSummary` in the store and load full records per screen from SQLite.

Results are in [PERFORMANCE.md](PERFORMANCE.md): ~57 fps delivered in a Release build while flinging all 283 rows (93% of frames on time), and RN Perf Monitor at 60 UI / 60 JS fps in dev.

## 9. Derived buckets

- **Size band** uses the heaviest adult weight (max of male/female `max`, in kg): small ≤ 10 · medium ≤ 25 · large ≤ 45 · giant > 45. The cut points sit near the dataset's quartiles (12 / 25 / 35 kg) and match common owner language. If weight is missing it falls back to height (≤ 35 / 55 / 65 cm). If both are missing, the band is `null`, and an active size filter excludes that breed rather than guessing.
- **Filter semantics:** OR within a category, AND across categories. "Toy or Terrier, *and* hypoallergenic, *and* good with children ≥ 4." Trait thresholds offer 3+, 4+ and 5.

## 10. Navigation

React Navigation 7 native-stack with a typed `RootStackParamList` and a global `ReactNavigation.RootParamList` declaration, so `navigation.navigate('BreedDetail', { id })` is type-checked everywhere. Filters is a native modal sheet. Deep links: `dogbreeds://breed/<id>?tab=Traits`, `dogbreeds://filters`. The **selected detail tab lives in the route params** (`setParams`), not `useState`, so deep links and taps share one source of truth, with no effect syncing state to props. React Navigation was chosen over Expo Router because there are three screens, and an explicit navigator file is easier to read than a file-based route tree.

## 11. Error handling

- `ErrorBoundary` wraps each screen (list, filters, detail) **and each detail tab** (keyed by tab, so switching tabs resets it). A bad record that crashes the Traits tab leaves Overview and Gallery usable, and the fallback offers "Try again".
- Network errors never surface as exceptions in the UI: they become banner states (§6) and the cached data stays on screen.
- No `any`: ESLint enforces `@typescript-eslint/no-explicit-any: error`. Raw JSON enters as `unknown` and is narrowed by `isRecord` and the typed parsers. `tsconfig` adds `noUncheckedIndexedAccess` on top of `strict`.

## 12. UI and accessibility

The visual direction came from the ui-ux-pro-max design system ("pet app" profile): caring teal (`#0F766E`) + warm orange accent, Nunito type, soft rounded cards, low motion. All colours are semantic tokens in `src/ui/theme.ts` with separate light and dark sets, and text pairs meet 4.5:1. Accessibility:

- Every control has a role and label. Chips are `checkbox`es with `checked` state. Tabs use `tablist`/`tab` with `selected` state.
- Trait bars are announced as "Good With Children: 4 out of 5", not as 5 anonymous views.
- Fact rows are grouped ("Life span: 14–16 years").
- Touch targets are at least 44 pt.
- Decorative icons are hidden from screen readers.
- The sync banner is a live region.

## 13. Deliberately not built

| Skipped | Add when |
|---|---|
| Sync while the app is killed (expo-background-task) | Data must be fresh before the app opens |
| Full-screen pinch-zoom viewer | Users need detail beyond `large` |
| Favourites / comparison | Product asks; would be the first *user* data, so it would get its own table and real migrations |
| Custom Android image-cache size | Glide's 250 MB LRU proves too large for target devices |
| i18n | A second locale is needed |
