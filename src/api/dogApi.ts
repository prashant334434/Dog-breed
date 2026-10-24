import { config } from '../config';
import { isRecord, normalizeBreed, normalizeGroup, type Breed, type Group } from '../domain/breed';
import { fetchJson } from './http';

const dataArray = (json: unknown, what: string): unknown[] => {
  if (!isRecord(json) || !Array.isArray(json.data)) throw new Error(`Malformed ${what} response`);
  return json.data;
};

const compact = <T>(items: (T | null)[]) => items.filter((i): i is T => i !== null);

const pageUrl = (page: number) =>
  `${config.apiBaseUrl}/breeds?page%5Bnumber%5D=${page}&page%5Bsize%5D=${config.pageSize}`;

async function fetchBreedPage(page: number): Promise<{ breeds: Breed[]; lastPage: number }> {
  const json = await fetchJson(pageUrl(page));
  const breeds = compact(dataArray(json, 'breeds').map(normalizeBreed));
  // `last` is omitted on the final page; fall back to records / pageSize.
  const pagination =
    isRecord(json) && isRecord(json.meta) && isRecord(json.meta.pagination) ? json.meta.pagination : {};
  const last = typeof pagination.last === 'number' ? pagination.last : null;
  const records = typeof pagination.records === 'number' ? pagination.records : null;
  return { breeds, lastPage: last ?? (records ? Math.ceil(records / config.pageSize) : page) };
}

interface BreedsSnapshot {
  breeds: Breed[];
  totalPages: number;
  failedPages: number[];
}

/**
 * Page 1 tells us how many pages exist; the rest are fetched in parallel. Each page retries
 * independently, so one flaky page degrades to a partial result instead of failing the sync.
 * Results are de-duplicated by id because offset pagination can shift if the dataset changes mid-sync.
 */
export async function fetchAllBreeds(
  onPage?: (breeds: Breed[], done: number, total: number) => void,
): Promise<BreedsSnapshot> {
  const first = await fetchBreedPage(1);
  const total = Math.max(1, first.lastPage);
  let done = 1;
  onPage?.(first.breeds, done, total);

  const rest = Array.from({ length: total - 1 }, (_, i) => i + 2);
  const results = await Promise.allSettled(
    rest.map((page) =>
      fetchBreedPage(page).then(({ breeds }) => {
        onPage?.(breeds, ++done, total);
        return breeds;
      }),
    ),
  );

  const byId = new Map(first.breeds.map((b) => [b.id, b]));
  const failedPages: number[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') r.value.forEach((b) => byId.set(b.id, b));
    else {
      failedPages.push(i + 2);
      if (__DEV__) console.warn(`Breeds page ${i + 2} failed`, r.reason);
    }
  });
  return { breeds: [...byId.values()], totalPages: total, failedPages };
}

export async function fetchBreed(id: string): Promise<Breed | null> {
  const json = await fetchJson(`${config.apiBaseUrl}/breeds/${encodeURIComponent(id)}`);
  return isRecord(json) ? normalizeBreed(json.data) : null;
}

export async function fetchGroups(): Promise<Group[]> {
  return compact(dataArray(await fetchJson(`${config.apiBaseUrl}/groups`), 'groups').map(normalizeGroup));
}
