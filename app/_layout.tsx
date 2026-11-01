import { useEffect } from 'react';
import { DarkTheme, router, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { OrbitBackground } from '../components/orbit-background';
import { MainNavigation } from '../components/main-navigation';
import { addPushNotificationResponseListener } from '../lib/push-notifications';
import { useAppTheme } from '../lib/theme';

const ORBIT_THEME = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: 'transparent',
  },
};

export default function RootLayout() {
  const appTheme = useAppTheme();
  useEffect(
    () =>
      addPushNotificationResponseListener((target) => {
        if (target.route === '/messages') {
          router.push(
            target.conversationId
              ? { pathname: '/messages', params: { conversationId: target.conversationId } }
              : '/messages'
          );
        } else if (target.route === '/rooms') {
          router.push(
            target.roomId
              ? { pathname: '/rooms', params: { inviteRoomId: target.roomId } }
              : '/rooms'
          );
        }
        else if (target.route === '/social') router.push('/social');
      }),
    []
  );

  return (
    <SafeAreaProvider>
      <ThemeProvider value={ORBIT_THEME}>
        <StatusBar style={appTheme.statusBar} />
        <SafeAreaView
          edges={['top', 'right', 'bottom', 'left']}
          style={{ flex: 1, backgroundColor: appTheme.background }}
        >
          <OrbitBackground>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: 'transparent' },
              }}
            />
            <MainNavigation />
          </OrbitBackground>
        </SafeAreaView>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
