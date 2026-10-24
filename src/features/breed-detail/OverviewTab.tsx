import { StyleSheet, View } from 'react-native';
import type { Breed } from '../../domain/breed';
import { formatRange, titleCase } from '../../lib/format';
import { Text } from '../../ui/Text';
import { radius, space, useTheme } from '../../ui/theme';

export function OverviewTab({ breed }: { breed: Breed }) {
  const { colors } = useTheme();
  const { origin, coat } = breed;
  const facts: [string, string][] = [
    ['Life span', formatRange(breed.life, 'years')],
    ['Weight (male)', formatRange(breed.weight.male, 'kg')],
    ['Weight (female)', formatRange(breed.weight.female, 'kg')],
    ['Height (male)', formatRange(breed.height.male, 'cm')],
    ['Height (female)', formatRange(breed.height.female, 'cm')],
    ['Origin', [origin.country, origin.region].filter(Boolean).join(', ') || 'Unknown'],
    ['Era', origin.era ?? 'Unknown'],
    [
      'Coat',
      [coat.length, coat.type]
        .filter(Boolean)
        .map((s) => titleCase(String(s)))
        .join(' · ') || 'Unknown',
    ],
  ];

  return (
    <View style={styles.wrap}>
      <Text>{breed.description ?? 'No description available.'}</Text>

      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        {facts.map(([label, value]) => (
          <View
            key={label}
            style={[styles.fact, { borderColor: colors.border }]}
            accessible
            accessibilityLabel={`${label}: ${value}`}
          >
            <Text variant="label" color="textMuted">
              {label}
            </Text>
            <Text variant="label" style={styles.value}>
              {value}
            </Text>
          </View>
        ))}
      </View>

      {coat.colors.length > 0 && <Tags title="Colours" tags={coat.colors.map(titleCase)} />}
      <Tags title="Also known as" tags={breed.otherNames} empty="No other names recorded" />
      <Tags title="Recognized by" tags={breed.recognizedBy} empty="No kennel club data" />
    </View>
  );
}

export function Tags({ title, tags, empty }: { title: string; tags: string[]; empty?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.tagBlock}>
      <Text variant="heading" accessibilityRole="header">
        {title}
      </Text>
      {tags.length ? (
        <View style={styles.tags}>
          {tags.map((t) => (
            <View key={t} style={[styles.tag, { backgroundColor: colors.surfaceAlt }]}>
              <Text variant="caption">{t}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text color="textMuted">{empty}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.lg, gap: space.xl },
  card: { borderRadius: radius.lg, paddingHorizontal: space.lg },
  fact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  value: { flexShrink: 1, textAlign: 'right' },
  tagBlock: { gap: space.sm },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tag: { paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill },
});
