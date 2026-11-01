import { StyleSheet } from 'react-native';
import { ThemedView as View } from './themed-primitives';
import { useAppTheme } from '../lib/theme';

export function OrbitBackground({ children }: React.PropsWithChildren) {
  const theme = useAppTheme();
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060a1c' },
});
