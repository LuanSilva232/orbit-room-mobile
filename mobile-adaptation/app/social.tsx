import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { router } from 'expo-router';
import {
  ThemedText as Text,
  ThemedTextInput as TextInput,
  ThemedView as View,
} from '../components/themed-primitives';
import { apiRequest } from '../lib/api';
import { openActiveChannelChat } from '../lib/active-channel';
import { useResponsiveLayout } from '../lib/responsive-layout';

type Friend = {
  id: string;
  name: string;
  photo: string | null;
  online: boolean;
  channelId: string | null;
  lastSeen: number | null;
};

type FriendRequest = {
  requestId: string;
  fromId: string;
  displayName: string;
  photo: string | null;
};

type SocialData = {
  me: {
    friendCode: string;
    friendsCount: number;
    followersCount: number;
    followingCount: number;
  };
  friends: Friend[];
  requests: FriendRequest[];
  followers: { id: string; displayName: string; photo?: string | null }[];
  following: { id: string; displayName: string; photo?: string | null }[];
};

export default function SocialScreen() {
  const { horizontalPadding, pageMaxWidth } = useResponsiveLayout();
  const [data, setData] = useState<SocialData | null>(null);
  const [friendCode, setFriendCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    const result = await apiRequest<SocialData>('/api/social');
    setData(result);
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        await refresh();
      } catch (loadError) {
        if (mounted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Não foi possível carregar seus contatos.'
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [refresh]);

  const runSocialAction = async (
    body: Record<string, string>,
    successMessage: string
  ) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await apiRequest<{ ok: boolean; message: string }>('/api/social', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setFriendCode('');
      setNotice(successMessage);
      await refresh();
    } catch (actionError) {
      console.error('Não foi possível atualizar a lista social.', actionError);
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'Não foi possível concluir esta ação.'
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#a78bfa" size="large" />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error || 'Entre com o Google para usar os recursos sociais.'}</Text>
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
      contentContainerStyle={[
        styles.content,
        { width: '100%', maxWidth: pageMaxWidth, alignSelf: 'center', paddingHorizontal: horizontalPadding },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>Voltar</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void refresh().catch((refreshError: unknown) => {
            setError(refreshError instanceof Error ? refreshError.message : 'Falha ao atualizar.');
          })}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryText}>Atualizar</Text>
        </Pressable>
      </View>
      <View style={styles.chatSwitcher}>
        <Pressable
          accessibilityRole="button"
          onPress={openActiveChannelChat}
          style={styles.chatSwitch}
        >
          <Text style={styles.chatSwitchText}>🎧 Canal</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.navigate('/messages')}
          style={styles.chatSwitch}
        >
          <Text style={styles.chatSwitchText}>💬 Conversas</Text>
        </Pressable>
        <View style={[styles.chatSwitch, styles.chatSwitchSelected]}>
          <Text style={styles.chatSwitchSelectedText}>🤝 Amigos</Text>
        </View>
      </View>
      <Text style={styles.eyebrow}>COMUNIDADE</Text>
      <Text style={styles.title}>Amigos</Text>
      <Text style={styles.subtitle}>
        Amigos {data.me.friendsCount} · seguidores {data.me.followersCount} · seguindo {data.me.followingCount}
      </Text>

      {error ? <Text accessibilityRole="alert" style={styles.errorBanner}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <View style={styles.codeCard}>
        <Text style={styles.sectionTitle}>Seu código de amigo</Text>
        <Text selectable style={styles.code}>{data.me.friendCode || '—'}</Text>
        <Text style={styles.muted}>Compartilhe este código para receber solicitações.</Text>
      </View>

      <Text style={styles.sectionTitle}>Adicionar amigo</Text>
      <View style={styles.addRow}>
        <TextInput
          accessibilityLabel="Código de amigo"
          autoCapitalize="characters"
          maxLength={12}
          onChangeText={setFriendCode}
          placeholder="Digite o código"
          placeholderTextColor="#8790a8"
          style={styles.input}
          value={friendCode}
        />
        <Pressable
          accessibilityRole="button"
          disabled={busy || !friendCode.trim()}
          onPress={() => void runSocialAction(
            { action: 'send-request', toCode: friendCode.trim().toUpperCase() },
            'Solicitação enviada.'
          )}
          style={[styles.smallButton, (busy || !friendCode.trim()) && styles.disabled]}
        >
          <Text style={styles.buttonText}>{busy ? '...' : 'Enviar'}</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Solicitações recebidas ({data.requests.length})</Text>
      {data.requests.length === 0 ? (
        <Text style={styles.empty}>Você não tem solicitações pendentes.</Text>
      ) : data.requests.map((request) => (
        <View key={request.requestId} style={styles.card}>
          <UserAvatar name={request.displayName} photo={request.photo} />
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>{request.displayName}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void runSocialAction(
              { action: 'accept-request', fromUserId: request.fromId },
              'Solicitação aceita.'
            )}
            style={styles.smallButton}
          >
            <Text style={styles.buttonText}>Aceitar</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void runSocialAction(
              { action: 'decline-request', fromUserId: request.fromId },
              'Solicitação recusada.'
            )}
            style={styles.rejectButton}
          >
            <Text style={styles.rejectText}>Recusar</Text>
          </Pressable>
        </View>
      ))}

      <Text style={styles.sectionTitle}>Seus amigos ({data.friends.length})</Text>
      {data.friends.length === 0 ? (
        <Text style={styles.empty}>Adicione amigos usando o código acima.</Text>
      ) : data.friends.map((friend) => (
        <View key={friend.id} style={styles.card}>
          <UserAvatar name={friend.name} photo={friend.photo} />
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>{friend.name}</Text>
            <Text style={styles.muted}>
              {friend.online
                ? friend.channelId
                  ? `Online · ${friend.channelId}`
                  : 'Online'
                : 'Offline'}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => router.push({
              pathname: '/messages',
              params: { userId: friend.id, userName: friend.name },
            })}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryText}>Mensagem</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void runSocialAction(
              { action: 'remove-friend', userId: friend.id },
              'Amizade removida.'
            )}
            style={styles.rejectButton}
          >
            <Text style={styles.rejectText}>Remover</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

function UserAvatar({ name, photo }: { name: string; photo: string | null }) {
  if (photo) return <Image source={{ uri: photo }} style={styles.avatar} />;
  return (
    <View style={[styles.avatar, styles.avatarFallback]}>
      <Text style={styles.avatarInitial}>{name.slice(0, 1).toUpperCase()}</Text>
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
    backgroundColor: 'transparent',
  },
  content: { paddingVertical: 20, paddingBottom: 48, flexGrow: 1 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  chatSwitcher: {
    flexDirection: 'row',
    gap: 8,
    padding: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(4,8,20,0.42)',
  },
  chatSwitch: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  chatSwitchSelected: { backgroundColor: 'rgba(217,70,239,0.2)' },
  chatSwitchText: { color: '#8992ab', fontSize: 12, fontWeight: '700' },
  chatSwitchSelectedText: { color: '#f0abfc', fontSize: 12, fontWeight: '800' },
  eyebrow: { color: '#a78bfa', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  title: { color: '#f4f3ff', fontSize: 28, fontWeight: '800', marginTop: 6 },
  subtitle: { color: '#8992ab', fontSize: 12, marginTop: 6, lineHeight: 18 },
  codeCard: {
    marginTop: 22,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.28)',
    backgroundColor: 'rgba(13,18,40,0.82)',
  },
  sectionTitle: { color: '#f4f3ff', fontSize: 16, fontWeight: '800', marginTop: 24, marginBottom: 10 },
  code: { color: '#c4b5fd', fontSize: 24, fontWeight: '900', letterSpacing: 3, marginVertical: 8 },
  muted: { color: '#8992ab', fontSize: 12 },
  addRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingHorizontal: 14,
    color: '#f8fafc',
    backgroundColor: 'rgba(4,8,20,0.8)',
    fontSize: 14,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 68,
    padding: 10,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(13,18,40,0.76)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
  },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#252d45' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#c4b5fd', fontWeight: '800' },
  cardText: { flex: 1 },
  cardTitle: { color: '#e5e7f2', fontSize: 13, fontWeight: '700' },
  smallButton: {
    minHeight: 38,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 11,
    borderRadius: 10,
    backgroundColor: '#6366f1',
  },
  button: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#6366f1',
  },
  buttonText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  disabled: { opacity: 0.55 },
  rejectButton: { paddingHorizontal: 8, paddingVertical: 8 },
  rejectText: { color: '#fda4af', fontSize: 11, fontWeight: '700' },
  secondaryButton: { paddingHorizontal: 8, paddingVertical: 8 },
  secondaryText: { color: '#c4b5fd', fontSize: 12, fontWeight: '700' },
  empty: { color: '#8992ab', fontSize: 13, lineHeight: 20 },
  error: { color: '#fecdd3', textAlign: 'center', lineHeight: 20 },
  errorBanner: { color: '#fecdd3', marginTop: 14, lineHeight: 20 },
  notice: { color: '#a7f3d0', marginTop: 14, fontSize: 13 },
});
