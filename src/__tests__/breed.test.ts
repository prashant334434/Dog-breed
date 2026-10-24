import { normalizeBreed, normalizeGroup, parseRange, sizeBandFor } from '../domain/breed';
import fixture from './fixtures/breed.json';

// Build messy variants from one real API record.
const withAttrs = (patch: Record<string, unknown>) => ({ ...fixture, attributes: { ...fixture.attributes, ...patch } });

describe('normalizeBreed', () => {
  it('maps a real API record', () => {
    const b = normalizeBreed(fixture);
    expect(b).toMatchObject({
      name: 'Affenpinscher',
      groupId: 'f56dc4b1-ba1a-4454-8ce2-bd5d41404a0c',
      hypoallergenic: true,
      sizeBand: 'small',
      life: { min: 14, max: 16 },
    });
    expect(b?.traits.good_with_children).toBe(3);
    expect(b?.temperament).toContain('playful');
    expect(b?.images[0]?.author).toBe('Futurebreak');
    expect(b?.searchText).toContain('monkey terrier');
  });

  it('treats wire as a coat filter even though the API puts it in coat.type', () => {
    expect(normalizeBreed(fixture)?.coatFilters).toEqual(['short', 'wire']);
  });

  it('degrades gracefully on null / empty nested objects', () => {
    const b = normalizeBreed(
      withAttrs({
        coat: null,
        traits: null,
        origin: null,
        male_height: {},
        female_height: {},
        other_names: null,
        recognized_by: null,
      }),
    );
    expect(b).not.toBeNull();
    expect(b?.coat).toEqual({ type: null, length: null, colors: [] });
    expect(b?.traits).toEqual({});
    expect(b?.height).toEqual({ male: null, female: null });
    expect(b?.origin).toEqual({ era: null, region: null, country: null });
    expect(b?.otherNames).toEqual([]);
  });

  it('drops images with no usable URL and keeps missing attribution as null', () => {
    const b = normalizeBreed(
      withAttrs({ images: [{ id: 'x' }, { id: 'y', thumb: 'https://t', attribution: { license: 'CC0' } }, 'garbage'] }),
    );
    expect(b?.images).toHaveLength(1);
    expect(b?.images[0]).toMatchObject({
      thumb: 'https://t',
      medium: 'https://t',
      large: 'https://t',
      author: null,
      license: 'CC0',
    });
  });

  it('rejects records without id or name', () => {
    expect(normalizeBreed({ attributes: { name: 'X' } })).toBeNull();
    expect(normalizeBreed({ id: '1', attributes: { name: '  ' } })).toBeNull();
    expect(normalizeBreed(null)).toBeNull();
  });

  it('trims and de-duplicates string lists', () => {
    const b = normalizeBreed(withAttrs({ other_names: ['Affen', ' Affen ', '', null, 'Monkey Dog'] }));
    expect(b?.otherNames).toEqual(['Affen', 'Monkey Dog']);
  });

  it('ignores non-numeric trait scores', () => {
    const b = normalizeBreed(withAttrs({ traits: { energy: '5', barking: 2, temperament: ['calm', 3] } }));
    expect(b?.traits).toEqual({ barking: 2 });
    expect(b?.temperament).toEqual(['calm']);
  });
});

describe('parseRange', () => {
  it('fills a missing bound and fixes inverted ranges', () => {
    expect(parseRange({ min: 5 })).toEqual({ min: 5, max: 5 });
    expect(parseRange({ min: 9, max: 3 })).toEqual({ min: 3, max: 9 });
    expect(parseRange({})).toBeNull();
    expect(parseRange('12')).toBeNull();
  });
});

describe('sizeBandFor', () => {
  const w = (max: number) => ({ male: { min: 1, max }, female: null });
  const none = { male: null, female: null };
  it.each([
    [10, 'small'],
    [11, 'medium'],
    [25, 'medium'],
    [45, 'large'],
    [46, 'giant'],
  ])('%skg -> %s', (kg, band) => expect(sizeBandFor(w(kg), none)).toBe(band));

  it('falls back to height, then null', () => {
    expect(sizeBandFor(none, { male: { min: 60, max: 70 }, female: null })).toBe('giant');
    expect(sizeBandFor(none, none)).toBeNull();
  });
});

describe('normalizeGroup', () => {
  it('derives a short label', () => {
    expect(normalizeGroup({ id: 'g', attributes: { name: 'Herding Group' } })?.label).toBe('Herding');
    expect(normalizeGroup({ id: 'g', attributes: { name: 'Miscellaneous Class' } })?.label).toBe('Miscellaneous');
    expect(normalizeGroup({ id: 'g', attributes: { name: 'Foundation Stock Service' } })?.label).toBe(
      'Foundation Stock Service',
    );
  });
});
