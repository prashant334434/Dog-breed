const online = { isConnected: true, isInternetReachable: true, type: 'wifi' };

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { configure: jest.fn(), fetch: jest.fn(async () => online), addEventListener: jest.fn(() => jest.fn()) },
  useNetInfo: jest.fn(() => online),
}));
jest.mock('expo-sqlite', () => ({ openDatabaseSync: jest.fn() }));
// Icon fonts can't load in Node; icons are decorative so render nothing.
jest.mock('@expo/vector-icons/Ionicons', () => Object.assign(() => null, { glyphMap: {} }));
