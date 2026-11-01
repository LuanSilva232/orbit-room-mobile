import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
} from 'react-native';
import {
  ThemedText as Text,
  ThemedView as View,
} from '../../components/themed-primitives';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { getAuthApiConfiguration } from '../../lib/api-config';
import { getAuthClient, saveMobileAuthToken } from '../../lib/auth-client';

function getQueryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function getPayloadError(payload: unknown, fallback: string): string {
  if (typeof payload !== 'object' || payload === null || !('error' in payload)) {
    return fallback;
  }
  return typeof payload.error === 'string' ? payload.error : fallback;
}

export default function AccountScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const signInWithGoogle = async () => {
    if (Platform.OS === 'web') {
      setError('O login Google está disponível no aplicativo Android e iOS.');
      return;
    }

    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { baseUrl, error: configurationError } = getAuthApiConfiguration();
      if (!baseUrl) {
        throw new Error(configurationError ?? 'A API de autenticação não está configurada.');
      }

      const verifier = `${Crypto.randomUUID()}${Crypto.randomUUID()}`
        .replace(/-/g, '')
        .slice(0, 64);
      const challenge = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        verifier
      );
      const loginUrl = new URL('/api/auth/mobile/login', baseUrl);
      loginUrl.searchParams.set('challenge', challenge);

      const callbackUrl = Linking.createURL('auth/callback');
      const browserResult = await WebBrowser.openAuthSessionAsync(
        loginUrl.toString(),
        callbackUrl
      );

      if (browserResult.type !== 'success') {
        setNotice('Login cancelado. Você pode tentar novamente quando quiser.');
        return;
      }

      const callback = Linking.parse(browserResult.url);
      const callbackParams = callback.queryParams ?? {};
      const callbackError = getQueryValue(callbackParams.error);
      if (callbackError) throw new Error(callbackError);

      const code = getQueryValue(callbackParams.code);
      if (!code) throw new Error('O Google não retornou o código de autenticação.');

      const exchangeResponse = await fetch(`${baseUrl}/api/auth/mobile/exchange`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify({ code, verifier }),
      });
      let payload: unknown;
      try {
        payload = await exchangeResponse.json();
      } catch {
        throw new Error('A API de autenticação retornou uma resposta inválida.');
      }

      if (!exchangeResponse.ok) {
        throw new Error(
          getPayloadError(payload, `Falha na autenticação (${exchangeResponse.status}).`)
        );
      }

      if (
        typeof payload !== 'object' ||
        payload === null ||
        !('token' in payload) ||
        typeof payload.token !== 'string'
      ) {
        throw new Error('A API de autenticação não retornou uma sessão válida.');
      }
      await saveMobileAuthToken(payload.token);

      const session = await getAuthClient().getSession();
      if (session.error) throw new Error(session.error.message);
      if (!session.data?.user) {
        throw new Error('O login terminou sem uma sessão ativa. Tente novamente.');
      }

      router.replace('/');
    } catch (loginError) {
      console.error('Não foi possível entrar com o Google.', loginError);
      setError(
        loginError instanceof Error
          ? loginError.message
          : 'Não foi possível entrar com o Google.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>CONTA ORBIT ROOM</Text>
        <Text style={styles.title}>Entre com o Google</Text>
        <Text style={styles.description}>
          Entre com o Google para acessar sua conta Orbit Room neste aplicativo.
        </Text>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void signInWithGoogle()}
          style={[styles.button, busy && styles.disabled]}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Continuar com Google</Text>
          )}
        </Pressable>
        <Text style={styles.securityNote}>
          A autenticação acontece no navegador seguro do sistema. A sessão fica
          protegida no dispositivo; a senha do Google nunca é compartilhada com o
          Orbit Room.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>Voltar</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'transparent',
  },
  card: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.24)',
    backgroundColor: 'rgba(13,18,40,0.82)',
  },
  eyebrow: { color: '#a78bfa', fontSize: 11, fontWeight: '800', letterSpacing: 1.7 },
  title: { color: '#f4f3ff', fontSize: 28, fontWeight: '800', marginTop: 10 },
  description: { color: '#a5aec4', fontSize: 15, lineHeight: 23, marginTop: 14 },
  error: {
    color: '#fecdd3',
    backgroundColor: 'rgba(159,18,57,0.2)',
    borderRadius: 12,
    padding: 12,
    marginTop: 18,
  },
  notice: { color: '#c4b5fd', marginTop: 16 },
  button: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    padding: 14,
    marginTop: 24,
    backgroundColor: '#6366f1',
  },
  disabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  securityNote: { color: '#818ba4', fontSize: 12, lineHeight: 19, marginTop: 18 },
  backButton: { alignSelf: 'center', padding: 14, marginTop: 10 },
  backText: { color: '#c4b5fd', fontSize: 14, fontWeight: '700' },
});
