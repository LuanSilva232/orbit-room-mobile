import { Pressable, StyleSheet } from 'react-native';
import { router, useGlobalSearchParams, usePathname } from 'expo-router';
import {
  ThemedText as Text,
  ThemedView as View,
} from './themed-primitives';
import { useAppTheme } from '../lib/theme';

type MainTab = 'home' | 'calls' | 'chat' | 'settings';

const TABS: { id: MainTab; label: string; icon: string }[] = [
  { id: 'home', label: 'Início', icon: '🧭' },
  { id: 'calls', label: 'Chamadas', icon: '🎧' },
  { id: 'chat', label: 'Chat', icon: '💬' },
  { id: 'settings', label: 'Config', icon: '⚙️' },
];

export function MainNavigation() {
  const theme = useAppTheme();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ tab?: string }>();

  if (pathname === '/login') return null;

  const activeTab: MainTab =
    pathname === '/'
      ? params.tab === 'calls'
        ? 'calls'
        : params.tab === 'channel-chat'
          ? 'chat'
          : 'home'
      : pathname === '/messages' || pathname === '/social'
        ? 'chat'
        : 'settings';

  const navigateToTab = (tab: MainTab) => {
    if (tab === 'home' || tab === 'calls') {
      router.navigate({ pathname: '/', params: { tab } });
    } else if (tab === 'chat') {
      router.navigate('/messages');
    } else {
      router.navigate('/settings');
    }
  };

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bar,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      {TABS.map((tab) => {
        const selected = activeTab === tab.id;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => navigateToTab(tab.id)}
            style={[
              styles.item,
              selected && styles.selectedItem,
              selected && { backgroundColor: theme.raisedSurface },
            ]}
          >
            <Text style={styles.icon}>{tab.icon}</Text>
            <Text style={[styles.label, selected && styles.selectedLabel]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    gap: 5,
    marginHorizontal: 12,
    marginTop: 6,
    marginBottom: 8,
    padding: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.26)',
    backgroundColor: 'rgba(13,18,40,0.94)',
  },
  item: {
    flex: 1,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: 14,
  },
  selectedItem: { backgroundColor: 'rgba(99,102,241,0.25)' },
  icon: { fontSize: 18, lineHeight: 21 },
  label: { color: '#8992ab', fontSize: 11, fontWeight: '700' },
  selectedLabel: { color: '#c4b5fd' },
});
