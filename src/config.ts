// EXPO_PUBLIC_* vars are inlined at build time; every value has a safe default so `.env` is optional.
const int = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const config = {
  apiBaseUrl: process.env.EXPO_PUBLIC_DOG_API_BASE_URL || 'https://dogapi.dog/api/v2',
  pageSize: int(process.env.EXPO_PUBLIC_PAGE_SIZE, 48),
  staleAfterMs: int(process.env.EXPO_PUBLIC_STALE_AFTER_MINUTES, 360) * 60_000,
  imageDiskCacheBytes: int(process.env.EXPO_PUBLIC_IMAGE_DISK_CACHE_MB, 150) * 1024 * 1024,
};
