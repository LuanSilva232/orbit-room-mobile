import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { apiRequest } from '../lib/api';
import { clearMobileAuthToken } from '../lib/auth-session';
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushNotificationsEnabled,
} from '../lib/push-notifications';

type ProfileData = {
  name: string;
  bio: string | null;
  photo: string | null;
  cover: string | null;
  friendCode: string;
  privacy: {
    showOnline: boolean;
    showLastseen: boolean;
    showRoom: boolean;
  };
};

type AuthUser = { email: string };

export default function ProfileScreen() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [privacy, setPrivacy] = useState<ProfileData['privacy']>({
    showOnline: true,
    showLastseen: true,
    showRoom: true,
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadProfile = useCallback(async () => {
    const [account, response, notificationsEnabled] = await Promise.all([
      apiRequest<{ user: AuthUser }>('/api/auth/me'),
      apiRequest<{ profile: ProfileData }>('/api/profile'),
      getPushNotificationsEnabled(),
    ]);
    setEmail(account.user.email);
    setProfile(response.profile);
    setName(response.profile.name);
    setBio(response.profile.bio ?? '');
    setPrivacy(response.profile.privacy);
    setPushEnabled(notificationsEnabled);
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        await loadProfile();
      } catch (loadError) {
        if (!mounted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Não foi possível carregar seu perfil.'
        );
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [loadProfile]);

  const save = async () => {
    if (!profile) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await apiRequest<{ profile: ProfileData }>('/api/profile', {
        method: 'PUT',
        body: JSON.stringify({
          name,
          bio,
          photo: profile.photo,
          cover: profile.cover,
          privacy,
        }),
      });
      setProfile({ ...profile, ...result.profile, privacy });
      setName(result.profile.name);
      setBio(result.profile.bio ?? '');
      setNotice('Perfil atualizado e sincronizado com o website.');
    } catch (saveError) {
      console.error('Não foi possível salvar o perfil.', saveError);
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Não foi possível salvar seu perfil.'
      );
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    setError('');
    try {
      await disablePushNotifications();
      await apiRequest<{ ok: boolean }>('/api/auth/mobile/logout', { method: 'POST' });
      await clearMobileAuthToken();
      router.replace('/');
    } catch (logoutError) {
      console.error('Não foi possível revogar a sessão no servidor.', logoutError);
      setError(
        logoutError instanceof Error
          ? `Não foi possível encerrar a sessão. Tente novamente: ${logoutError.message}`
          : 'Não foi possível encerrar a sessão. Tente novamente.'
      );
    } finally {
      setBusy(false);
    }
  };

  const togglePushNotifications = async (enabled: boolean) => {
    setPushBusy(true);
    setError('');
    setNotice('');
    try {
      if (enabled) {
        await enablePushNotifications();
        setPushEnabled(true);
        setNotice('Notificações de mensagens, convites e solicitações ativadas.');
      } else {
        await disablePushNotifications();
        setPushEnabled(false);
        setNotice('Notificações desativadas neste aparelho.');
      }
    } catch (toggleError) {
      console.error('Não foi possível atualizar as notificações.', toggleError);
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : 'Não foi possível atualizar as notificações.'
      );
    } finally {
      setPushBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#a78bfa" size="large" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error || 'Entre com o Google para abrir seu perfil.'}</Text>
        <Pressable onPress={() => router.push('/login')} style={styles.button}>
          <Text style={styles.buttonText}>Entrar com Google</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>Voltar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>Voltar</Text>
        </Pressable>
        <Text style={styles.eyebrow}>MEU PERFIL</Text>
      </View>
      <View style={styles.identity}>
        {profile.photo ? (
          <Image source={{ uri: profile.photo }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitial}>{profile.name.slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.identityText}>
          <Text style={styles.title}>{profile.name}</Text>
          <Text style={styles.muted}>{email}</Text>
          <Text style={styles.muted}>Código de amigo: {profile.friendCode || '—'}</Text>
        </View>
      </View>

      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <Text style={styles.label}>Nome</Text>
      <TextInput
        accessibilityLabel="Nome do perfil"
        maxLength={60}
        onChangeText={setName}
        placeholder="Seu nome"
        placeholderTextColor="#8790a8"
        style={styles.input}
        value={name}
      />
      <Text style={styles.label}>Biografia</Text>
      <TextInput
        accessibilityLabel="Biografia"
        maxLength={240}
        multiline
        onChangeText={setBio}
        placeholder="Conte um pouco sobre você"
        placeholderTextColor="#8790a8"
        style={[styles.input, styles.bioInput]}
        value={bio}
      />

      <Text style={styles.sectionTitle}>Privacidade</Text>
      <PrivacyOption
        label="Mostrar quando estou online"
        value={privacy.showOnline}
        onChange={(showOnline) => setPrivacy((current) => ({ ...current, showOnline }))}
      />
      <PrivacyOption
        label="Mostrar última atividade"
        value={privacy.showLastseen}
        onChange={(showLastseen) => setPrivacy((current) => ({ ...current, showLastseen }))}
      />
      <PrivacyOption
        label="Mostrar a sala em que estou"
        value={privacy.showRoom}
        onChange={(showRoom) => setPrivacy((current) => ({ ...current, showRoom }))}
      />

      <Text style={styles.sectionTitle}>Notificações</Text>
      <View style={styles.privacyRow}>
        <Text style={styles.privacyLabel}>
          Mensagens, convites e solicitações sociais
        </Text>
        <Switch
          accessibilityLabel="Ativar notificações de mensagens, convites e solicitações sociais"
          disabled={pushBusy}
          onValueChange={(enabled) => void togglePushNotifications(enabled)}
          thumbColor={pushEnabled ? '#fff' : '#cbd5e1'}
          trackColor={{ false: '#34405b', true: '#6366f1' }}
          value={pushEnabled}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={busy || !name.trim()}
        onPress={() => void save()}
        style={[styles.button, (busy || !name.trim()) && styles.disabled]}
      >
        <Text style={styles.buttonText}>{busy ? 'Salvando...' : 'Salvar perfil'}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => void signOut()}
        style={styles.signOutButton}
      >
        <Text style={styles.signOutText}>Sair da conta</Text>
      </Pressable>
    </ScrollView>
  );
}

function PrivacyOption({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.privacyRow}>
      <Text style={styles.privacyLabel}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        onValueChange={onChange}
        thumbColor={value ? '#fff' : '#cbd5e1'}
        trackColor={{ false: '#34405b', true: '#6366f1' }}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: '#080d1d',
  },
  content: { padding: 20, paddingBottom: 48, backgroundColor: '#080d1d', flexGrow: 1 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: '#a78bfa', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 24 },
  identityText: { flex: 1, gap: 4 },
  avatar: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#252d45' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#c4b5fd', fontSize: 26, fontWeight: '800' },
  title: { color: '#f4f3ff', fontSize: 22, fontWeight: '800' },
  muted: { color: '#8992ab', fontSize: 12 },
  label: { color: '#e5e7f2', fontSize: 13, fontWeight: '700', marginTop: 16 },
  input: {
    minHeight: 48,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingHorizontal: 14,
    color: '#f8fafc',
    backgroundColor: 'rgba(4,8,20,0.8)',
    fontSize: 15,
  },
  bioInput: { minHeight: 100, paddingTop: 12, textAlignVertical: 'top' },
  sectionTitle: { color: '#f4f3ff', fontSize: 17, fontWeight: '800', marginTop: 28 },
  privacyRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  privacyLabel: { color: '#cbd5e1', fontSize: 13, flex: 1, paddingRight: 12 },
  button: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginTop: 24,
    backgroundColor: '#6366f1',
  },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.55 },
  secondaryButton: { paddingVertical: 10, paddingHorizontal: 12 },
  secondaryText: { color: '#c4b5fd', fontWeight: '700' },
  signOutButton: { alignItems: 'center', padding: 15, marginTop: 8 },
  signOutText: { color: '#fda4af', fontWeight: '700' },
  error: { color: '#fecdd3', lineHeight: 20, textAlign: 'center' },
  notice: { color: '#a7f3d0', marginTop: 10, fontSize: 13 },
});
