import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ThemedText as Text,
  ThemedTextInput as TextInput,
  ThemedView as View,
} from '../components/themed-primitives';
import { apiRequest } from '../lib/api';
import { loadGuestProfile } from '../lib/guest-profile';
import { useResponsiveLayout } from '../lib/responsive-layout';

type Room = {
  id: string;
  name: string;
  isPrivate: boolean;
  ownerId: string;
  hasPassword: boolean;
  capacity: number;
  ownerName?: string;
};
type RoomInvite = {
  id: string;
  roomId: string;
  roomName: string;
  fromName: string;
  expiresAt: number;
};
type Friend = { id: string; name: string };
type UserProfile = { name: string; bio: string | null; photo: string | null; cover: string | null };

export default function RoomsScreen() {
  const { horizontalPadding, pageMaxWidth } = useResponsiveLayout();
  const params = useLocalSearchParams<{ inviteRoomId?: string; section?: string }>();
  const section =
    typeof params.section === 'string' &&
    ['private', 'mine', 'create'].includes(params.section)
      ? params.section
      : '';
  const highlightedInviteRoomId =
    typeof params.inviteRoomId === 'string' ? params.inviteRoomId : '';
  const [rooms, setRooms] = useState<Room[]>([]);
  const [publicRooms, setPublicRooms] = useState<Room[]>([]);
  const [activePrivateRooms, setActivePrivateRooms] = useState<Room[]>([]);
  const [invites, setInvites] = useState<RoomInvite[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [roomName, setRoomName] = useState('');
  const [password, setPassword] = useState('');
  const [roomPasswords, setRoomPasswords] = useState<Record<string, string>>({});
  const [isPrivate, setIsPrivate] = useState(true);
  const [capacity, setCapacity] = useState(8);
  const [editingRoomId, setEditingRoomId] = useState('');
  const [inviteRoomId, setInviteRoomId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    const [mine, received, social, accountProfile, publicList, privateList] = await Promise.all([
      apiRequest<{ rooms: Room[] }>('/api/rooms?mine=1'),
      apiRequest<{ roomInvites: RoomInvite[] }>('/api/rooms?invites=1'),
      apiRequest<{ friends: Friend[] }>('/api/social'),
      apiRequest<{ profile: UserProfile }>('/api/profile'),
      apiRequest<{ rooms: Room[] }>('/api/rooms'),
      apiRequest<{ rooms: Room[] }>('/api/rooms?private=1'),
    ]);
    setRooms(mine.rooms);
    setPublicRooms(publicList.rooms);
    setActivePrivateRooms(privateList.rooms);
    setInvites(received.roomInvites);
    setFriends(social.friends);
    setProfile(accountProfile.profile);
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
              : 'Entre com o Google para acessar suas salas.'
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

  const saveRoom = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await apiRequest<{ room: Room }>('/api/rooms', {
        method: editingRoomId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...(editingRoomId ? { id: editingRoomId } : {}),
          name: roomName.trim(),
          isPrivate,
          password: isPrivate ? password : '',
          capacity,
        }),
      });
      setRoomName('');
      setPassword('');
      setEditingRoomId('');
      setNotice(`Sala "${result.room.name}" ${editingRoomId ? 'atualizada' : 'criada'}.`);
      await refresh();
    } catch (createError) {
      console.error('Não foi possível criar a sala.', createError);
      setError(createError instanceof Error ? createError.message : 'Não foi possível criar a sala.');
    } finally {
      setBusy(false);
    }
  };

  const editRoom = (room: Room) => {
    setEditingRoomId(room.id);
    setRoomName(room.name);
    setIsPrivate(room.isPrivate);
    setCapacity(room.capacity);
    setPassword('');
  };

  const joinRoom = async (room: Pick<Room, 'id' | 'name'>, roomPassword = '') => {
    setBusy(true);
    setError('');
    try {
      const [guest, accountProfile] = await Promise.all([
        loadGuestProfile(),
        profile ? Promise.resolve(profile) : apiRequest<{ profile: UserProfile }>('/api/profile').then((r) => r.profile),
      ]);
      const name = accountProfile.name.trim();
      if (!name) throw new Error('Salve um nome no seu perfil antes de entrar em uma sala.');
      await apiRequest('/api/rtc', {
        method: 'POST',
        body: JSON.stringify({
          action: 'join',
          clientId: guest.clientId,
          name,
          photo: accountProfile.photo,
          bio: accountProfile.bio,
          cover: accountProfile.cover,
          channel: room.id,
          password: roomPassword,
          device: 'mobile',
        }),
      });
      router.replace({ pathname: '/', params: { roomId: room.id, roomName: room.name } });
    } catch (joinError) {
      console.error('Não foi possível entrar na sala.', joinError);
      setError(joinError instanceof Error ? joinError.message : 'Não foi possível entrar na sala.');
    } finally {
      setBusy(false);
    }
  };

  const inviteFriend = async (roomId: string, friend: Friend) => {
    setBusy(true);
    setError('');
    try {
      await apiRequest('/api/rooms/invite', {
        method: 'POST',
        body: JSON.stringify({ roomId, toUserId: friend.id }),
      });
      setNotice(`Convite enviado para ${friend.name}.`);
    } catch (inviteError) {
      console.error('Não foi possível enviar o convite da sala.', inviteError);
      setError(inviteError instanceof Error ? inviteError.message : 'Não foi possível enviar o convite.');
    } finally {
      setBusy(false);
    }
  };

  const deleteRoom = async (room: Room) => {
    setBusy(true);
    setError('');
    try {
      await apiRequest(`/api/rooms?id=${encodeURIComponent(room.id)}`, { method: 'DELETE' });
      setNotice(`Sala "${room.name}" excluída.`);
      await refresh();
    } catch (deleteError) {
      console.error('Não foi possível excluir a sala.', deleteError);
      setError(deleteError instanceof Error ? deleteError.message : 'Não foi possível excluir a sala.');
    } finally {
      setBusy(false);
    }
  };

  const clearInvite = async (invite: RoomInvite) => {
    setBusy(true);
    setError('');
    try {
      await apiRequest(
        `/api/rooms/invite?roomId=${encodeURIComponent(invite.roomId)}`,
        { method: 'DELETE' }
      );
      await refresh();
    } catch (inviteError) {
      console.error('Não foi possível recusar o convite.', inviteError);
      setError(inviteError instanceof Error ? inviteError.message : 'Não foi possível recusar o convite.');
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

  if (!profile) {
    const signInMessage = /unauthorized|401|faça login/i.test(error)
      ? 'Entre com o Google para acessar suas salas.'
      : error || 'Entre com o Google para acessar suas salas.';
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{signInMessage}</Text>
        <Pressable onPress={() => router.push('/login')} style={styles.button}>
          <Text style={styles.buttonText}>Entrar com Google</Text>
        </Pressable>
        <Pressable
          onPress={() => router.back()}
          style={styles.secondaryButton}
        >
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
      <Text style={styles.eyebrow}>
        {section === 'mine' ? 'SUAS SALAS' : section === 'create' ? 'NOVA SALA' : 'ESPAÇOS PRIVADOS'}
      </Text>
      <Text style={styles.title}>
        {section === 'mine' ? 'Minhas salas' : section === 'create' ? 'Criar sala' : 'Salas privadas'}
      </Text>
      {error ? <Text accessibilityRole="alert" style={styles.errorBanner}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      {!section || section === 'private' ? (
      <>
      <Text style={styles.sectionTitle}>Convites recebidos ({invites.length})</Text>
      {highlightedInviteRoomId &&
      invites.some((invite) => invite.roomId === highlightedInviteRoomId) ? (
        <Text style={styles.notice}>
          Você recebeu um convite para esta sala. Toque em Entrar para aceitar.
        </Text>
      ) : null}
      {invites.length === 0 ? <Text style={styles.muted}>Nenhum convite ativo.</Text> : null}
      {invites.map((invite) => (
        <View
          key={invite.id}
          style={[
            styles.card,
            invite.roomId === highlightedInviteRoomId && styles.highlightedInvite,
          ]}
        >
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>{invite.roomName}</Text>
            <Text style={styles.muted}>Convite de {invite.fromName}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void joinRoom({ id: invite.roomId, name: invite.roomName })}
            style={styles.smallButton}
          >
            <Text style={styles.buttonText}>Entrar</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void clearInvite(invite)}
            style={styles.secondaryButton}
          >
            <Text style={styles.rejectText}>Recusar</Text>
          </Pressable>
        </View>
      ))}

      <Text style={styles.sectionTitle}>Salas públicas ativas ({publicRooms.length})</Text>
      {publicRooms.length === 0 ? <Text style={styles.muted}>Nenhuma sala personalizada pública está ativa.</Text> : null}
      {publicRooms.map((room) => (
        <View key={room.id} style={styles.card}>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>{room.name}</Text>
            <Text style={styles.muted}>Criada por {room.ownerName ?? 'Orbit Room'}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void joinRoom(room)}
            style={styles.smallButton}
          >
            <Text style={styles.buttonText}>Entrar</Text>
          </Pressable>
        </View>
      ))}

      <Text style={styles.sectionTitle}>Salas privadas ativas ({activePrivateRooms.length})</Text>
      {activePrivateRooms.length === 0 ? <Text style={styles.muted}>Nenhuma sala privada está ativa.</Text> : null}
      {activePrivateRooms.map((room) => (
        <View key={room.id} style={styles.privateRoomCard}>
          <Text style={styles.cardTitle}>{room.name}</Text>
          <Text style={styles.muted}>Criada por {room.ownerName ?? 'Orbit Room'}</Text>
          <View style={styles.privateJoinRow}>
            <TextInput
              accessibilityLabel={`Senha da sala ${room.name}`}
              onChangeText={(value) => setRoomPasswords((current) => ({ ...current, [room.id]: value }))}
              placeholder="Senha da sala"
              placeholderTextColor="#8790a8"
              secureTextEntry
              style={styles.passwordInput}
              value={roomPasswords[room.id] ?? ''}
            />
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void joinRoom(room, roomPasswords[room.id] ?? '')}
              style={styles.smallButton}
            >
              <Text style={styles.buttonText}>Entrar</Text>
            </Pressable>
          </View>
        </View>
      ))}
      </>
      ) : null}

      {!section || section === 'create' || (section === 'mine' && Boolean(editingRoomId)) ? (
      <>
      <Text style={styles.sectionTitle}>Criar sala</Text>
      <View style={styles.formCard}>
        <TextInput
          accessibilityLabel="Nome da sala"
          maxLength={30}
          onChangeText={setRoomName}
          placeholder="Nome da sala"
          placeholderTextColor="#8790a8"
          style={styles.input}
          value={roomName}
        />
        <View style={styles.switchRow}>
          <Text style={styles.fieldLabel}>Sala privada</Text>
          <Switch
            accessibilityLabel="Sala privada"
            onValueChange={setIsPrivate}
            thumbColor={isPrivate ? '#fff' : '#cbd5e1'}
            trackColor={{ false: '#34405b', true: '#6366f1' }}
            value={isPrivate}
          />
        </View>
        {isPrivate ? (
          <TextInput
            accessibilityLabel="Senha da sala"
            maxLength={30}
            onChangeText={setPassword}
            placeholder={editingRoomId ? 'Nova senha (vazio mantém a atual)' : 'Senha (obrigatória para sala privada)'}
            placeholderTextColor="#8790a8"
            secureTextEntry
            style={styles.input}
            value={password}
          />
        ) : null}
        <Text style={styles.fieldLabel}>Limite de pessoas</Text>
        <View style={styles.capacityRow}>
          {[0, 4, 8, 16].map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              onPress={() => setCapacity(value)}
              style={[styles.capacityOption, capacity === value && styles.capacitySelected]}
            >
              <Text style={styles.capacityText}>{value === 0 ? 'Sem limite' : value}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={busy || !roomName.trim() || (isPrivate && !editingRoomId && !password.trim())}
          onPress={() => void saveRoom()}
          style={[
            styles.button,
            (busy || !roomName.trim() || (isPrivate && !editingRoomId && !password.trim())) && styles.disabled,
          ]}
        >
          <Text style={styles.buttonText}>
            {busy ? 'Aguarde...' : editingRoomId ? 'Salvar alterações' : 'Criar sala'}
          </Text>
        </Pressable>
        {editingRoomId ? (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => {
              setEditingRoomId('');
              setRoomName('');
              setPassword('');
            }}
            style={styles.cancelEdit}
          >
            <Text style={styles.secondaryText}>Cancelar edição</Text>
          </Pressable>
        ) : null}
      </View>
      </>
      ) : null}

      {!section || section === 'mine' ? (
      <>
      <Text style={styles.sectionTitle}>Minhas salas ({rooms.length})</Text>
      {rooms.length === 0 ? <Text style={styles.muted}>Você ainda não criou salas.</Text> : null}
      {rooms.map((room) => (
        <View key={room.id} style={styles.roomCard}>
          <View style={styles.card}>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{room.name}</Text>
              <Text style={styles.muted}>
                {room.isPrivate ? 'Privada' : 'Pública'}
                {room.capacity ? ` · limite ${room.capacity}` : ' · sem limite'}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => editRoom(room)}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryText}>Editar</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => {
                setInviteRoomId(inviteRoomId === room.id ? '' : room.id);
              }}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryText}>Convidar</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void joinRoom(room)}
              style={styles.smallButton}
            >
              <Text style={styles.buttonText}>Entrar</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void deleteRoom(room)}
              style={styles.secondaryButton}
            >
              <Text style={styles.rejectText}>Excluir</Text>
            </Pressable>
          </View>
          {inviteRoomId === room.id ? (
            <View style={styles.invitePanel}>
              {friends.length === 0 ? (
                <Text style={styles.muted}>Adicione amigos antes de enviar convites.</Text>
              ) : friends.map((friend) => (
                <View key={friend.id} style={styles.friendRow}>
                  <Text style={styles.cardTitle}>{friend.name}</Text>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => void inviteFriend(room.id, friend)}
                    style={styles.smallButton}
                  >
                    <Text style={styles.buttonText}>Convidar</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ))}
      </>
      ) : null}
    </ScrollView>
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
  eyebrow: { color: '#a78bfa', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  title: { color: '#f4f3ff', fontSize: 28, fontWeight: '800', marginTop: 6 },
  sectionTitle: { color: '#f4f3ff', fontSize: 16, fontWeight: '800', marginTop: 24, marginBottom: 10 },
  formCard: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(13,18,40,0.76)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 10,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(13,18,40,0.76)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
  },
  roomCard: { marginBottom: 6 },
  privateRoomCard: {
    padding: 12,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(13,18,40,0.76)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    gap: 8,
  },
  privateJoinRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  passwordInput: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    color: '#f8fafc',
    backgroundColor: 'rgba(4,8,20,0.8)',
    fontSize: 13,
  },
  cardText: { flex: 1, gap: 3 },
  cardTitle: { color: '#e5e7f2', fontSize: 13, fontWeight: '700' },
  muted: { color: '#8992ab', fontSize: 12, lineHeight: 18 },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingHorizontal: 13,
    color: '#f8fafc',
    backgroundColor: 'rgba(4,8,20,0.8)',
    fontSize: 14,
  },
  switchRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldLabel: { color: '#cbd5e1', fontSize: 13, fontWeight: '700' },
  capacityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  capacityOption: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#1e293b',
  },
  capacitySelected: { backgroundColor: '#4f46e5' },
  capacityText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  button: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 11,
    backgroundColor: '#6366f1',
  },
  smallButton: {
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: '#6366f1',
  },
  buttonText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  disabled: { opacity: 0.55 },
  secondaryButton: { paddingHorizontal: 8, paddingVertical: 8 },
  cancelEdit: { alignItems: 'center', padding: 8 },
  secondaryText: { color: '#c4b5fd', fontSize: 12, fontWeight: '700' },
  rejectText: { color: '#fda4af', fontSize: 11, fontWeight: '700' },
  invitePanel: {
    marginLeft: 12,
    marginBottom: 10,
    padding: 10,
    borderLeftWidth: 2,
    borderLeftColor: '#6366f1',
    gap: 8,
  },
  friendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  error: { color: '#fecdd3', textAlign: 'center', lineHeight: 20 },
  errorBanner: { color: '#fecdd3', marginTop: 14, lineHeight: 20 },
  notice: { color: '#a7f3d0', marginTop: 14, fontSize: 13 },
  highlightedInvite: { borderWidth: 1, borderColor: '#a78bfa' },
});
