import { fetchAllBreeds } from '../api/dogApi';
import { fetchJson, HttpError } from '../api/http';
import fixture from './fixtures/breed.json';

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
const fetchMock = jest.fn<Promise<Response>, [string]>();
globalThis.fetch = fetchMock as unknown as typeof fetch;
const fast = { baseDelayMs: 1 };

beforeEach(() => fetchMock.mockReset());

describe('fetchJson', () => {
  it('retries 5xx and network errors, then succeeds', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce(json({}, 503))
      .mockResolvedValueOnce(json({ ok: 1 }));
    await expect(fetchJson('u', fast)).resolves.toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry a 404', async () => {
    fetchMock.mockResolvedValue(json({}, 404));
    await expect(fetchJson('u', fast)).rejects.toBeInstanceOf(HttpError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after the retry budget', async () => {
    fetchMock.mockResolvedValue(json({}, 500));
    await expect(fetchJson('u', { ...fast, retries: 2 })).rejects.toThrow('HTTP 500');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('backs off exponentially', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5); // jitter factor 1
    const delays: number[] = [];
    const realSetTimeout = globalThis.setTimeout;
    const spy = jest.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
      if (ms !== 15_000) delays.push(ms ?? 0); // ignore the per-request timeout timer
      return realSetTimeout(fn, 0);
    }) as typeof setTimeout);
    fetchMock.mockResolvedValue(json({}, 500));
    await expect(fetchJson('u', { baseDelayMs: 100, retries: 3 })).rejects.toThrow();
    expect(delays).toEqual([100, 200, 400]);
    spy.mockRestore();
    jest.restoreAllMocks();
  });
});

const breed = (id: string) => ({ ...fixture, id });
const page = (ids: string[], last?: number) =>
  json({ data: ids.map(breed), meta: { pagination: { records: 283, ...(last ? { last } : {}) } } });

describe('fetchAllBreeds', () => {
  it('merges every page and de-duplicates records that shift between pages', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const n = Number(/page%5Bnumber%5D=(\d+)/.exec(url)?.[1]);
      if (n === 1) return page(['a', 'b'], 6);
      return page([`p${n}`, n === 2 ? 'b' : `q${n}`]);
    });
    const onPage = jest.fn();
    const result = await fetchAllBreeds(onPage);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('page%5Bsize%5D=48');
    expect(result.failedPages).toEqual([]);
    expect(result.totalPages).toBe(6);
    expect(result.breeds).toHaveLength(2 + 5 + 4); // 'b' duplicated on page 2
    expect(onPage).toHaveBeenLastCalledWith(expect.any(Array), 6, 6);
  });

  it('returns a partial snapshot when a page keeps failing', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0); // shortest backoff
    fetchMock.mockImplementation(async (url: string) => {
      const n = Number(/page%5Bnumber%5D=(\d+)/.exec(url)?.[1]);
      if (n === 4) return json({}, 500);
      return n === 1 ? page(['a'], 6) : page([`p${n}`]);
    });
    const result = await fetchAllBreeds();
    expect(result.failedPages).toEqual([4]);
    expect(result.breeds.map((b) => b.id).sort()).toEqual(['a', 'p2', 'p3', 'p5', 'p6']);
    expect(fetchMock.mock.calls.filter(([u]) => u.includes('number%5D=4'))).toHaveLength(4); // 1 + 3 retries
    jest.restoreAllMocks();
  }, 10_000);

  it('derives page count from records when meta.last is missing', async () => {
    fetchMock.mockResolvedValue(page(['a']));
    expect((await fetchAllBreeds()).totalPages).toBe(6);
  });

  it('rejects when page 1 is malformed', async () => {
    fetchMock.mockResolvedValue(json({ errors: [] }));
    await expect(fetchAllBreeds()).rejects.toThrow('Malformed breeds response');
  });
});
