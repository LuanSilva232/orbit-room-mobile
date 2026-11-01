import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import { apiRequest, getApiConfiguration } from '../../lib/api';
import {
  clearPendingMobileAuthVerifier,
  getMobileAuthToken,
  savePendingMobileAuthVerifier,
} from '../../lib/auth-session';

type AuthUser = {
  id: string;
  email: string;
  name: string;
  photo: string | null;
};

export default function AccountScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const signInWithGoogle = async () => {
    if (Platform.OS === 'web') {
      setError('O login Google está disponível no aplicativo Android e iOS.');
      return;
    }

    const { baseUrl, error: configurationError } = getApiConfiguration();
    if (!baseUrl) {
      setError(configurationError ?? 'Configure a URL do servidor antes de entrar.');
      return;
    }

    setBusy(true);
    setError('');
    setNotice('');
    try {
      const verifier =
        Crypto.randomUUID().replace(/-/g, '') + Crypto.randomUUID().replace(/-/g, '');
      const challenge = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        verifier
      );
      await savePendingMobileAuthVerifier(verifier);
      const redirectUrl = Linking.createURL('auth/callback');
      const result = await WebBrowser.openAuthSessionAsync(
        `${baseUrl}/api/auth/mobile/login?challenge=${challenge}`,
        redirectUrl
      );
      if (result.type !== 'success' || !result.url) {
        await clearPendingMobileAuthVerifier();
        if (result.type === 'cancel' || result.type === 'dismiss') {
          setNotice('Login cancelado.');
          return;
        }
        throw new Error('Não foi possível concluir o login com o Google.');
      }

      for (let attempt = 0; attempt < 60; attempt += 1) {
        const token = await getMobileAuthToken();
        if (token) {
          await apiRequest<{ user: AuthUser }>('/api/auth/me');
          router.replace('/');
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      throw new Error('O retorno do login demorou demais. Tente novamente.');
    } catch (loginError) {
      console.error('Não foi possível entrar com o Google.', loginError);
      await clearPendingMobileAuthVerifier();
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
      <Text style={styles.eyebrow}>CONTA ORBIT ROOM</Text>
      <Text style={styles.title}>Entre com o Google</Text>
      <Text style={styles.description}>
        Use a mesma conta do website. Seu perfil, amizades e salas ficam
        sincronizados pelo servidor Orbit Room.
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
        A autenticação acontece no navegador seguro do sistema. O app guarda
        somente uma sessão protegida no dispositivo; a senha do Google nunca é
        compartilhada com o Orbit Room.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.back()}
        style={styles.backButton}
      >
        <Text style={styles.backText}>Voltar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#080d1d',
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
