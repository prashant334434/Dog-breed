import { useMemo, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COAT_FILTERS, SIZE_BANDS, type SizeBand } from '../../domain/breed';
import { activeFilterCount, buildListItems, EMPTY_FILTERS, FILTER_TRAITS, type Filters } from '../../domain/filters';
import { titleCase } from '../../lib/format';
import type { ScreenProps } from '../../navigation/RootNavigator';
import { useBreedStore } from '../../store/breedStore';
import { Chip } from '../../ui/Chip';
import { ErrorBoundary } from '../../ui/ErrorBoundary';
import { Text } from '../../ui/Text';
import { radius, space, useTheme } from '../../ui/theme';

const SIZE_HINT: Record<SizeBand, string> = { small: '≤10 kg', medium: '10–25 kg', large: '25–45 kg', giant: '45+ kg' };
const TRAIT_STEPS = [3, 4, 5];

const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

export function FiltersScreen(props: ScreenProps<'Filters'>) {
  return (
    <ErrorBoundary name="Filters">
      <FiltersForm {...props} />
    </ErrorBoundary>
  );
}

function FiltersForm({ navigation }: ScreenProps<'Filters'>) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const filters = useBreedStore((s) => s.filters);
  const setFilters = useBreedStore((s) => s.setFilters);
  const groupsById = useBreedStore((s) => s.groupsById);
  const breedsById = useBreedStore((s) => s.breedsById);
  const query = useBreedStore((s) => s.query);

  const groups = useMemo(() => Object.values(groupsById).sort((a, b) => a.label.localeCompare(b.label)), [groupsById]);
  const matchCount = useMemo(
    () => buildListItems(Object.values(breedsById), groupsById, filters, query).total,
    [breedsById, groupsById, filters, query],
  );
  const update = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <Section title="Breed group">
          {groups.length ? (
            groups.map((g) => (
              <Chip
                key={g.id}
                label={g.label}
                selected={filters.groupIds.includes(g.id)}
                onPress={() => update({ groupIds: toggle(filters.groupIds, g.id) })}
              />
            ))
          ) : (
            <Text color="textMuted">Groups load after the first sync.</Text>
          )}
        </Section>

        <Section title="Size" hint="By heaviest adult weight">
          {SIZE_BANDS.map((s) => (
            <Chip
              key={s}
              label={`${titleCase(s)} · ${SIZE_HINT[s]}`}
              selected={filters.sizes.includes(s)}
              onPress={() => update({ sizes: toggle(filters.sizes, s) })}
            />
          ))}
        </Section>

        <Section title="Coat">
          {COAT_FILTERS.map((c) => (
            <Chip
              key={c}
              label={titleCase(c)}
              selected={filters.coats.includes(c)}
              onPress={() => update({ coats: toggle(filters.coats, c) })}
            />
          ))}
        </Section>

        <Section title="Hypoallergenic">
          {[true, false].map((value) => (
            <Chip
              key={String(value)}
              label={value ? 'Yes' : 'No'}
              accessibilityLabel={`Hypoallergenic ${value ? 'yes' : 'no'}`}
              selected={filters.hypoallergenic === value}
              onPress={() => update({ hypoallergenic: filters.hypoallergenic === value ? null : value })}
            />
          ))}
        </Section>

        {FILTER_TRAITS.map((trait) => (
          <Section key={trait} title={titleCase(trait)} hint="Minimum score out of 5">
            {TRAIT_STEPS.map((min) => {
              const selected = filters.traitMins[trait] === min;
              return (
                <Chip
                  key={min}
                  label={min === 5 ? '5 only' : `${min}+`}
                  accessibilityLabel={`${titleCase(trait)} at least ${min}`}
                  selected={selected}
                  onPress={() => update({ traitMins: { ...filters.traitMins, [trait]: selected ? undefined : min } })}
                />
              );
            })}
          </Section>
        ))}
      </ScrollView>

      <View
        style={[
          styles.footer,
          { borderColor: colors.border, backgroundColor: colors.bg, paddingBottom: space.md + insets.bottom },
        ]}
      >
        <Pressable
          onPress={() => setFilters(() => EMPTY_FILTERS)}
          disabled={!activeFilterCount(filters)}
          accessibilityRole="button"
          accessibilityState={{ disabled: !activeFilterCount(filters) }}
          style={({ pressed }) => [
            styles.button,
            styles.reset,
            { borderColor: colors.border, opacity: !activeFilterCount(filters) ? 0.4 : pressed ? 0.7 : 1 },
          ]}
        >
          <Text variant="label">Reset</Text>
        </Pressable>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.button,
            styles.apply,
            { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
          ]}
          testID="apply-filters"
        >
          <Text variant="label" color="onPrimary">
            Show {matchCount} {matchCount === 1 ? 'breed' : 'breeds'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.section} accessibilityRole="none">
      <View style={styles.sectionHead}>
        <Text variant="heading" accessibilityRole="header">
          {title}
        </Text>
        {hint && (
          <Text variant="caption" color="textMuted">
            {hint}
          </Text>
        )}
      </View>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, gap: space.xl },
  section: { gap: space.md },
  sectionHead: { gap: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  footer: {
    flexDirection: 'row',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  button: { minHeight: 50, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  reset: { paddingHorizontal: space.xl, borderWidth: 1.5 },
  apply: { flex: 1 },
});
