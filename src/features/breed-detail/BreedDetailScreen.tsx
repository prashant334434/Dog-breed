import { Image } from 'expo-image';
import { useEffect, useLayoutEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { ScreenProps } from '../../navigation/RootNavigator';
import { useBreedStore } from '../../store/breedStore';
import { refreshBreed } from '../../sync/sync';
import { ErrorBoundary } from '../../ui/ErrorBoundary';
import { Text } from '../../ui/Text';
import { radius, space, useTheme } from '../../ui/theme';
import { GalleryTab } from './GalleryTab';
import { OverviewTab } from './OverviewTab';
import { TraitsTab } from './TraitsTab';

const TABS = ['Overview', 'Traits', 'Gallery'] as const;
type Tab = (typeof TABS)[number];

export function BreedDetailScreen(props: ScreenProps<'BreedDetail'>) {
  return (
    <ErrorBoundary name="Breed details">
      <BreedDetail {...props} />
    </ErrorBoundary>
  );
}

function BreedDetail({ route, navigation }: ScreenProps<'BreedDetail'>) {
  const { id } = route.params;
  const { colors } = useTheme();
  const breed = useBreedStore((s) => s.breedsById[id]);
  const group = useBreedStore((s) => (breed?.groupId ? s.groupsById[breed.groupId] : undefined));
  // The route param is the tab state, so deep links (`?tab=Traits`) and taps share one source of truth.
  const tab: Tab = route.params.tab ?? 'Overview';
  const setTab = (t: Tab) => navigation.setParams({ tab: t });

  // Deep links arrive with only an id; take the title from the cached record.
  useLayoutEffect(() => {
    if (breed && !route.params.name) navigation.setOptions({ title: breed.name });
  }, [breed, navigation, route.params.name]);

  useEffect(() => {
    void refreshBreed(id);
  }, [id]);

  if (!breed) {
    return (
      <View style={styles.missing}>
        <Text variant="heading">Breed not available</Text>
        <Text color="textMuted">It may have been removed in the latest sync.</Text>
      </View>
    );
  }

  const hero = breed.images[0];
  return (
    // Children: [header, tab bar, tab content]; the tab bar sticks so tabs stay reachable deep in a tab.
    <ScrollView contentContainerStyle={styles.content} stickyHeaderIndices={[1]}>
      <View>
        {hero && (
          <Image
            source={hero.medium}
            placeholder={hero.thumb}
            placeholderContentFit="cover"
            cachePolicy="memory-disk"
            contentFit="cover"
            transition={150}
            style={[styles.hero, { backgroundColor: colors.surfaceAlt }]}
            accessibilityLabel={`${breed.name} photo`}
          />
        )}

        <View style={styles.titleBlock}>
          <Text variant="title" accessibilityRole="header">
            {breed.name}
          </Text>
          <View style={styles.badges}>
            {group && <Badge label={group.name} />}
            {breed.hypoallergenic && <Badge label="Hypoallergenic" />}
          </View>
        </View>
      </View>

      <View style={[styles.tabBar, { backgroundColor: colors.bg }]}>
        <View style={[styles.tabs, { backgroundColor: colors.surfaceAlt }]} accessibilityRole="tablist">
          {TABS.map((t) => {
            const selected = t === tab;
            return (
              <Pressable
                key={t}
                onPress={() => setTab(t)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                style={[styles.tab, selected && { backgroundColor: colors.surface, borderColor: colors.primary }]}
                testID={`tab-${t}`}
              >
                <Text variant="label" color={selected ? 'primary' : 'textMuted'}>
                  {t}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ErrorBoundary key={tab} name={`${tab} tab`}>
        {tab === 'Overview' && <OverviewTab breed={breed} />}
        {tab === 'Traits' && <TraitsTab breed={breed} />}
        {tab === 'Gallery' && <GalleryTab breed={breed} />}
      </ErrorBoundary>
    </ScrollView>
  );
}

function Badge({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.badge, { backgroundColor: colors.infoBg }]}>
      <Text variant="caption" color="infoText">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: space.xxl },
  hero: { width: '100%', height: 260 },
  titleBlock: { padding: space.lg, gap: space.sm },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  badge: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill },
  tabBar: { paddingBottom: space.lg },
  tabs: { flexDirection: 'row', marginHorizontal: space.lg, padding: space.xs, borderRadius: radius.md },
  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm + 2,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.xl },
});
