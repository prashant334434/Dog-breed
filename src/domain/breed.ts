// Domain types + the single trust boundary where raw API JSON (`unknown`) becomes a typed Breed.
// Source data is messy: empty `{}` height objects, null coat/traits/origin, missing image authors,
// "wire" living in coat.type rather than coat.length, "hairless" as a length. All handled here once.

export interface Range {
  min: number;
  max: number;
}

export const TRAIT_KEYS = [
  'energy',
  'barking',
  'drooling',
  'grooming',
  'shedding',
  'trainability',
  'good_with_dogs',
  'exercise_minutes',
  'apartment_friendly',
  'good_with_children',
  'good_with_strangers',
] as const;
export type TraitKey = (typeof TRAIT_KEYS)[number];

export const SIZE_BANDS = ['small', 'medium', 'large', 'giant'] as const;
export type SizeBand = (typeof SIZE_BANDS)[number];

export const COAT_FILTERS = ['short', 'medium', 'long', 'wire', 'hairless'] as const;
export type CoatFilter = (typeof COAT_FILTERS)[number];

export interface BreedImage {
  id: string;
  thumb: string;
  medium: string;
  large: string;
  author: string | null;
  license: string | null;
  licenseUrl: string | null;
  source: string | null;
  sourceUrl: string | null;
}

export interface Breed {
  id: string;
  name: string;
  description: string | null;
  groupId: string | null;
  life: Range | null;
  weight: { male: Range | null; female: Range | null };
  height: { male: Range | null; female: Range | null };
  hypoallergenic: boolean | null;
  origin: { era: string | null; region: string | null; country: string | null };
  coat: { type: string | null; length: string | null; colors: string[] };
  traits: Partial<Record<TraitKey, number>>;
  temperament: string[];
  otherNames: string[];
  recognizedBy: string[];
  images: BreedImage[];
  // Derived once at ingest so list rows and filters never touch nested data.
  sizeBand: SizeBand | null;
  coatFilters: CoatFilter[];
  searchText: string;
}

export interface Group {
  id: string;
  name: string;
  label: string;
}

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
// De-duplicated: list values are rendered as React keys (tags, chips).
const strs = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map(str).filter((s): s is string => s !== null))] : []);
const rec = (v: unknown) => (isRecord(v) ? v : {});

export function parseRange(v: unknown): Range | null {
  const r = rec(v);
  const min = num(r.min) ?? num(r.max);
  const max = num(r.max) ?? num(r.min);
  if (min === null || max === null) return null;
  return min <= max ? { min, max } : { min: max, max: min };
}

const maxOf = (...ranges: (Range | null)[]) =>
  ranges.reduce<number | null>((acc, r) => (r && (acc === null || r.max > acc) ? r.max : acc), null);

/** Buckets by heaviest adult weight (kg); falls back to tallest height (cm) if weight is missing. */
export function sizeBandFor(weight: Breed['weight'], height: Breed['height']): SizeBand | null {
  const kg = maxOf(weight.male, weight.female);
  if (kg !== null) return kg <= 10 ? 'small' : kg <= 25 ? 'medium' : kg <= 45 ? 'large' : 'giant';
  const cm = maxOf(height.male, height.female);
  if (cm !== null) return cm <= 35 ? 'small' : cm <= 55 ? 'medium' : cm <= 65 ? 'large' : 'giant';
  return null;
}

function coatFiltersFor(coat: Breed['coat']): CoatFilter[] {
  const tags = COAT_FILTERS.filter((c) => c === coat.length);
  if (coat.type === 'wire' && !tags.includes('wire')) tags.push('wire');
  return tags;
}

export const normalizeText = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function parseImage(v: unknown): BreedImage | null {
  const r = rec(v);
  const thumb = str(r.thumb) ?? str(r.medium) ?? str(r.url);
  const medium = str(r.medium) ?? str(r.large) ?? str(r.url) ?? thumb;
  const large = str(r.large) ?? str(r.url) ?? medium;
  const id = str(r.id) ?? thumb;
  if (!id || !thumb || !medium || !large) return null;
  const a = rec(r.attribution);
  return {
    id,
    thumb,
    medium,
    large,
    author: str(a.author),
    license: str(a.license),
    licenseUrl: str(a.license_url),
    source: str(a.source),
    sourceUrl: str(a.source_url),
  };
}

/** Returns null for records without an id or name; every other gap degrades to null/[]. */
export function normalizeBreed(resource: unknown): Breed | null {
  const r = rec(resource);
  const a = rec(r.attributes);
  const id = str(r.id);
  const name = str(a.name);
  if (!id || !name) return null;

  const rawTraits = rec(a.traits);
  const traits: Breed['traits'] = {};
  for (const key of TRAIT_KEYS) {
    const value = num(rawTraits[key]);
    if (value !== null) traits[key] = value;
  }
  const origin = rec(a.origin);
  const coatRaw = rec(a.coat);
  const coat = { type: str(coatRaw.type), length: str(coatRaw.length), colors: strs(coatRaw.colors) };
  const weight = { male: parseRange(a.male_weight), female: parseRange(a.female_weight) };
  const height = { male: parseRange(a.male_height), female: parseRange(a.female_height) };
  const otherNames = strs(a.other_names);

  return {
    id,
    name,
    description: str(a.description),
    groupId: str(rec(rec(rec(r.relationships).group).data).id),
    life: parseRange(a.life),
    weight,
    height,
    hypoallergenic: typeof a.hypoallergenic === 'boolean' ? a.hypoallergenic : null,
    origin: { era: str(origin.era), region: str(origin.region), country: str(origin.country) },
    coat,
    traits,
    temperament: strs(rawTraits.temperament),
    otherNames,
    recognizedBy: strs(a.recognized_by),
    images: Array.isArray(a.images) ? a.images.map(parseImage).filter((i): i is BreedImage => i !== null) : [],
    sizeBand: sizeBandFor(weight, height),
    coatFilters: coatFiltersFor(coat),
    searchText: normalizeText([name, ...otherNames].join('|')),
  };
}

export function normalizeGroup(resource: unknown): Group | null {
  const r = rec(resource);
  const id = str(r.id);
  const name = str(rec(r.attributes).name);
  if (!id || !name) return null;
  return { id, name, label: name.replace(/ (Group|Class)$/, '') };
}

/** Light guard for rows read back from our own SQLite cache. */
export const isBreed = (v: unknown): v is Breed =>
  isRecord(v) && typeof v.id === 'string' && typeof v.name === 'string' && Array.isArray(v.images);
