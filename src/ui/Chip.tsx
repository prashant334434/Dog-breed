import { Pressable, StyleSheet } from 'react-native';
import { Text } from './Text';
import { radius, space, useTheme } from './theme';

interface Props {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}

export function Chip({ label, selected, onPress, accessibilityLabel }: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.primary : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <Text variant="label" style={{ color: selected ? colors.onPrimary : colors.text }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 40,
    paddingHorizontal: space.lg,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
});
