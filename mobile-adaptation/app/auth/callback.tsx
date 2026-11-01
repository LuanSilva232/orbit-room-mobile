import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  clearPendingMobileAuthVerifier,
  getPendingMobileAuthVerifier,
  saveMobileAuthToken,
} from '../../lib/auth-session';
import { apiRequest } from '../../lib/api';

const mobileExchanges = new Map<string, Promise<{ token: string }>>();

function exchangeCodeOnce(code: string, verifier: string): Promise<{ token: string }> {
  const cached = mobileExchanges.get(code);
  if (cached) return cached;

  const exchange = apiRequest<{ token: string }>('/api/auth/mobile/exchange', {
    method: 'POST',
    body: JSON.stringify({ code, verifier }),
  });
  mobileExchanges.set(code, exchange);
  const release = () => {
    setTimeout(() => mobileExchanges.delete(code), 60_000);
  };
  void exchange.then(release, release);
  return exchange;
}

export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{ code?: string; error?: string }>();
  const code = typeof params.code === 'string' ? params.code : '';
  const authError = typeof params.error === 'string' ? params.error : '';
  const [message, setMessage] = useState('Concluindo o login seguro...');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let mounted = true;
    const completeLogin = async () => {
      try {
        if (authError) {
          throw new Error(`O login não foi concluído (${authError}).`);
        }
        if (!code) throw new Error('O servidor não retornou um código de login.');
        const verifier = await getPendingMobileAuthVerifier();
        if (!verifier) throw new Error('A verificação do login expirou. Tente novamente.');
        const session = await exchangeCodeOnce(code, verifier);
        if (!session.token) throw new Error('O servidor não retornou uma sessão válida.');
        await saveMobileAuthToken(session.token);
        await clearPendingMobileAuthVerifier();
        if (mounted) router.replace('/');
      } catch (callbackError) {
        await clearPendingMobileAuthVerifier();
        if (mounted) {
          setFailed(true);
          setMessage(
            callbackError instanceof Error
              ? callbackError.message
              : 'Não foi possível concluir o login.'
          );
        }
      }
    };

    void completeLogin();
    return () => {
      mounted = false;
    };
  }, [authError, code]);

  return (
    <View style={styles.screen}>
      {!failed ? <ActivityIndicator color="#a78bfa" size="large" /> : null}
      <Text accessibilityRole={failed ? 'alert' : undefined} style={failed ? styles.error : styles.message}>
        {message}
      </Text>
      {failed ? (
        <Pressable onPress={() => router.replace('/login')} style={styles.button}>
          <Text style={styles.buttonText}>Voltar ao login</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
    backgroundColor: '#080d1d',
  },
  message: { color: '#c4b5fd', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  error: { color: '#fecdd3', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  button: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: '#6366f1',
  },
  buttonText: { color: '#fff', fontWeight: '800' },
});
