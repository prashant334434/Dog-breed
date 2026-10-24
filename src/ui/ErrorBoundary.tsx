import { Component, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { radius, space, useTheme } from './theme';

interface Props {
  name: string;
  children: ReactNode;
}

/** Contains a crash to one feature (list, filters, a detail tab) instead of white-screening the app. */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error) {
    console.error(`[${this.props.name}]`, error);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return <Fallback name={this.props.name} onRetry={() => this.setState({ error: null })} />;
  }
}

function Fallback({ name, onRetry }: { name: string; onRetry: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.box} accessibilityRole="alert">
      <Text variant="heading">Something went wrong</Text>
      <Text color="textMuted" style={styles.center}>
        {name} hit an unexpected error. Your saved data is safe.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => [styles.button, { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}
      >
        <Text variant="label" color="onPrimary">
          Try again
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md },
  center: { textAlign: 'center' },
  button: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.xl, borderRadius: radius.pill },
});
