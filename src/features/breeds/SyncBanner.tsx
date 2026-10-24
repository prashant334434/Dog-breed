// Deep import: the package root registers every icon font (~3 MB of assets).
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { timeAgo } from '../../lib/format';
import { useBreedStore } from '../../store/breedStore';
import { syncAll } from '../../sync/sync';
import { Text } from '../../ui/Text';
import { radius, space, useTheme, type Colors } from '../../ui/theme';

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Freshness + connectivity at a glance: offline, syncing (with page progress), partial failure, or last sync time. */
export function SyncBanner() {
  const { colors } = useTheme();
  const sync = useBreedStore((s) => s.sync);
  const isOnline = useBreedStore((s) => s.isOnline);
  const now = useNow();
  const synced = sync.lastSyncedAt ? `Last synced ${timeAgo(sync.lastSyncedAt, now)}` : 'Not synced yet';

  let tone: { bg: keyof Colors; fg: keyof Colors } = { bg: 'surfaceAlt', fg: 'textMuted' };
  let icon: keyof typeof Ionicons.glyphMap = 'checkmark-circle-outline';
  let message = synced;
  let retry = false;

  if (!isOnline) {
    tone = { bg: 'offlineBg', fg: 'offlineText' };
    icon = 'cloud-offline-outline';
    message = `Offline · showing saved data · ${synced.toLowerCase()}`;
  } else if (sync.status === 'syncing') {
    tone = { bg: 'infoBg', fg: 'infoText' };
    message = sync.progress
      ? `Syncing breeds · page ${sync.progress.done} of ${sync.progress.total}`
      : 'Syncing breeds…';
  } else if (sync.status === 'error') {
    tone = { bg: 'warnBg', fg: 'warnText' };
    icon = 'warning-outline';
    message = `${sync.error ?? 'Sync failed.'} ${synced}.`;
    retry = true;
  }

  return (
    <View
      style={[styles.banner, { backgroundColor: colors[tone.bg] }]}
      accessibilityRole={sync.status === 'error' || !isOnline ? 'alert' : 'summary'}
      accessibilityLiveRegion="polite"
      testID="sync-banner"
    >
      {sync.status === 'syncing' && isOnline ? (
        <ActivityIndicator size="small" color={colors[tone.fg]} />
      ) : (
        <Ionicons
          name={icon}
          size={18}
          color={colors[tone.fg]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      )}
      <Text variant="caption" color={tone.fg} style={styles.message}>
        {message}
      </Text>
      {retry && (
        <Pressable
          onPress={() => void syncAll()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Retry sync"
        >
          <Text variant="label" color={tone.fg} style={styles.retry}>
            Retry
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
  },
  message: { flex: 1 },
  retry: { textDecorationLine: 'underline' },
});
