import AsyncStorage from '@react-native-async-storage/async-storage';

const CHAT_CLEAR_KEY_PREFIX = 'orbit_room_mobile_chat_clear:';
const timestamps = new Map<string, number>();
const listeners = new Map<string, Set<() => void>>();

function notify(clientId: string): void {
  listeners.get(clientId)?.forEach((listener) => listener());
}

export async function loadChatClearTimestamp(clientId: string): Promise<number> {
  const cached = timestamps.get(clientId);
  if (cached !== undefined) return cached;

  const stored = await AsyncStorage.getItem(`${CHAT_CLEAR_KEY_PREFIX}${clientId}`);
  const timestamp = stored === null ? 0 : Number(stored);
  if (!Number.isFinite(timestamp) || timestamp < 0) {
    throw new Error('O marco local de limpeza do chat está inválido.');
  }

  timestamps.set(clientId, timestamp);
  notify(clientId);
  return timestamp;
}

export function getChatClearTimestamp(clientId: string): number {
  return timestamps.get(clientId) ?? 0;
}

export async function saveChatClearTimestamp(
  clientId: string,
  timestamp = Date.now()
): Promise<number> {
  if (!Number.isFinite(timestamp) || timestamp < 0) {
    throw new Error('Não foi possível registrar a limpeza do histórico de chats.');
  }

  await AsyncStorage.setItem(
    `${CHAT_CLEAR_KEY_PREFIX}${clientId}`,
    String(timestamp)
  );
  timestamps.set(clientId, timestamp);
  notify(clientId);
  return timestamp;
}

export function subscribeChatClearTimestamp(
  clientId: string,
  listener: () => void
): () => void {
  const subscribers = listeners.get(clientId) ?? new Set<() => void>();
  subscribers.add(listener);
  listeners.set(clientId, subscribers);
  return () => {
    subscribers.delete(listener);
    if (subscribers.size === 0) listeners.delete(clientId);
  };
}
