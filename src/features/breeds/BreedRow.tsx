import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Breed } from '../../domain/breed';
import { titleCase } from '../../lib/format';
import { Text } from '../../ui/Text';
import { radius, space, useTheme } from '../../ui/theme';

const rowSummary = (b: Breed) =>
  [
    b.sizeBand && titleCase(b.sizeBand),
    b.coat.length && `${titleCase(b.coat.length)} coat`,
    b.hypoallergenic && 'Hypoallergenic',
  ]
    .filter(Boolean)
    .join(' · ');

interface Props {
  breed: Breed;
  onPress: (breed: Breed) => void;
}

// Rows read only a handful of precomputed scalars plus one 200px thumb; nested traits/origin/images
// stay untouched until the detail screen, which keeps per-row render cost flat despite the heavy record.
export const BreedRow = memo(function BreedRow({ breed, onPress }: Props) {
  const { colors } = useTheme();
  const thumb = breed.images[0]?.thumb;
  const summary = rowSummary(breed);

  return (
    <Pressable
      onPress={() => onPress(breed)}
      accessibilityRole="button"
      accessibilityLabel={`${breed.name}. ${summary}`}
      accessibilityHint="Opens breed details"
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfaceAlt : colors.surface }]}
    >
      <Image
        source={thumb}
        recyclingKey={breed.id}
        cachePolicy="memory-disk"
        contentFit="cover"
        transition={120}
        style={[styles.thumb, { backgroundColor: colors.surfaceAlt }]}
        accessible={false}
      />
      <View style={styles.body}>
        <Text variant="heading" numberOfLines={1}>
          {breed.name}
        </Text>
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {summary || 'Details unavailable'}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    minHeight: 76, // grows with Dynamic Type; FlashList v2 measures rows
    paddingVertical: space.sm,
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  thumb: { width: 56, height: 56, borderRadius: radius.sm },
  body: { flex: 1, gap: 2 },
});
