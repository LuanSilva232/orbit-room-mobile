export type NotificationTarget = {
  route: '/messages' | '/rooms' | '/social';
  conversationId?: string;
  roomId?: string;
};
export type NotificationResponseListener = (target: NotificationTarget) => void;

export async function getPushNotificationsEnabled(): Promise<boolean> {
  return false;
}

export async function enablePushNotifications(): Promise<void> {
  throw new Error('Notificações push estão disponíveis apenas no app Android e iOS.');
}

export async function disablePushNotifications(): Promise<void> {
  return;
}

export function addPushNotificationResponseListener(
  _listener: NotificationResponseListener
): () => void {
  return () => undefined;
}
