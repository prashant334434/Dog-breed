import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { Image } from 'expo-image';
import { AppState, Platform } from 'react-native';
import { fetchAllBreeds, fetchBreed, fetchGroups } from '../api/dogApi';
import { config } from '../config';
import { loadSnapshot, saveBreeds, saveGroups, setLastSyncedAt, type Snapshot } from '../db/database';
import type { Breed } from '../domain/breed';
import { useBreedStore } from '../store/breedStore';

const store = useBreedStore.getState;
const isOnline = (s: NetInfoState) => s.isConnected !== false && s.isInternetReachable !== false;

export function needsSync(now = Date.now()) {
  const { hydrated, sync } = store();
  if (!hydrated || sync.status === 'syncing') return false;
  return sync.status === 'error' || !sync.lastSyncedAt || now - sync.lastSyncedAt > config.staleAfterMs;
}

// List rows only ever show the first image's thumb (~20 KB webp), so warming those makes the
// whole list work offline for ~6 MB. Medium/large load on demand and are bounded by the LRU cap.
const prefetchThumbs = (breeds: Breed[]) =>
  Image.prefetch(
    breeds.flatMap((b) => b.images[0]?.thumb ?? []),
    'disk',
  ).catch(() => false);

let inflight: Promise<void> | null = null;

/** Full refresh. Concurrent callers (pull-to-refresh, reconnect, foreground) share one run. */
export function syncAll(): Promise<void> {
  return (inflight ??= runSync().finally(() => (inflight = null)));
}

async function runSync() {
  const { setSync, upsertBreeds, setGroups } = store();
  if (!store().isOnline) return;
  setSync({ status: 'syncing', error: null, progress: null });
  try {
    const [groups, snapshot] = await Promise.allSettled([
      fetchGroups(),
      // Stream pages into the store so a first launch shows breeds as soon as page 1 lands.
      fetchAllBreeds((breeds, done, total) => {
        upsertBreeds(breeds);
        setSync({ progress: { done, total } });
      }),
    ]);

    if (groups.status === 'fulfilled' && groups.value.length) {
      setGroups(groups.value);
      saveGroups(groups.value);
    }
    if (snapshot.status === 'rejected') {
      setSync({ status: 'error', error: "Couldn't reach Dog API. Showing saved data.", progress: null });
      return;
    }

    const { breeds, failedPages, totalPages } = snapshot.value;
    const complete = failedPages.length === 0;
    // Only a complete snapshot may delete records; a partial one must never shrink the cache.
    upsertBreeds(breeds, { replace: complete });
    saveBreeds(breeds, { prune: complete });
    void prefetchThumbs(breeds);

    if (complete && groups.status === 'fulfilled') {
      const now = Date.now();
      setLastSyncedAt(now);
      setSync({ status: 'idle', lastSyncedAt: now, error: null, progress: null });
    } else {
      const error = complete
        ? "Breed groups couldn't refresh. Showing saved groups."
        : `Updated ${totalPages - failedPages.length} of ${totalPages} pages. Some breeds may be out of date.`;
      setSync({ status: 'error', error, progress: null });
    }
  } catch (e) {
    setSync({ status: 'error', error: e instanceof Error ? e.message : 'Sync failed', progress: null });
  }
}

/** Detail enrichment: best effort, cached record stays on screen if this fails. */
export async function refreshBreed(id: string) {
  if (!store().isOnline) return;
  try {
    const breed = await fetchBreed(id);
    if (!breed) return;
    store().upsertBreeds([breed]);
    saveBreeds([breed]);
  } catch {
    // Offline-first: a failed enrichment is not an error worth interrupting the user for.
  }
}

/** Hydrate from SQLite (fast path to interactive), then sync in the background if stale. */
export async function bootstrap() {
  // "Online" means our API answers, not just that Wi-Fi is up (captive portals, API outages).
  // Must run before subscribeToConnectivity() adds its listener.
  NetInfo.configure({
    reachabilityUrl: `${config.apiBaseUrl}/groups`,
    reachabilityMethod: 'HEAD',
    reachabilityTest: async (res) => res.ok,
    useNativeReachability: false, // native checks ignore reachabilityUrl on iOS
  });
  if (Platform.OS === 'ios') {
    // Android's Glide already enforces a 250 MB LRU disk cache.
    Image.configureCache({ maxDiskSize: config.imageDiskCacheBytes, maxMemoryCost: 32 * 1024 * 1024 });
  }
  let snapshot: Snapshot | null = null;
  try {
    snapshot = loadSnapshot();
  } catch {
    // Unreadable cache: start empty; the sync below refills it.
  }
  const { upsertBreeds, setGroups, setSync } = store();
  if (snapshot) {
    upsertBreeds(snapshot.breeds, { replace: true });
    setGroups(snapshot.groups);
    setSync({ lastSyncedAt: snapshot.lastSyncedAt });
  }
  useBreedStore.setState({ hydrated: true, isOnline: isOnline(await NetInfo.fetch()) });
  if (needsSync()) void syncAll();
}

/** Background sync when the network returns or the app comes back to the foreground. */
export function subscribeToConnectivity(): () => void {
  const unsubscribeNet = NetInfo.addEventListener((state) => {
    const online = isOnline(state);
    const wasOnline = store().isOnline;
    if (online !== wasOnline) useBreedStore.setState({ isOnline: online });
    if (online && !wasOnline && needsSync()) void syncAll();
  });
  const appState = AppState.addEventListener('change', (s) => {
    if (s === 'active' && store().isOnline && needsSync()) void syncAll();
  });
  return () => {
    unsubscribeNet();
    appState.remove();
  };
}
