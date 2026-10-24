import { useNetInfo } from '@react-native-community/netinfo';
import { Image } from 'expo-image';
import { useState } from 'react';
import {
  FlatList,
  Linking,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import type { Breed, BreedImage } from '../../domain/breed';
import { titleCase } from '../../lib/format';
import { Text } from '../../ui/Text';
import { radius, space, useTheme } from '../../ui/theme';

/**
 * Variant policy: thumb (200px) is always the placeholder and is already on disk from the list,
 * medium (450×600) on cellular/unknown, large (900×1200) only on unmetered Wi-Fi/Ethernet.
 * The original `url` (multi-MB JPEG) is never downloaded.
 */
export function GalleryTab({ breed }: { breed: Breed }) {
  const { width } = useWindowDimensions();
  const net = useNetInfo();
  const [index, setIndex] = useState(0);
  const itemWidth = width - space.lg * 2;
  const variant: 'large' | 'medium' = net.type === 'wifi' || net.type === 'ethernet' ? 'large' : 'medium';

  if (!breed.images.length) {
    return (
      <Text color="textMuted" style={styles.pad}>
        No photos available for this breed.
      </Text>
    );
  }

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    setIndex(Math.round(e.nativeEvent.contentOffset.x / itemWidth));

  return (
    <View style={styles.wrap}>
      <FlatList
        data={breed.images}
        keyExtractor={(img) => img.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={{ width: itemWidth }}
        initialNumToRender={2}
        windowSize={3}
        renderItem={({ item, index: i }) => (
          <Slide
            image={item}
            width={itemWidth}
            uri={item[variant]}
            label={`${breed.name}, photo ${i + 1} of ${breed.images.length}`}
          />
        )}
        testID="gallery"
      />
      <Text variant="caption" color="textMuted" style={styles.counter} accessibilityLiveRegion="polite">
        {index + 1} / {breed.images.length} · swipe for more
      </Text>
    </View>
  );
}

function Slide({ image, width, uri, label }: { image: BreedImage; width: number; uri: string; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ width }}>
      <Image
        source={uri}
        placeholder={image.thumb}
        placeholderContentFit="cover"
        cachePolicy="memory-disk"
        contentFit="cover"
        transition={150}
        style={[styles.image, { height: Math.min(width, 420), backgroundColor: colors.surfaceAlt }]}
        accessibilityLabel={label}
      />
      <Attribution image={image} />
    </View>
  );
}

/** Every photo is shown with its author, license and source; links open in the browser. */
function Attribution({ image }: { image: BreedImage }) {
  const open = (url: string | null) => (url ? () => void Linking.openURL(url) : undefined);
  const source = image.source ? titleCase(image.source) : 'Unknown source';
  return (
    <View style={styles.attribution}>
      <Text variant="caption" color="textMuted">
        Photo by <Text variant="caption">{image.author ?? 'unknown author'}</Text>
      </Text>
      <Text variant="caption" color="textMuted">
        License:{' '}
        <Text
          variant="caption"
          color={image.licenseUrl ? 'primary' : 'text'}
          onPress={open(image.licenseUrl)}
          accessibilityRole={image.licenseUrl ? 'link' : 'text'}
        >
          {image.license ?? 'not specified'}
        </Text>
        {'  ·  '}Source:{' '}
        <Text
          variant="caption"
          color={image.sourceUrl ? 'primary' : 'text'}
          onPress={open(image.sourceUrl)}
          accessibilityRole={image.sourceUrl ? 'link' : 'text'}
        >
          {source}
        </Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.lg, gap: space.sm },
  pad: { paddingHorizontal: space.lg },
  image: { width: '100%', borderRadius: radius.lg },
  attribution: { paddingTop: space.sm, gap: 2 },
  counter: { textAlign: 'center' },
});
