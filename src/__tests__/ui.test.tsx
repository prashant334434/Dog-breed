import { render, screen } from '@testing-library/react-native';
import { TraitScale } from '../features/breed-detail/TraitsTab';
import { SyncBanner } from '../features/breeds/SyncBanner';
import { timeAgo } from '../lib/format';
import { useBreedStore } from '../store/breedStore';

jest.mock('../sync/sync', () => ({ syncAll: jest.fn() }));

const initial = useBreedStore.getState();
beforeEach(() => useBreedStore.setState(initial, true));

describe('SyncBanner', () => {
  const twoHoursAgo = Date.now() - 2 * 3_600_000;

  it('shows freshness when idle', async () => {
    useBreedStore.getState().setSync({ lastSyncedAt: twoHoursAgo });
    await render(<SyncBanner />);
    expect(screen.getByText('Last synced 2 hours ago')).toBeTruthy();
  });

  it('shows offline state with cached-data context', async () => {
    useBreedStore.setState({ isOnline: false });
    useBreedStore.getState().setSync({ lastSyncedAt: twoHoursAgo });
    await render(<SyncBanner />);
    expect(screen.getByText(/Offline · showing saved data · last synced 2 hours ago/)).toBeTruthy();
  });

  it('shows partial-failure error with a retry action', async () => {
    useBreedStore.getState().setSync({ status: 'error', error: 'Updated 4 of 6 pages.', lastSyncedAt: twoHoursAgo });
    await render(<SyncBanner />);
    expect(screen.getByText(/Updated 4 of 6 pages/)).toBeTruthy();
    expect(screen.getByLabelText('Retry sync')).toBeTruthy();
  });

  it('shows page progress while syncing', async () => {
    useBreedStore.getState().setSync({ status: 'syncing', progress: { done: 3, total: 6 } });
    await render(<SyncBanner />);
    expect(screen.getByText('Syncing breeds · page 3 of 6')).toBeTruthy();
  });
});

describe('TraitScale', () => {
  it('exposes the score to screen readers', async () => {
    await render(<TraitScale trait="good_with_children" value={4} />);
    expect(screen.getByLabelText('Good With Children: 4 out of 5')).toBeTruthy();
  });

  it('renders exercise as minutes and handles missing scores', async () => {
    await render(<TraitScale trait="exercise_minutes" value={60} />);
    expect(screen.getByText('60 min / day')).toBeTruthy();
    await render(<TraitScale trait="energy" value={undefined} />);
    expect(screen.getByText('Not rated')).toBeTruthy();
  });
});

describe('timeAgo', () => {
  const now = 1_000_000_000;
  it.each([
    [10_000, 'just now'],
    [60_000, '1 minute ago'],
    [5 * 60_000, '5 minutes ago'],
    [2 * 3_600_000, '2 hours ago'],
    [3 * 86_400_000, '3 days ago'],
  ])('%sms -> %s', (diff, text) => expect(timeAgo(now - diff, now)).toBe(text));
});
