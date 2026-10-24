import Ionicons from '@expo/vector-icons/Ionicons';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import type { Breed } from '../../domain/breed';
import { activeFilterCount, buildListItems, EMPTY_FILTERS, type ListItem } from '../../domain/filters';
import type { ScreenProps } from '../../navigation/RootNavigator';
import { useBreedStore } from '../../store/breedStore';
import { syncAll } from '../../sync/sync';
import { ErrorBoundary } from '../../ui/ErrorBoundary';
import { MAX_FONT_SCALE, Text } from '../../ui/Text';
import { fonts, radius, space, useTheme } from '../../ui/theme';
import { BreedRow } from './BreedRow';
import { SyncBanner } from './SyncBanner';

const SEARCH_DEBOUNCE_MS = 250;

function useDebouncedQuery() {
  const setQuery = useBreedStore((s) => s.setQuery);
  const [text, setText] = useState(() => useBreedStore.getState().query);
  useEffect(() => {
    const id = setTimeout(() => setQuery(text), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [text, setQuery]);
  return [text, setText] as const;
}

export function BreedListScreen(props: ScreenProps<'Breeds'>) {
  return (
    <ErrorBoundary name="Breed list">
      <BreedList {...props} />
    </ErrorBoundary>
  );
}

function BreedList({ navigation }: ScreenProps<'Breeds'>) {
  const { colors } = useTheme();
  const breedsById = useBreedStore((s) => s.breedsById);
  const groupsById = useBreedStore((s) => s.groupsById);
  const filters = useBreedStore((s) => s.filters);
  const query = useBreedStore((s) => s.query);
  const hydrated = useBreedStore((s) => s.hydrated);
  const syncing = useBreedStore((s) => s.sync.status === 'syncing');
  const [text, setText] = useDebouncedQuery();

  const all = useMemo(() => Object.values(breedsById), [breedsById]);
  const { items, stickyIndices, total } = useMemo(
    () => buildListItems(all, groupsById, filters, query),
    [all, groupsById, filters, query],
  );
  const filterCount = activeFilterCount(filters);

  // New search/filter results start at the first match, not wherever the old list was scrolled.
  const listRef = useRef<FlashListRef<ListItem>>(null);
  useEffect(() => listRef.current?.scrollToOffset({ offset: 0, animated: false }), [filters, query]);

  const openBreed = useCallback(
    (b: Breed) => navigation.navigate('BreedDetail', { id: b.id, name: b.name }),
    [navigation],
  );
  const clearAll = () => {
    setText('');
    useBreedStore.setState({ query: '', filters: EMPTY_FILTERS });
  };

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) =>
      item.type === 'header' ? (
        <View style={[styles.header, { backgroundColor: colors.bg }]} accessibilityRole="header">
          <Text variant="label" color="primary">
            {item.title.toUpperCase()}
          </Text>
          <Text variant="caption" color="textMuted">
            {item.count}
          </Text>
        </View>
      ) : (
        <BreedRow breed={item.breed} onPress={openBreed} />
      ),
    [colors.bg, openBreed],
  );

  return (
    <View style={styles.flex}>
      <View style={styles.toolbar}>
        <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Search breeds or other names"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Search breeds"
            autoCorrect={false}
            clearButtonMode="while-editing"
            returnKeyType="search"
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={[styles.input, { color: colors.text }]}
            testID="search-input"
          />
        </View>
        <Pressable
          onPress={() => navigation.navigate('Filters')}
          accessibilityRole="button"
          accessibilityLabel={filterCount ? `Filters, ${filterCount} active` : 'Filters'}
          style={({ pressed }) => [
            styles.filterButton,
            {
              backgroundColor: filterCount ? colors.primary : colors.surface,
              borderColor: filterCount ? colors.primary : colors.border,
              opacity: pressed ? 0.75 : 1,
            },
          ]}
          testID="filters-button"
        >
          <Ionicons name="options-outline" size={20} color={filterCount ? colors.onPrimary : colors.text} />
          {filterCount > 0 && (
            <Text variant="label" color="onPrimary">
              {filterCount}
            </Text>
          )}
        </Pressable>
      </View>

      <SyncBanner />

      <View style={styles.resultLine}>
        <Text variant="caption" color="textMuted" testID="result-count">
          {all.length ? `Showing ${total} of ${all.length} breeds` : ' '}
        </Text>
        {(filterCount > 0 || !!query) && (
          <Pressable
            onPress={clearAll}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Clear search and filters"
          >
            <Text variant="label" color="primary">
              Clear all
            </Text>
          </Pressable>
        )}
      </View>

      <FlashList
        ref={listRef}
        data={items}
        // Search/filters replace the data wholesale, so anchoring to a previously visible row (FlashList
        // v2's chat-oriented default) is meaningless; results start at the top instead (see effect above).
        maintainVisibleContentPosition={{ disabled: true }}
        renderItem={renderItem}
        keyExtractor={(item) => item.key}
        getItemType={(item) => item.type}
        stickyHeaderIndices={stickyIndices}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={syncing && all.length > 0}
            onRefresh={() => void syncAll()}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <EmptyState loading={!hydrated || (syncing && !all.length)} hasData={all.length > 0} onClear={clearAll} />
        }
        testID="breed-list"
      />
    </View>
  );
}

function EmptyState({ loading, hasData, onClear }: { loading: boolean; hasData: boolean; onClear: () => void }) {
  const { colors } = useTheme();
  if (loading) {
    return (
      <View style={styles.empty}>
        <ActivityIndicator color={colors.primary} />
        <Text color="textMuted">Fetching 283 breeds…</Text>
      </View>
    );
  }
  return (
    <View style={styles.empty}>
      <Ionicons name={hasData ? 'search-outline' : 'cloud-download-outline'} size={40} color={colors.textMuted} />
      <Text variant="heading">{hasData ? 'No breeds match' : 'No saved breeds yet'}</Text>
      <Text color="textMuted" style={styles.center}>
        {hasData
          ? 'Try fewer filters or a different search.'
          : 'Connect to the internet once to download the breed catalogue.'}
      </Text>
      <Pressable
        onPress={hasData ? onClear : () => void syncAll()}
        accessibilityRole="button"
        style={({ pressed }) => [styles.cta, { backgroundColor: colors.primary, opacity: pressed ? 0.75 : 1 }]}
      >
        <Text variant="label" color="onPrimary">
          {hasData ? 'Clear filters' : 'Try again'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  toolbar: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  input: { flex: 1, fontFamily: fonts.regular, fontSize: 16, paddingVertical: space.sm },
  filterButton: {
    minWidth: 48,
    minHeight: 48,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  resultLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg + space.xs,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  listContent: { paddingBottom: space.xxl },
  empty: { alignItems: 'center', gap: space.md, padding: space.xxl, paddingTop: 64 },
  center: { textAlign: 'center' },
  cta: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.xl, borderRadius: radius.pill },
});
