import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { getAuthApiConfiguration } from './api-config';

const SESSION_TOKEN_KEY = 'orbit_room_mobile_session_token';

type AuthUser = {
  id: string;
  email: string;
  name: string;
  bio: string | null;
  photo: string | null;
  cover: string | null;
  friendCode: string | null;
  rooms: unknown[];
};

type AuthError = { message: string };

function isAuthUser(value: unknown): value is AuthUser {
  if (typeof value !== 'object' || value === null) return false;
  const user = value as Record<string, unknown>;

  return (
    typeof user.id === 'string' &&
    typeof user.email === 'string' &&
    typeof user.name === 'string' &&
    (typeof user.bio === 'string' || user.bio === null) &&
    (typeof user.photo === 'string' || user.photo === null) &&
    (typeof user.cover === 'string' || user.cover === null) &&
    (typeof user.friendCode === 'string' || user.friendCode === null) &&
    Array.isArray(user.rooms)
  );
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload !== 'object' || payload === null || !('error' in payload)) {
    return fallback;
  }

  const error = payload.error;
  return typeof error === 'string' ? error : fallback;
}

async function getSession(): Promise<{
  data: { user: AuthUser | null };
  error: AuthError | null;
}> {
  if (Platform.OS === 'web') {
    return { data: { user: null }, error: null };
  }

  const token = await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
  if (!token) return { data: { user: null }, error: null };

  const { baseUrl, error } = getAuthApiConfiguration();
  if (!baseUrl) {
    return {
      data: { user: null },
      error: { message: error ?? 'A API de autenticação não está configurada.' },
    };
  }

  try {
    const response = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      credentials: 'omit',
    });
    const payload: unknown = await response.json();

    if (!response.ok) {
      return {
        data: { user: null },
        error: {
          message: getErrorMessage(payload, `Falha na autenticação (${response.status}).`),
        },
      };
    }

    if (typeof payload !== 'object' || payload === null || !('user' in payload)) {
      return {
        data: { user: null },
        error: { message: 'A API de autenticação retornou uma resposta inválida.' },
      };
    }

    if (payload.user !== null && !isAuthUser(payload.user)) {
      return {
        data: { user: null },
        error: { message: 'A API de autenticação retornou dados de conta inválidos.' },
      };
    }

    return { data: { user: payload.user }, error: null };
  } catch (sessionError) {
    return {
      data: { user: null },
      error: {
        message:
          sessionError instanceof Error
            ? sessionError.message
            : 'Não foi possível verificar a sessão.',
      },
    };
  }
}

async function signOut(): Promise<{ error: AuthError | null }> {
  const token = await getMobileAuthToken();
  if (!token) return { error: null };

  const { baseUrl, error } = getAuthApiConfiguration();
  if (!baseUrl) {
    return {
      error: { message: error ?? 'A API de autenticação não está configurada.' },
    };
  }

  try {
    const response = await fetch(`${baseUrl}/api/auth/mobile/logout`, {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      credentials: 'omit',
    });
    const payload: unknown = await response.json();

    if (!response.ok) {
      return {
        error: {
          message: getErrorMessage(payload, `Falha ao encerrar a sessão (${response.status}).`),
        },
      };
    }

    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
    return { error: null };
  } catch (logoutError) {
    return {
      error: {
        message:
          logoutError instanceof Error
            ? logoutError.message
            : 'Não foi possível encerrar a sessão.',
      },
    };
  }
}

export function getAuthClient() {
  return { getSession, signOut };
}

export async function getMobileAuthToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  return SecureStore.getItemAsync(SESSION_TOKEN_KEY);
}

export async function saveMobileAuthToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    throw new Error('O login de conta está disponível no aplicativo Android e iOS.');
  }
  if (!token.trim()) throw new Error('A API retornou um token de sessão vazio.');
  await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
}
