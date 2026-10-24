import { StyleSheet, View } from 'react-native';
import { TRAIT_KEYS, type Breed, type TraitKey } from '../../domain/breed';
import { titleCase } from '../../lib/format';
import { Text } from '../../ui/Text';
import { radius, space, useTheme } from '../../ui/theme';
import { Tags } from './OverviewTab';

const SEGMENTS = [1, 2, 3, 4, 5];
const MAX_EXERCISE_MINUTES = 120;

export function TraitsTab({ breed }: { breed: Breed }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.list}>
        {TRAIT_KEYS.map((key) => (
          <TraitScale key={key} trait={key} value={breed.traits[key]} />
        ))}
      </View>
      <Tags title="Temperament" tags={breed.temperament.map(titleCase)} empty="No temperament data" />
    </View>
  );
}

export function TraitScale({ trait, value }: { trait: TraitKey; value: number | undefined }) {
  const { colors } = useTheme();
  const label = titleCase(trait);

  if (trait === 'exercise_minutes') {
    const pct = value === undefined ? 0 : Math.min(1, value / MAX_EXERCISE_MINUTES);
    const text = value === undefined ? 'Not rated' : `${value} min / day`;
    return (
      <View accessible accessibilityLabel={`${label}: ${text}`} style={styles.trait}>
        <Row label={label} text={text} />
        <View style={[styles.track, { backgroundColor: colors.track }]}>
          <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: colors.accent }]} />
        </View>
      </View>
    );
  }

  const text = value === undefined ? 'Not rated' : `${value} / 5`;
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value === undefined ? 'not rated' : `${value} out of 5`}`}
      style={styles.trait}
    >
      <Row label={label} text={text} />
      <View style={styles.segments}>
        {SEGMENTS.map((n) => (
          <View
            key={n}
            style={[
              styles.segment,
              { backgroundColor: value !== undefined && n <= value ? colors.primary : colors.track },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

function Row({ label, text }: { label: string; text: string }) {
  return (
    <View style={styles.row}>
      <Text variant="label">{label}</Text>
      <Text variant="caption" color="textMuted">
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.lg, gap: space.xl },
  list: { gap: space.lg },
  trait: { gap: space.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  segments: { flexDirection: 'row', gap: space.xs },
  segment: { flex: 1, height: 10, borderRadius: radius.pill },
  track: { height: 10, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
});
