import { Text as RNText, type TextProps } from 'react-native';
import { fonts, useTheme, type Colors } from './theme';

const variants = {
  title: { fontFamily: fonts.heavy, fontSize: 28, lineHeight: 34 },
  heading: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 },
  label: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
};

interface Props extends TextProps {
  variant?: keyof typeof variants;
  color?: keyof Colors;
}

// Scales with the system text size up to 1.6x: large enough to help, small enough to keep layouts intact.
export const MAX_FONT_SCALE = 1.6;

export function Text({ variant = 'body', color = 'text', style, ...rest }: Props) {
  const { colors } = useTheme();
  return (
    <RNText
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      {...rest}
      style={[variants[variant], { color: colors[color] }, style]}
    />
  );
}
