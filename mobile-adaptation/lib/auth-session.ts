import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const SESSION_KEY = 'orbit_room_mobile_session';
const PENDING_VERIFIER_KEY = 'orbit_room_mobile_pending_pkce_verifier';
let cachedToken: string | null | undefined;
let tokenLoad: Promise<string | null> | null = null;

export async function getMobileAuthToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (cachedToken !== undefined) return cachedToken;

  tokenLoad ??= SecureStore.getItemAsync(SESSION_KEY);
  cachedToken = await tokenLoad;
  tokenLoad = null;
  return cachedToken;
}

export async function saveMobileAuthToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    throw new Error('O login de conta está disponível no app Android e iOS.');
  }
  await SecureStore.setItemAsync(SESSION_KEY, token);
  cachedToken = token;
  tokenLoad = null;
}

export async function savePendingMobileAuthVerifier(verifier: string): Promise<void> {
  if (Platform.OS === 'web') {
    throw new Error('O login de conta está disponível no app Android e iOS.');
  }
  await SecureStore.setItemAsync(PENDING_VERIFIER_KEY, verifier);
}

export async function getPendingMobileAuthVerifier(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  return SecureStore.getItemAsync(PENDING_VERIFIER_KEY);
}

export async function clearPendingMobileAuthVerifier(): Promise<void> {
  if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(PENDING_VERIFIER_KEY);
}

export async function clearMobileAuthToken(): Promise<void> {
  if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(SESSION_KEY);
  cachedToken = null;
  tokenLoad = null;
}
