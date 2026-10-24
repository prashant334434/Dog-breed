import { normalizeText, type Breed, type CoatFilter, type Group, type SizeBand } from './breed';

export const FILTER_TRAITS = ['good_with_children', 'good_with_dogs', 'good_with_strangers'] as const;
type FilterTrait = (typeof FILTER_TRAITS)[number];

export interface Filters {
  groupIds: string[];
  sizes: SizeBand[];
  coats: CoatFilter[];
  hypoallergenic: boolean | null;
  traitMins: Partial<Record<FilterTrait, number>>;
}

export const EMPTY_FILTERS: Filters = { groupIds: [], sizes: [], coats: [], hypoallergenic: null, traitMins: {} };

export const activeFilterCount = (f: Filters) =>
  f.groupIds.length +
  f.sizes.length +
  f.coats.length +
  (f.hypoallergenic === null ? 0 : 1) +
  Object.values(f.traitMins).filter(Boolean).length;

/** OR within a category, AND across categories. Unknown values never match an active filter. */
function matches(b: Breed, f: Filters, query: string): boolean {
  if (query && !b.searchText.includes(query)) return false;
  if (f.groupIds.length && !(b.groupId && f.groupIds.includes(b.groupId))) return false;
  if (f.sizes.length && !(b.sizeBand && f.sizes.includes(b.sizeBand))) return false;
  if (f.coats.length && !b.coatFilters.some((c) => f.coats.includes(c))) return false;
  if (f.hypoallergenic !== null && b.hypoallergenic !== f.hypoallergenic) return false;
  for (const trait of FILTER_TRAITS) {
    const min = f.traitMins[trait];
    if (min && (b.traits[trait] ?? 0) < min) return false;
  }
  return true;
}

export type ListItem =
  { type: 'header'; key: string; title: string; count: number } | { type: 'row'; key: string; breed: Breed };

const UNGROUPED = 'Other';

/** Filters, then flattens into header+row items for one virtualized list with sticky headers. */
export function buildListItems(
  breeds: Breed[],
  groupsById: Record<string, Group>,
  filters: Filters,
  rawQuery: string,
): { items: ListItem[]; stickyIndices: number[]; total: number } {
  const query = normalizeText(rawQuery.trim());
  const buckets = new Map<string, Breed[]>();
  for (const b of breeds) {
    if (!matches(b, filters, query)) continue;
    const label = (b.groupId && groupsById[b.groupId]?.label) || UNGROUPED;
    const bucket = buckets.get(label);
    if (bucket) bucket.push(b);
    else buckets.set(label, [b]);
  }

  const items: ListItem[] = [];
  const stickyIndices: number[] = [];
  let total = 0;
  for (const label of [...buckets.keys()].sort()) {
    const group = buckets.get(label) ?? [];
    group.sort((x, y) => x.name.localeCompare(y.name));
    stickyIndices.push(items.length);
    items.push({ type: 'header', key: `h:${label}`, title: label, count: group.length });
    for (const breed of group) items.push({ type: 'row', key: breed.id, breed });
    total += group.length;
  }
  return { items, stickyIndices, total };
}
