import * as api from '../api/dogApi';
import * as db from '../db/database';
import { normalizeBreed, type Breed } from '../domain/breed';
import { useBreedStore } from '../store/breedStore';
import NetInfoModule, { type NetInfoState } from '@react-native-community/netinfo';
import { bootstrap, needsSync, subscribeToConnectivity, syncAll } from '../sync/sync';
import fixture from './fixtures/breed.json';

jest.mock('../api/dogApi');
jest.mock('../db/database');
jest.mock('expo-image', () => ({ Image: { prefetch: jest.fn(async () => true), configureCache: jest.fn() } }));

const api_ = jest.mocked(api);
const db_ = jest.mocked(db);
const breed = (id: string) => normalizeBreed({ ...fixture, id }) as Breed;
const group = { id: 'g', name: 'Toy Group', label: 'Toy' };
const initial = useBreedStore.getState();

beforeEach(() => {
  jest.clearAllMocks();
  useBreedStore.setState(initial, true);
  useBreedStore.setState({ hydrated: true, isOnline: true, breedsById: { old: breed('old'), a: breed('a') } });
  api_.fetchGroups.mockResolvedValue([group]);
});

const ids = () => Object.keys(useBreedStore.getState().breedsById).sort();

it('complete sync replaces the cache, prunes removed breeds and stamps lastSyncedAt', async () => {
  api_.fetchAllBreeds.mockResolvedValue({ breeds: [breed('a'), breed('b')], totalPages: 6, failedPages: [] });
  await syncAll();
  expect(ids()).toEqual(['a', 'b']);
  expect(db_.saveBreeds).toHaveBeenCalledWith(expect.any(Array), { prune: true });
  expect(db_.setLastSyncedAt).toHaveBeenCalled();
  expect(useBreedStore.getState().sync).toMatchObject({ status: 'idle', error: null });
  expect(useBreedStore.getState().sync.lastSyncedAt).toEqual(expect.any(Number));
});

it('partial failure keeps cached breeds, never prunes, and reports which pages failed', async () => {
  api_.fetchAllBreeds.mockResolvedValue({ breeds: [breed('b')], totalPages: 6, failedPages: [3, 5] });
  await syncAll();
  expect(ids()).toEqual(['a', 'b', 'old']);
  expect(db_.saveBreeds).toHaveBeenCalledWith(expect.any(Array), { prune: false });
  expect(db_.setLastSyncedAt).not.toHaveBeenCalled();
  expect(useBreedStore.getState().sync).toMatchObject({
    status: 'error',
    error: expect.stringContaining('4 of 6 pages'),
  });
});

it('total failure leaves the cache untouched and shows an error', async () => {
  api_.fetchAllBreeds.mockRejectedValue(new Error('offline'));
  await syncAll();
  expect(ids()).toEqual(['a', 'old']);
  expect(db_.saveBreeds).not.toHaveBeenCalled();
  expect(useBreedStore.getState().sync.status).toBe('error');
});

it('does nothing while offline', async () => {
  useBreedStore.setState({ isOnline: false });
  await syncAll();
  expect(api_.fetchAllBreeds).not.toHaveBeenCalled();
});

it('dedupes concurrent sync calls into one run', async () => {
  api_.fetchAllBreeds.mockResolvedValue({ breeds: [], totalPages: 6, failedPages: [] });
  await Promise.all([syncAll(), syncAll(), syncAll()]);
  expect(api_.fetchAllBreeds).toHaveBeenCalledTimes(1);
});

it('needsSync: never synced, stale, or errored', () => {
  const now = Date.now();
  const setSync = useBreedStore.getState().setSync;
  setSync({ lastSyncedAt: null });
  expect(needsSync(now)).toBe(true);
  setSync({ lastSyncedAt: now - 60_000 });
  expect(needsSync(now)).toBe(false);
  setSync({ lastSyncedAt: now - 7 * 3_600_000 });
  expect(needsSync(now)).toBe(true);
  setSync({ lastSyncedAt: now, status: 'error' });
  expect(needsSync(now)).toBe(true);
});

it('bootstrap hydrates from SQLite and skips network when cache is fresh', async () => {
  useBreedStore.setState(initial, true);
  db_.loadSnapshot.mockReturnValue({ breeds: [breed('cached')], groups: [group], lastSyncedAt: Date.now() });
  await bootstrap();
  expect(ids()).toEqual(['cached']);
  expect(useBreedStore.getState().hydrated).toBe(true);
  expect(api_.fetchAllBreeds).not.toHaveBeenCalled();
});

it('bootstrap with an empty cache starts the first sync', async () => {
  useBreedStore.setState(initial, true);
  db_.loadSnapshot.mockReturnValue({ breeds: [], groups: [], lastSyncedAt: null });
  api_.fetchAllBreeds.mockResolvedValue({ breeds: [breed('a')], totalPages: 6, failedPages: [] });
  await bootstrap();
  await syncAll(); // joins the in-flight run
  expect(api_.fetchAllBreeds).toHaveBeenCalledTimes(1);
  expect(ids()).toEqual(['a']);
});

it('syncs in the background when the network comes back, and only then', async () => {
  const NetInfo = jest.mocked(NetInfoModule);
  api_.fetchAllBreeds.mockResolvedValue({ breeds: [breed('a')], totalPages: 6, failedPages: [] });
  useBreedStore.setState({ isOnline: false });
  useBreedStore.getState().setSync({ status: 'error' });
  const unsubscribe = subscribeToConnectivity();
  const listener = NetInfo.addEventListener.mock.calls.at(-1)?.[0];
  if (!listener) throw new Error('no NetInfo listener registered');

  const state = (isConnected: boolean) => ({ isConnected, isInternetReachable: isConnected }) as NetInfoState;
  listener(state(false));
  expect(api_.fetchAllBreeds).not.toHaveBeenCalled();
  listener(state(true));
  await syncAll(); // joins the run the listener started
  expect(useBreedStore.getState().isOnline).toBe(true);
  expect(api_.fetchAllBreeds).toHaveBeenCalledTimes(1);
  listener(state(true)); // still online: no new sync
  expect(api_.fetchAllBreeds).toHaveBeenCalledTimes(1);
  unsubscribe();
});
