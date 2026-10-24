import { create } from 'zustand';
import type { Breed, Group } from '../domain/breed';
import { EMPTY_FILTERS, type Filters } from '../domain/filters';

interface SyncState {
  status: 'idle' | 'syncing' | 'error';
  lastSyncedAt: number | null;
  error: string | null;
  progress: { done: number; total: number } | null;
}

interface BreedState {
  // Normalized entity cache: one copy of each record, looked up by id.
  breedsById: Record<string, Breed>;
  groupsById: Record<string, Group>;
  hydrated: boolean;
  isOnline: boolean;
  sync: SyncState;
  query: string;
  filters: Filters;

  upsertBreeds: (breeds: Breed[], opts?: { replace?: boolean }) => void;
  setGroups: (groups: Group[]) => void;
  setSync: (patch: Partial<SyncState>) => void;
  setQuery: (query: string) => void;
  setFilters: (update: (f: Filters) => Filters) => void;
}

const byId = <T extends { id: string }>(items: T[]) => Object.fromEntries(items.map((i) => [i.id, i]));

export const useBreedStore = create<BreedState>()((set) => ({
  breedsById: {},
  groupsById: {},
  hydrated: false,
  isOnline: true,
  sync: { status: 'idle', lastSyncedAt: null, error: null, progress: null },
  query: '',
  filters: EMPTY_FILTERS,

  upsertBreeds: (breeds, { replace = false } = {}) =>
    set((s) => ({ breedsById: replace ? byId(breeds) : { ...s.breedsById, ...byId(breeds) } })),
  setGroups: (groups) => set({ groupsById: byId(groups) }),
  setSync: (patch) => set((s) => ({ sync: { ...s.sync, ...patch } })),
  setQuery: (query) => set({ query }),
  setFilters: (update) => set((s) => ({ filters: update(s.filters) })),
}));
