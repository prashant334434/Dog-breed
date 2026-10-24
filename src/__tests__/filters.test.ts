import { normalizeBreed, type Breed, type Group } from '../domain/breed';
import { activeFilterCount, buildListItems, EMPTY_FILTERS, type Filters } from '../domain/filters';
import fixture from './fixtures/breed.json';

const make = (id: string, name: string, attrs: Record<string, unknown>, groupId = 'toy'): Breed => {
  const b = normalizeBreed({
    ...fixture,
    id,
    relationships: { group: { data: { id: groupId } } },
    attributes: { ...fixture.attributes, name, ...attrs },
  });
  if (!b) throw new Error('fixture failed to normalize');
  return b;
};

const breeds = [
  make('1', 'Affenpinscher', {}),
  make(
    '2',
    'Great Dane',
    {
      male_weight: { min: 54, max: 90 },
      hypoallergenic: false,
      coat: { type: 'smooth', length: 'short' },
      other_names: ['Deutsche Dogge'],
    },
    'working',
  ),
  make(
    '3',
    'Poodle',
    {
      other_names: null,
      male_weight: { min: 20, max: 32 },
      coat: { type: 'curly', length: 'long' },
      traits: { ...fixture.attributes.traits, good_with_children: 5 },
    },
    'non-sporting',
  ),
  make('4', 'Chinese Crested', { other_names: null, coat: { type: 'hairless', length: 'hairless' }, traits: null }),
];
const groups: Record<string, Group> = {
  toy: { id: 'toy', name: 'Toy Group', label: 'Toy' },
  working: { id: 'working', name: 'Working Group', label: 'Working' },
  'non-sporting': { id: 'non-sporting', name: 'Non-Sporting Group', label: 'Non-Sporting' },
};

const names = (f: Partial<Filters>, q = '') =>
  buildListItems(breeds, groups, { ...EMPTY_FILTERS, ...f }, q).items.flatMap((i) =>
    i.type === 'row' ? [i.breed.name] : [],
  );

describe('buildListItems', () => {
  it('groups by breed group with sticky header indices and sorted rows', () => {
    const { items, stickyIndices, total } = buildListItems(breeds, groups, EMPTY_FILTERS, '');
    expect(total).toBe(4);
    expect(items.filter((i) => i.type === 'header').map((i) => i.key)).toEqual([
      'h:Non-Sporting',
      'h:Toy',
      'h:Working',
    ]);
    expect(stickyIndices).toEqual([0, 2, 5]);
    expect(names({})).toEqual(['Poodle', 'Affenpinscher', 'Chinese Crested', 'Great Dane']);
  });

  it('searches name and other_names, case and accent insensitive', () => {
    expect(names({}, 'dane')).toEqual(['Great Dane']);
    expect(names({}, 'DEUTSCHE')).toEqual(['Great Dane']);
    expect(names({}, '  monkey terrier ')).toEqual(['Affenpinscher']);
    expect(names({}, 'zzz')).toEqual([]);
  });

  it('ORs within a category and ANDs across categories', () => {
    expect(names({ sizes: ['small', 'giant'] })).toEqual(['Affenpinscher', 'Chinese Crested', 'Great Dane']);
    expect(names({ sizes: ['small', 'giant'], groupIds: ['working'] })).toEqual(['Great Dane']);
  });

  it('filters coat, including wire (coat.type) and hairless', () => {
    expect(names({ coats: ['wire'] })).toEqual(['Affenpinscher']);
    expect(names({ coats: ['hairless', 'long'] })).toEqual(['Poodle', 'Chinese Crested']);
  });

  it('filters hypoallergenic yes/no', () => {
    expect(names({ hypoallergenic: false })).toEqual(['Great Dane']);
  });

  it('applies trait thresholds and excludes unrated breeds', () => {
    expect(names({ traitMins: { good_with_children: 5 } })).toEqual(['Poodle']);
    expect(names({ traitMins: { good_with_children: 3 } })).not.toContain('Chinese Crested');
  });

  it('counts active filters', () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(
      activeFilterCount({
        ...EMPTY_FILTERS,
        sizes: ['small', 'giant'],
        hypoallergenic: false,
        traitMins: { good_with_dogs: 3, good_with_children: undefined },
      }),
    ).toBe(4);
  });
});
