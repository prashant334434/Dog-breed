import { useColorScheme } from 'react-native';

// Caring teal + warm orange (ui-ux-pro-max "pet app" palette), tuned so all text pairs meet 4.5:1.
const light = {
  bg: '#F0FDFA',
  surface: '#FFFFFF',
  surfaceAlt: '#E3F2EF',
  text: '#134E4A',
  textMuted: '#45605D',
  border: '#C9E4DF',
  primary: '#0F766E',
  onPrimary: '#FFFFFF',
  accent: '#C2410C',
  track: '#D5E8E4',
  warnBg: '#FFEDD5',
  warnText: '#9A3412',
  infoBg: '#CCFBF1',
  infoText: '#115E59',
  offlineBg: '#1F2937',
  offlineText: '#F9FAFB',
};

const dark: typeof light = {
  bg: '#071513',
  surface: '#0F211F',
  surfaceAlt: '#173330',
  text: '#E6FFFA',
  textMuted: '#A3C2BD',
  border: '#24423E',
  primary: '#2DD4BF',
  onPrimary: '#042F2E',
  accent: '#FB923C',
  track: '#24423E',
  warnBg: '#3A1F0B',
  warnText: '#FDBA74',
  infoBg: '#123B37',
  infoText: '#99F6E4',
  offlineBg: '#E5E7EB',
  offlineText: '#111827',
};

export type Colors = typeof light;

export const fonts = {
  regular: 'Nunito_400Regular',
  semibold: 'Nunito_600SemiBold',
  bold: 'Nunito_700Bold',
  heavy: 'Nunito_800ExtraBold',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 14, lg: 20, pill: 999 };

export function useTheme() {
  const dark_ = useColorScheme() === 'dark';
  return { colors: dark_ ? dark : light, dark: dark_ };
}
