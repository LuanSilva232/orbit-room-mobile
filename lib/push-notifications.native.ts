import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiRequest } from './api';

const TOKEN_KEY = 'orbit_room_push_token';
const ENABLED_KEY = 'orbit_room_push_enabled';

export type NotificationTarget = {
  route: '/messages' | '/rooms' | '/social';
  conversationId?: string;
  roomId?: string;
};
export type NotificationResponseListener = (target: NotificationTarget) => void;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function getPushNotificationsEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(ENABLED_KEY)) === 'true';
}

export async function enablePushNotifications(): Promise<void> {
  const projectId =
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() ||
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.easConfig?.projectId;
  if (!projectId) {
    throw new Error(
      'Configure EXPO_PUBLIC_EAS_PROJECT_ID com o ID do projeto EAS para ativar notificações.'
    );
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('orbit-room', {
      name: 'Orbit Room',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Permita notificações nas configurações do aparelho para ativá-las.');
  }

  const token = (
    await Notifications.getExpoPushTokenAsync({ projectId })
  ).data;
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  await apiRequest('/api/push-token', {
    method: 'POST',
    body: JSON.stringify({ token, platform }),
  });
  await AsyncStorage.multiSet([
    [TOKEN_KEY, token],
    [ENABLED_KEY, 'true'],
  ]);
}

export async function disablePushNotifications(): Promise<void> {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (token) {
    await apiRequest('/api/push-token', {
      method: 'DELETE',
      body: JSON.stringify({ token }),
    });
  }
  await AsyncStorage.multiRemove([TOKEN_KEY, ENABLED_KEY]);
}

export function addPushNotificationResponseListener(
  listener: NotificationResponseListener
): () => void {
  const deliver = (response: Notifications.NotificationResponse) => {
    const data = response.notification.request.content.data;
    if (typeof data === 'object' && data !== null && !Array.isArray(data) && 'route' in data) {
      const route = data.route;
      if (route === '/messages' || route === '/rooms' || route === '/social') {
        const target: NotificationTarget = { route };
        if ('conversationId' in data && typeof data.conversationId === 'string') {
          target.conversationId = data.conversationId;
        }
        if ('roomId' in data && typeof data.roomId === 'string') {
          target.roomId = data.roomId;
        }
        listener(target);
      }
    }
    Notifications.clearLastNotificationResponse();
  };
  const subscription = Notifications.addNotificationResponseReceivedListener(deliver);
  const initialResponse = Notifications.getLastNotificationResponse();
  if (initialResponse) deliver(initialResponse);
  return () => subscription.remove();
}
