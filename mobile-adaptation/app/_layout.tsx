import { useEffect } from 'react';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { addPushNotificationResponseListener } from '../lib/push-notifications';

export default function RootLayout() {
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
      <StatusBar style="light" />
      <SafeAreaView
        edges={['top', 'right', 'bottom', 'left']}
        style={{ flex: 1, backgroundColor: '#080d1d' }}
      >
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#080d1d' },
          }}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
