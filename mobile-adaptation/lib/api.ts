import { Platform } from 'react-native';
import { getApiConfiguration } from './api-config';
import { getMobileAuthToken } from './auth-client';

export { getApiConfiguration } from './api-config';

function describeError(payload: unknown, fallback: string) {
  if (typeof payload !== 'object' || payload === null) return fallback;
  const value = payload as Record<string, unknown>;

  if (typeof value.error === 'string') return value.error;
  if (
    typeof value.error === 'object' &&
    value.error !== null &&
    'message' in value.error &&
    typeof value.error.message === 'string'
  ) {
    return value.error.message;
  }
  if (typeof value.message === 'string') return value.message;
  return fallback;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const { baseUrl, error } = getApiConfiguration();
  if (!baseUrl) {
    throw new Error(error ?? 'A API não está configurada.');
  }

  const headers = new Headers(options.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (!headers.has('Authorization') && Platform.OS !== 'web') {
    const token = await getMobileAuthToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...options,
      credentials: options.credentials ?? 'include',
      headers,
    });
  } catch (error) {
    throw new Error(
      'Não foi possível conectar à API. Verifique a URL e a conexão com a internet.',
      { cause: error }
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(
      response.ok
        ? 'O servidor retornou uma resposta inválida.'
        : `Falha na API (${response.status}).`,
      { cause: error }
    );
  }

  if (!response.ok) {
    throw new Error(
      describeError(payload, `Falha na API (${response.status}).`)
    );
  }

  if (
    typeof payload === 'object' &&
    payload !== null &&
    'success' in payload &&
    'data' in payload
  ) {
    const envelope = payload as { success: boolean; data?: T; error?: unknown };
    if (!envelope.success) {
      throw new Error(describeError(payload, 'A solicitação não foi concluída.'));
    }
    return envelope.data as T;
  }

  return payload as T;
}
