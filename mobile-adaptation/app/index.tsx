import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import type { ScrollViewInstance } from 'react-native';
import {
  ThemedText as Text,
  ThemedTextInput as TextInput,
  ThemedView as View,
} from '../components/themed-primitives';
import { Link, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { apiRequest, getApiConfiguration } from '../lib/api';
import {
  getActiveCallChannel,
  setActiveCallChannel,
} from '../lib/active-channel';
import { getAuthClient } from '../lib/auth-client';
import {
  loadAppPreferences,
  subscribeAppPreferences,
} from '../lib/app-preferences';
import { useResponsiveLayout } from '../lib/responsive-layout';
import {
  createRtcEngine,
  getRtcDisplayMedia,
  getRtcUserMedia,
  RtcVideoView,
} from '../lib/rtc-runtime';
import type { RtcEngine, RtcMediaStream, RtcTrack } from '../lib/rtc-runtime';
import {
  loadGuestProfile,
  resetGuestProfile,
  saveGuestProfile,
  validateGuestName,
  type GuestProfile,
} from '../lib/guest-profile';
import type { ChatMessage, Channel, MailboxMessage, Member } from '../lib/types';
import { translateText } from '../lib/i18n';
import {
  getChatClearTimestamp,
  loadChatClearTimestamp,
  subscribeChatClearTimestamp,
} from '../lib/chat-history';

const CHANNELS: Channel[] = [
  { id: 'sala-1', label: 'Sala 1', description: 'Conversa aberta' },
  { id: 'sala-2', label: 'Sala 2', description: 'Conversa aberta' },
  { id: 'sala-3', label: 'Sala 3', description: 'Conversa aberta' },
];

type ChannelData = { channel: string; members: Member[] };
type ChatData = { messages: ChatMessage[] };
type MailboxData = { messages: MailboxMessage[]; members: Member[] };
type RemotePeer = {
  member: Member;
  streams: RtcMediaStream[];
  screenTrackIds: string[];
};

type ApiStatus = 'checking' | 'connected' | 'offline' | 'not-configured';
type AccountProfile = {
  name: string;
  bio: string | null;
  photo: string | null;
  cover: string | null;
};

function ParticipantAvatar({
  member,
  isSpeaking,
  isMuted,
  isCurrentUser,
}: {
  member: Member;
  isSpeaking: boolean;
  isMuted: boolean;
  isCurrentUser: boolean;
}) {
  const [pulse] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (!isSpeaking) {
      pulse.stopAnimation();
      pulse.setValue(1);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.12,
          duration: 360,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 360,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [isSpeaking, pulse]);

  return (
    <View
      accessibilityLabel={`${member.name}${isCurrentUser ? ', você' : ''}${isSpeaking ? ', falando' : ''}`}
      style={styles.participantCard}
    >
      <Animated.View
        style={[
          styles.participantAvatarRing,
          isSpeaking && styles.participantAvatarSpeaking,
          { transform: [{ scale: pulse }] },
        ]}
      >
        {member.photo ? (
          <Image source={{ uri: member.photo }} style={styles.participantPhoto} />
        ) : (
          <Text style={styles.participantInitial}>
            {(member.name || '?').slice(0, 1).toUpperCase()}
          </Text>
        )}
      </Animated.View>
      <Text numberOfLines={1} style={styles.participantName}>
        {member.name}{isCurrentUser ? ' (você)' : ''}
      </Text>
      <Text style={[styles.participantStatus, isSpeaking && styles.participantStatusSpeaking]}>
        {isSpeaking ? 'Falando' : isMuted ? 'Silenciado' : 'Conectado'}
      </Text>
    </View>
  );
}

export default function HomeScreen() {
  const { horizontalPadding, pageMaxWidth } = useResponsiveLayout();
  const params = useLocalSearchParams<{
    roomId?: string;
    roomName?: string;
    tab?: string;
  }>();
  const [guestProfile, setGuestProfile] = useState<GuestProfile | null>(null);
  const [accountProfile, setAccountProfile] = useState<AccountProfile | null>(null);
  const [accountError, setAccountError] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [joinedChannel, setJoinedChannel] = useState<Channel | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatClearTimestamp, setChatClearTimestamp] = useState(0);
  const [messageInput, setMessageInput] = useState('');
  const [callError, setCallError] = useState('');
  const [micEnabled, setMicEnabled] = useState(false);
  const [audioVolume, setAudioVolume] = useState(1);
  const [cameraStream, setCameraStream] = useState<RtcMediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<RtcMediaStream | null>(null);
  const [remotePeers, setRemotePeers] = useState<Record<string, RemotePeer>>({});
  const [speakingParticipants, setSpeakingParticipants] = useState<Set<string>>(
    () => new Set()
  );
  const [loadingIdentity, setLoadingIdentity] = useState(true);
  const [resettingProfile, setResettingProfile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [profileError, setProfileError] = useState('');
  const apiConfiguration = getApiConfiguration();
  const [apiStatus, setApiStatus] = useState<ApiStatus>(
    apiConfiguration.baseUrl ? 'checking' : 'not-configured'
  );
  const [apiStatusMessage, setApiStatusMessage] = useState(
    apiConfiguration.error ?? 'Verificando conexão com o servidor...'
  );
  const clientId = guestProfile?.clientId ?? '';
  const chatClearTimestampRef = useRef(0);
  const name = accountProfile?.name ?? guestProfile?.displayName ?? '';
  const routeRoomId = typeof params.roomId === 'string' ? params.roomId : '';
  const routeRoomName = typeof params.roomName === 'string' ? params.roomName : '';
  const selectedTab = params.tab === 'channel-chat'
    ? 'channel-chat'
    : routeRoomId
      ? 'calls'
      : params.tab === 'calls'
      ? 'calls'
      : params.tab === 'rooms'
        ? 'rooms'
        : 'home';
  const activeChannel = useMemo(
    () =>
      joinedChannel ??
      (routeRoomId && routeRoomName
        ? { id: routeRoomId, label: routeRoomName, description: 'Sala personalizada' }
        : getActiveCallChannel()),
    [joinedChannel, routeRoomId, routeRoomName]
  );
  const visibleMessages = useMemo(
    () => messages.filter((message) => message.time > chatClearTimestamp),
    [chatClearTimestamp, messages]
  );

  useEffect(() => {
    if (!clientId) return;

    let active = true;
    const updateTimestamp = () => {
      const timestamp = getChatClearTimestamp(clientId);
      chatClearTimestampRef.current = timestamp;
      setChatClearTimestamp(timestamp);
    };
    const unsubscribe = subscribeChatClearTimestamp(clientId, updateTimestamp);
    void loadChatClearTimestamp(clientId).then(
      (timestamp) => {
        if (!active) return;
        chatClearTimestampRef.current = timestamp;
        setChatClearTimestamp(timestamp);
      },
      (storageError: unknown) => {
        console.error('Não foi possível carregar o marco de limpeza do chat.', storageError);
      }
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [clientId]);

  const scrollRef = useRef<ScrollViewInstance | null>(null);
  const engineRef = useRef<RtcEngine | null>(null);
  const microphoneStreamRef = useRef<RtcMediaStream | null>(null);
  const cameraStreamRef = useRef<RtcMediaStream | null>(null);
  const screenStreamRef = useRef<RtcMediaStream | null>(null);
  const mediaStreamsRef = useRef(new Set<RtcMediaStream>());
  const remotePeersRef = useRef<Record<string, RemotePeer>>({});

  useEffect(() => {
    let mounted = true;

    async function loadIdentity() {
      try {
        const profile = await loadGuestProfile();
        if (!mounted) return;
        setGuestProfile(profile);
        setNameInput(profile.displayName || 'Anônimo');
      } catch (loadError) {
        console.error('Não foi possível carregar a identidade do app.', loadError);
        if (mounted) {
          setProfileError(
            loadError instanceof Error
              ? loadError.message
              : 'Não foi possível preparar seu perfil neste aparelho.'
          );
        }
      } finally {
        if (mounted) setLoadingIdentity(false);
      }
    }

    void loadIdentity();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeAppPreferences((preferences) => {
      setAudioVolume(preferences.volume);
    });
    void loadAppPreferences().then(
      (preferences) => {
        if (active) setAudioVolume(preferences.volume);
      },
      (preferenceError: unknown) => {
        console.error('Não foi possível carregar o volume das chamadas.', preferenceError);
      }
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      const loadAccountProfile = async () => {
        try {
          if (Platform.OS === 'web' || !getApiConfiguration().baseUrl) {
            if (mounted) {
              setAccountProfile(null);
              setAccountError('');
            }
            return;
          }

          const session = await getAuthClient().getSession();
          if (session.error) throw new Error(session.error.message);
          if (!session.data?.user) {
            if (mounted) {
              setAccountProfile(null);
              setAccountError('');
            }
            return;
          }

          const response = await apiRequest<{ profile: AccountProfile }>('/api/profile');
          if (mounted) {
            setAccountProfile(response.profile);
            setNameInput(response.profile.name);
            setAccountError('');
          }
        } catch (loadError) {
          if (mounted) {
            setAccountProfile(null);
            setAccountError(
              loadError instanceof Error
                ? loadError.message
                : 'Não foi possível carregar sua conta.'
            );
          }
        }
      };

      void loadAccountProfile();
      return () => {
        mounted = false;
      };
    }, [])
  );

  const checkApiConnection = useCallback(async () => {
    if (!apiConfiguration.baseUrl) {
      setApiStatus('not-configured');
      setApiStatusMessage(
        apiConfiguration.error ?? 'Configure a URL do servidor para continuar.'
      );
      return;
    }

    setApiStatus('checking');
    setApiStatusMessage('Verificando conexão com o servidor...');
    try {
      await apiRequest<{ message: string }>('/api/health', { credentials: 'omit' });
      setApiStatus('connected');
      setApiStatusMessage('Servidor conectado.');
    } catch (connectionError) {
      console.error('Não foi possível verificar a conexão com a API.', connectionError);
      setApiStatus('offline');
      setApiStatusMessage(
        connectionError instanceof Error
          ? connectionError.message
          : 'Não foi possível conectar ao servidor.'
      );
    }
  }, [apiConfiguration.error, apiConfiguration.baseUrl]);

  useEffect(() => {
    const baseUrl = apiConfiguration.baseUrl;
    if (!baseUrl) return;

    let mounted = true;
    apiRequest<{ message: string }>('/api/health', { credentials: 'omit' }).then(
      () => {
        if (!mounted) return;
        setApiStatus('connected');
        setApiStatusMessage('Servidor conectado.');
      },
      (connectionError: unknown) => {
        console.error('Não foi possível verificar a conexão com a API.', connectionError);
        if (!mounted) return;
        setApiStatus('offline');
        setApiStatusMessage(
          connectionError instanceof Error
            ? connectionError.message
            : 'Não foi possível conectar ao servidor.'
        );
      }
    );

    return () => {
      mounted = false;
    };
  }, [apiConfiguration.baseUrl]);

  const refreshChannel = useCallback(async (channel: Channel) => {
    const [channelData, chatData] = await Promise.all([
      apiRequest<ChannelData>(
        `/api/rtc?action=sync&clientId=${encodeURIComponent(clientId)}`
      ),
      apiRequest<ChatData>(
        `/api/rtc?action=chat&channel=${encodeURIComponent(channel.id)}&clientId=${encodeURIComponent(clientId)}`
      ),
    ]);

    setMembers(channelData.members);
    setMessages(
      chatData.messages.filter(
        (message) => message.time > chatClearTimestampRef.current
      )
    );
  }, [clientId]);

  useEffect(() => {
    if (!activeChannel || !clientId) return;
    let mounted = true;

    const refresh = async () => {
      if (!mounted) return;
      setRefreshing(true);
      try {
        await refreshChannel(activeChannel);
        if (mounted) setError('');
      } catch (refreshError) {
        console.error('Não foi possível atualizar o canal.', refreshError);
        if (mounted) {
          setError(
            refreshError instanceof Error
              ? refreshError.message
              : 'Não foi possível atualizar o canal.'
          );
        }
      } finally {
        if (mounted) setRefreshing(false);
      }
    };

    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [activeChannel, clientId, refreshChannel]);

  useEffect(() => {
    Object.entries(remotePeers).forEach(([peerId, peer]) => {
      peer.streams.forEach((stream) => {
        stream.getAudioTracks().forEach((track: RtcTrack) => {
          try {
            track._setVolume(audioVolume);
          } catch (volumeError) {
            console.error(
              `Não foi possível ajustar o volume das vozes de ${peerId}.`,
              volumeError
            );
          }
        });
      });
    });
  }, [audioVolume, remotePeers]);

  useEffect(() => {
    if (!joinedChannel || !clientId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const updatePeer = (member: Member) => {
      if (member.clientId === clientId) return;
      const current = remotePeersRef.current[member.clientId];
      if (
        current &&
        current.member.name === member.name &&
        current.member.photo === member.photo &&
        current.member.muted === member.muted
      ) {
        return;
      }
      remotePeersRef.current = {
        ...remotePeersRef.current,
        [member.clientId]: {
          member,
          streams: current?.streams ?? [],
          screenTrackIds: current?.screenTrackIds ?? [],
        },
      };
      setRemotePeers(remotePeersRef.current);
    };

    const updateChannelMembers = (incoming: Member[]) => {
      setMembers((current) => {
        const unchanged =
          current.length === incoming.length &&
          current.every((member, index) => {
            const next = incoming[index];
            return (
              member.clientId === next.clientId &&
              member.name === next.name &&
              member.photo === next.photo &&
              member.muted === next.muted
            );
          });
        return unchanged ? current : incoming;
      });
    };

    const handleMessage = async (message: MailboxMessage) => {
      if (message.type === 'signal') {
        await engineRef.current?.handleSignal(message.from, message.kind, message.data);
      } else if (message.type === 'peer-joined' || message.type === 'peer-updated') {
        updatePeer(message.member);
        engineRef.current?.addPeer(message.member.clientId);
      } else if (message.type === 'peer-left') {
        engineRef.current?.removePeer(message.clientId);
        setMembers((current) => current.filter((member) => member.clientId !== message.clientId));
      } else if (message.type === 'channel-state') {
        const channelMembers = message.members.filter(
          (member) => member.channel === joinedChannel.id && member.clientId !== clientId
        );
        updateChannelMembers(channelMembers);
        channelMembers.forEach((member) => {
          updatePeer(member);
          engineRef.current?.addPeer(member.clientId);
        });
      } else if (message.type === 'chat') {
        if (message.message.channel !== joinedChannel.id) return;
        if (message.message.time <= chatClearTimestampRef.current) return;
        setMessages((current) =>
          current.some((item) => item.id === message.message.id)
            ? current
            : [...current, message.message]
        );
      } else if (message.type === 'chat-deleted') {
        setMessages((current) => current.filter((item) => item.id !== message.messageId));
      } else if (message.type === 'chat-cleared') {
        if (message.channel === joinedChannel.id) setMessages([]);
      } else if (message.type === 'screen-kind') {
        const current = remotePeersRef.current[message.from];
        if (!current) return;
        remotePeersRef.current = {
          ...remotePeersRef.current,
          [message.from]: { ...current, screenTrackIds: message.trackIds },
        };
        setRemotePeers(remotePeersRef.current);
      } else if (message.type === 'peer-mute' || message.type === 'admin-mute') {
        setMembers((current) =>
          current.map((member) =>
            member.clientId === message.targetId
              ? { ...member, muted: message.muted }
              : member
          )
        );
        if (message.targetId === clientId && message.muted) {
          microphoneStreamRef.current?.getAudioTracks().forEach((track) => {
            track.enabled = false;
          });
          setMicEnabled(false);
        }
      } else if (message.type === 'kicked') {
        setError('Você foi desconectado desta sala.');
        void apiRequest('/api/rtc', {
          method: 'POST',
          body: JSON.stringify({ action: 'leave', clientId }),
        }).catch((leaveError: unknown) => {
          console.error('Não foi possível registrar a saída da sala.', leaveError);
        });
        engineRef.current?.closeAll();
        engineRef.current = null;
        for (const stream of mediaStreamsRef.current) {
          stream.getTracks().forEach((track) => track.stop());
        }
        mediaStreamsRef.current.clear();
        microphoneStreamRef.current = null;
        cameraStreamRef.current = null;
        screenStreamRef.current = null;
        setMicEnabled(false);
        setCameraStream(null);
        setScreenStream(null);
        setRemotePeers({});
        remotePeersRef.current = {};
        setJoinedChannel(null);
        setActiveCallChannel(null);
        setSpeakingParticipants(new Set());
        setMembers([]);
        setMessages([]);
      }
    };

    const pollMailbox = async () => {
      try {
        const mailbox = await apiRequest<MailboxData>(
          `/api/rtc?action=mailbox&clientId=${encodeURIComponent(clientId)}`
        );
        if (!active) return;
        const channelMembers = mailbox.members.filter(
          (member) => member.channel === joinedChannel.id && member.clientId !== clientId
        );
        updateChannelMembers(channelMembers);
        channelMembers.forEach((member) => updatePeer(member));
        for (const message of mailbox.messages) {
          if (!active) return;
          await handleMessage(message);
        }
      } catch (pollError) {
        if (active) {
          setCallError(
            pollError instanceof Error
              ? pollError.message
              : 'A conexão de voz perdeu contato com o servidor.'
          );
        }
      } finally {
        if (active) timer = setTimeout(() => void pollMailbox(), 800);
      }
    };

    void pollMailbox();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [clientId, joinedChannel]);

  useEffect(
    () => () => {
      engineRef.current?.closeAll();
      for (const stream of mediaStreamsRef.current) {
        stream.getTracks().forEach((track) => track.stop());
      }
      mediaStreamsRef.current.clear();
    },
    []
  );

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  useEffect(() => {
    if (!joinedChannel || !engineRef.current) {
      setSpeakingParticipants(new Set());
      return;
    }

    let active = true;
    let collecting = false;
    const refreshSpeakingParticipants = async () => {
      if (collecting) return;
      collecting = true;
      try {
        const participants = await engineRef.current?.getSpeakingParticipants();
        if (active && participants) {
          setSpeakingParticipants(new Set(participants));
        }
      } finally {
        collecting = false;
      }
    };

    void refreshSpeakingParticipants();
    const timer = setInterval(() => void refreshSpeakingParticipants(), 600);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [joinedChannel]);

  const stopLocalMedia = useCallback(() => {
    engineRef.current?.closeAll();
    engineRef.current = null;
    for (const stream of mediaStreamsRef.current) {
      stream.getTracks().forEach((track) => track.stop());
    }
    mediaStreamsRef.current.clear();
    microphoneStreamRef.current = null;
    cameraStreamRef.current = null;
    screenStreamRef.current = null;
    setMicEnabled(false);
    setCameraStream(null);
    setScreenStream(null);
    remotePeersRef.current = {};
    setRemotePeers({});
  }, []);

  const joinChannel = async (channel: Channel, navigateToCall = true) => {
    setBusy(true);
    setError('');
    setCallError('');
    let joinAttempted = false;
    try {
      const cleanName = accountProfile
        ? accountProfile.name.trim()
        : validateGuestName(nameInput);
      if (!cleanName) throw new Error('Salve um nome no perfil antes de entrar.');
      if (!guestProfile) throw new Error('O perfil visitante ainda não foi carregado.');
      const savedProfile = accountProfile
        ? guestProfile
        : await saveGuestProfile(clientId, cleanName);
      if (!accountProfile) setGuestProfile(savedProfile);
      joinAttempted = true;
      const result = await apiRequest<ChannelData>('/api/rtc', {
        method: 'POST',
        body: JSON.stringify({
          action: 'join',
          clientId,
          name: cleanName,
          photo: accountProfile?.photo,
          bio: accountProfile?.bio,
          cover: accountProfile?.cover,
          channel: channel.id,
          device: 'mobile',
        }),
      });
      setMembers(result.members);
      setMessages([]);

      stopLocalMedia();
      const engine = createRtcEngine(
        clientId,
        async (signal) => {
          await apiRequest('/api/rtc', {
            method: 'POST',
            body: JSON.stringify({
              action: 'signal',
              from: clientId,
              to: signal.to,
              kind: signal.kind,
              data: signal.data,
            }),
          });
        },
        {
          onTrack: (peerId, stream) => {
            const current = remotePeersRef.current[peerId];
            const streams = current?.streams ?? [];
            remotePeersRef.current = {
              ...remotePeersRef.current,
              [peerId]: {
                member:
                  current?.member ??
                  result.members.find((member) => member.clientId === peerId) ?? {
                    clientId: peerId,
                    name: 'Usuário',
                    channel: channel.id,
                    joinedAt: Date.now(),
                    isAnonymous: true,
                  },
                streams: streams.some((item) => item.id === stream.id)
                  ? streams
                  : [...streams, stream],
                screenTrackIds: current?.screenTrackIds ?? [],
              },
            };
            setRemotePeers(remotePeersRef.current);
          },
          onStreamGone: (peerId, stream) => {
            const current = remotePeersRef.current[peerId];
            if (!current) return;
            remotePeersRef.current = {
              ...remotePeersRef.current,
              [peerId]: {
                ...current,
                streams: current.streams.filter((item) => item.id !== stream.id),
              },
            };
            setRemotePeers(remotePeersRef.current);
          },
          onPeerGone: (peerId) => {
            const next = { ...remotePeersRef.current };
            delete next[peerId];
            remotePeersRef.current = next;
            setRemotePeers(next);
          },
          onError: (rtcError) => setCallError(rtcError.message),
        }
      );
      engineRef.current = engine;
      setJoinedChannel(channel);
      setActiveCallChannel(channel);

      const preferences = await loadAppPreferences();
      let microphone: RtcMediaStream | null = null;
      if (!preferences.silentMode) {
        try {
          microphone = await getRtcUserMedia('audio');
          if (microphone.getAudioTracks().length === 0) {
            microphone.getTracks().forEach((track) => track.stop());
            throw new Error('O sistema não retornou uma trilha de áudio.');
          }
          microphoneStreamRef.current = microphone;
          mediaStreamsRef.current.add(microphone);
          microphone.getAudioTracks().forEach((track) => {
            track.enabled = true;
          });
          engine.addLocalStream(microphone);
          setMicEnabled(true);
        } catch (microphoneError) {
          if (microphone) {
            engine.removeLocalStream(microphone);
            microphone.getTracks().forEach((track) => track.stop());
            mediaStreamsRef.current.delete(microphone);
            if (microphoneStreamRef.current === microphone) {
              microphoneStreamRef.current = null;
            }
          }
          setMicEnabled(false);
          setCallError(
            microphoneError instanceof Error
              ? `Você entrou, mas o microfone não pôde ser ativado: ${microphoneError.message}`
              : 'Você entrou, mas não foi possível ativar o microfone.'
          );
        }
      } else {
        setMicEnabled(false);
      }

      result.members.forEach((member) => {
        engine.addPeer(member.clientId);
        remotePeersRef.current = {
          ...remotePeersRef.current,
          [member.clientId]: {
            member,
            streams: [],
            screenTrackIds: [],
          },
        };
      });
      setRemotePeers(remotePeersRef.current);

      try {
        await apiRequest('/api/rtc', {
          method: 'POST',
          body: JSON.stringify({
            action: 'peer-mute',
            targetId: clientId,
            muted: preferences.silentMode,
          }),
        });
      } catch (muteError) {
        setCallError(
          muteError instanceof Error
            ? muteError.message
            : 'Não foi possível sincronizar o estado do microfone.'
        );
      }

      const history = await apiRequest<ChatData>(
        `/api/rtc?action=chat&channel=${encodeURIComponent(channel.id)}&clientId=${encodeURIComponent(clientId)}`
      );
      setMessages(history.messages);
      if (navigateToCall) {
        router.navigate({ pathname: '/', params: { tab: 'calls' } });
      }
    } catch (joinError) {
      console.error('Não foi possível entrar no canal.', joinError);
      if (joinAttempted) {
        try {
          await apiRequest('/api/rtc', {
            method: 'POST',
            body: JSON.stringify({ action: 'leave', clientId }),
          });
        } catch (leaveError) {
          console.error('Não foi possível limpar a entrada parcial no canal.', leaveError);
        }
      }
      stopLocalMedia();
      setJoinedChannel(null);
      setActiveCallChannel(null);
      setSpeakingParticipants(new Set());
      setMembers([]);
      setMessages([]);
      setError(
        joinError instanceof Error
          ? joinError.message
          : 'Não foi possível entrar no canal.'
      );
    } finally {
      setBusy(false);
    }
  };

  const restoringCallRef = useRef(false);
  const joinChannelRef = useRef(joinChannel);
  useEffect(() => {
    joinChannelRef.current = joinChannel;
  });
  useEffect(() => {
    const savedChannel = getActiveCallChannel();
    if (!clientId || joinedChannel || !savedChannel || restoringCallRef.current) return;

    restoringCallRef.current = true;
    void joinChannelRef.current(savedChannel, false).finally(() => {
      restoringCallRef.current = false;
    });
  }, [clientId, joinedChannel]);

  const saveVisitorName = async () => {
    if (!guestProfile) {
      setError('O perfil visitante ainda não foi carregado.');
      return;
    }

    try {
      if (accountProfile) {
        const updatedName = nameInput.trim();
        if (!updatedName || updatedName.length > 60) {
          throw new Error('O nome deve ter entre 1 e 60 caracteres.');
        }
        const response = await apiRequest<{ profile: AccountProfile }>('/api/profile', {
          method: 'PUT',
          body: JSON.stringify({
            name: updatedName,
            bio: accountProfile.bio,
            photo: accountProfile.photo,
            cover: accountProfile.cover,
          }),
        });
        setAccountProfile(response.profile);
        setNameInput(response.profile.name);
        setError('');
        return;
      }
      const savedProfile = await saveGuestProfile(clientId, nameInput);
      setGuestProfile(savedProfile);
      setNameInput(savedProfile.displayName);
      setError('');
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Não foi possível salvar seu nome neste aparelho.'
      );
    }
  };

  const recoverGuestProfile = async () => {
    setResettingProfile(true);
    try {
      const profile = await resetGuestProfile();
      setGuestProfile(profile);
      setNameInput('');
      setProfileError('');
    } catch (resetError) {
      console.error('Não foi possível recriar o perfil visitante.', resetError);
      setProfileError(
        resetError instanceof Error
          ? resetError.message
          : 'Não foi possível recriar o perfil visitante.'
      );
    } finally {
      setResettingProfile(false);
    }
  };

  const leaveChannel = async () => {
    setBusy(true);
    setError('');
    try {
      await apiRequest<{ left: boolean }>('/api/rtc', {
        method: 'POST',
        body: JSON.stringify({ action: 'leave', clientId }),
      });
    } catch (leaveError) {
      console.error('Não foi possível sair do canal.', leaveError);
      setError(
        leaveError instanceof Error
          ? leaveError.message
          : 'Não foi possível sair do canal.'
      );
    } finally {
      stopLocalMedia();
      setJoinedChannel(null);
      setActiveCallChannel(null);
      setSpeakingParticipants(new Set());
      setMembers([]);
      setMessages([]);
      setCallError('');
      if (routeRoomId) router.replace('/');
      setBusy(false);
    }
  };

  const toggleMicrophone = async () => {
    let stream = microphoneStreamRef.current;
    if (!stream) {
      try {
        stream = await getRtcUserMedia('audio');
        if (stream.getAudioTracks().length === 0) {
          stream.getTracks().forEach((track) => track.stop());
          throw new Error('O sistema não retornou uma trilha de áudio.');
        }
        microphoneStreamRef.current = stream;
        mediaStreamsRef.current.add(stream);
        engineRef.current?.addLocalStream(stream);
        setMicEnabled(true);
      } catch (microphoneError) {
        if (stream) {
          engineRef.current?.removeLocalStream(stream);
          stream.getTracks().forEach((track) => track.stop());
          mediaStreamsRef.current.delete(stream);
          if (microphoneStreamRef.current === stream) {
            microphoneStreamRef.current = null;
          }
          setMicEnabled(false);
        }
        setCallError(
          microphoneError instanceof Error
            ? microphoneError.message
            : 'Não foi possível acessar o microfone.'
        );
        return;
      }
    } else {
      const nextEnabled = !micEnabled;
      stream.getAudioTracks().forEach((track) => {
        track.enabled = nextEnabled;
      });
      setMicEnabled(nextEnabled);
    }

    try {
      await apiRequest('/api/rtc', {
        method: 'POST',
        body: JSON.stringify({
          action: 'peer-mute',
          targetId: clientId,
          muted: stream.getAudioTracks().every((track) => !track.enabled),
        }),
      });
      setCallError('');
    } catch (muteError) {
      setCallError(
        muteError instanceof Error
          ? muteError.message
          : 'Não foi possível atualizar o estado do microfone.'
      );
    }
  };

  const toggleCamera = async () => {
    const currentStream = cameraStreamRef.current;
    if (currentStream) {
      engineRef.current?.removeLocalStream(currentStream);
      currentStream.getTracks().forEach((track) => track.stop());
      mediaStreamsRef.current.delete(currentStream);
      cameraStreamRef.current = null;
      setCameraStream(null);
      setCallError('');
      return;
    }

    let stream: RtcMediaStream | null = null;
    try {
      const preferences = await loadAppPreferences();
      stream = await getRtcUserMedia('video', preferences.cameraFacing);
      if (stream.getVideoTracks().length === 0) {
        throw new Error('A câmera não retornou uma trilha de vídeo.');
      }
      cameraStreamRef.current = stream;
      mediaStreamsRef.current.add(stream);
      engineRef.current?.addLocalStream(stream);
      setCameraStream(stream);
      setCallError('');
    } catch (cameraError) {
      if (stream) {
        engineRef.current?.removeLocalStream(stream);
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamsRef.current.delete(stream);
        if (cameraStreamRef.current === stream) {
          cameraStreamRef.current = null;
          setCameraStream(null);
        }
      }
      setCallError(
        cameraError instanceof Error
          ? cameraError.message
          : 'Não foi possível acessar a câmera.'
      );
    }
  };

  const notifyScreenState = async (trackIds: string[]): Promise<boolean> => {
    try {
      await apiRequest('/api/rtc', {
        method: 'POST',
        body: JSON.stringify({
          action: 'screen-kind',
          clientId,
          trackIds,
        }),
      });
      return true;
    } catch (screenError) {
      setCallError(
        screenError instanceof Error
          ? screenError.message
          : 'Não foi possível sincronizar o compartilhamento de tela.'
      );
      return false;
    }
  };

  const stopScreenShare = async (
    stream: RtcMediaStream | null = screenStreamRef.current
  ) => {
    if (!stream) return;
    engineRef.current?.removeLocalStream(stream);
    stream.getTracks().forEach((track) => track.stop());
    mediaStreamsRef.current.delete(stream);
    if (screenStreamRef.current === stream) {
      screenStreamRef.current = null;
      setScreenStream(null);
    }
    await notifyScreenState([]);
  };

  const toggleScreenShare = async () => {
    setCallError('');
    if (Platform.OS !== 'android') {
      setCallError(
        'O compartilhamento de tela está configurado apenas para Android nesta etapa.'
      );
      return;
    }
    if (screenStreamRef.current) {
      await stopScreenShare();
      return;
    }

    let stream: RtcMediaStream | null = null;
    try {
      stream = await getRtcDisplayMedia();
      if (stream.getVideoTracks().length === 0) {
        throw new Error('A captura de tela não retornou vídeo.');
      }
      screenStreamRef.current = stream;
      mediaStreamsRef.current.add(stream);
      engineRef.current?.addLocalStream(stream);
      setScreenStream(stream);
      const stateSynchronized = await notifyScreenState(
        stream.getVideoTracks().map((track) => track.id)
      );
      if (!stateSynchronized) {
        await stopScreenShare(stream);
        return;
      }
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        void stopScreenShare(stream);
      });
    } catch (screenError) {
      if (stream) {
        engineRef.current?.removeLocalStream(stream);
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamsRef.current.delete(stream);
        if (screenStreamRef.current === stream) {
          screenStreamRef.current = null;
          setScreenStream(null);
        }
      }
      setCallError(
        screenError instanceof Error
          ? `Não foi possível iniciar o compartilhamento: ${screenError.message}`
          : 'Não foi possível iniciar o compartilhamento de tela.'
      );
    }
  };

  const sendMessage = async () => {
    const text = messageInput.trim();
    if (!text || !activeChannel || busy) return;

    setBusy(true);
    setError('');
    try {
      const result = await apiRequest<{ message: ChatMessage }>('/api/rtc', {
        method: 'POST',
        body: JSON.stringify({
          action: 'chat',
          channel: activeChannel.id,
          authorId: clientId,
          author: name,
          text,
        }),
      });
      setMessages((current) => [
        ...current.filter((message) => message.id !== result.message.id),
        result.message,
      ]);
      setMessageInput('');
    } catch (sendError) {
      console.error('Não foi possível enviar a mensagem.', sendError);
      setError(
        sendError instanceof Error
          ? sendError.message
          : 'Não foi possível enviar a mensagem.'
      );
    } finally {
      setBusy(false);
    }
  };

  if (loadingIdentity) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#a78bfa" size="large" />
      </View>
    );
  }

  if (profileError) {
    return (
      <View style={styles.profileErrorScreen}>
        <Text style={styles.profileErrorTitle}>Perfil visitante indisponível</Text>
        <Text style={styles.errorText}>{profileError}</Text>
        <Text style={styles.profileErrorHint}>
          Você pode criar uma nova identidade local. Isso não apaga uma conta Google.
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={resettingProfile}
          onPress={() => void recoverGuestProfile()}
          style={[styles.sendButton, resettingProfile && styles.disabled]}
        >
          <Text style={styles.sendButtonText}>
            {resettingProfile ? 'Preparando...' : 'Criar novo perfil visitante'}
          </Text>
        </Pressable>
      </View>
    );
  }

  const channelParticipants: Member[] = activeChannel
    ? [
        {
          clientId,
          name,
          channel: activeChannel.id,
          joinedAt: 0,
          isAnonymous: !accountProfile,
        },
        ...members,
      ]
    : members;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View
        style={[
          styles.header,
          {
            width: '100%',
            maxWidth: 1320,
            alignSelf: 'center',
            paddingHorizontal: horizontalPadding,
          },
        ]}
      >
        <View style={styles.brand}>
          <Image source={require('../assets/orbit-room-logo.png')} style={styles.logo} />
          <View>
            <Text style={styles.brandTitle}>ORBIT ROOM</Text>
            <Text style={styles.brandSubtitle}>Converse, de onde estiver.</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Link href="/social" asChild>
            <Pressable accessibilityRole="button" accessibilityLabel={translateText('Amigos')} style={styles.headerIconButton}>
              <Text style={styles.headerIcon}>👥</Text>
            </Pressable>
          </Link>
          <Link href="/settings" asChild>
            <Pressable accessibilityRole="button" accessibilityLabel={translateText('Configurações')} style={styles.headerIconButton}>
              <Text style={styles.headerIcon}>⚙️</Text>
            </Pressable>
          </Link>
        </View>
      </View>
      {accountError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{accountError}</Text>
          <Pressable onPress={() => router.push('/login')}>
            <Text style={styles.retryButtonText}>Entrar novamente</Text>
          </Pressable>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {activeChannel && (selectedTab === 'calls' || selectedTab === 'channel-chat') ? (
        <View
          style={[
            styles.channelScreen,
            {
              width: '100%',
              maxWidth: 1440,
              alignSelf: 'center',
              paddingHorizontal: horizontalPadding,
            },
          ]}
        >
          <View style={styles.channelHeader}>
            <View>
              <Text style={styles.eyebrow}>
                {selectedTab === 'calls' ? 'CANAL DE VOZ' : 'CHAT DO CANAL'}
              </Text>
              <Text style={styles.heading}>{activeChannel.label}</Text>
              {selectedTab === 'calls' ? (
                <Text style={styles.mutedText}>
                  {members.length + 1} {members.length === 0 ? 'pessoa' : 'pessoas'} na chamada
                  {refreshing ? ' · atualizando' : ''}
                </Text>
              ) : null}
            </View>
            <View style={styles.channelHeaderActions}>
              {selectedTab === 'channel-chat' ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.navigate({ pathname: '/', params: { tab: 'calls' } })}
                  style={styles.returnToCallButton}
                >
                  <Text style={styles.returnToCallText}>🎧 Chamada</Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => void leaveChannel()}
                style={[styles.leaveButton, busy && styles.disabled]}
              >
                <Text style={styles.leaveButtonText}>Sair</Text>
              </Pressable>
            </View>
          </View>

          {selectedTab === 'calls' ? (
            <View style={styles.callPanel}>
              <ScrollView
                style={styles.callPanelScroll}
                contentContainerStyle={styles.callPanelContent}
                keyboardShouldPersistTaps="handled"
              >
                {callError ? (
                  <View style={styles.errorBanner}>
                    <Text style={styles.errorText}>{callError}</Text>
                  </View>
                ) : null}

                <View style={styles.participantsSection}>
                  <Text style={styles.sectionTitle}>Pessoas na chamada</Text>
                  <View style={styles.participantGrid}>
                    {channelParticipants.map((member) => (
                      <ParticipantAvatar
                        key={member.clientId}
                        member={member}
                        isSpeaking={speakingParticipants.has(member.clientId)}
                        isMuted={member.clientId === clientId ? !micEnabled : Boolean(member.muted)}
                        isCurrentUser={member.clientId === clientId}
                      />
                    ))}
                  </View>
                </View>

                {cameraStream ||
                screenStream ||
                Object.values(remotePeers).some((peer) =>
                  peer.streams.some((stream) => stream.getVideoTracks().length > 0)
                ) ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.videoStrip}
                    contentContainerStyle={styles.videoStripContent}
                  >
                    {cameraStream ? (
                      <View key="local-camera" style={styles.videoCard}>
                        <RtcVideoView
                          mirror
                          objectFit="cover"
                          streamURL={cameraStream.toURL()}
                          style={styles.videoView}
                        />
                        <Text style={styles.videoLabel}>Sua câmera</Text>
                      </View>
                    ) : null}
                    {screenStream ? (
                      <View key="local-screen" style={styles.videoCard}>
                        <RtcVideoView
                          objectFit="contain"
                          streamURL={screenStream.toURL()}
                          style={styles.videoView}
                        />
                        <Text style={styles.videoLabel}>Sua tela</Text>
                      </View>
                    ) : null}
                    {Object.entries(remotePeers).flatMap(([peerId, peer]) =>
                      peer.streams
                        .filter((stream) => stream.getVideoTracks().length > 0)
                        .map((stream) => {
                          const isScreen = stream
                            .getVideoTracks()
                            .some((track) => peer.screenTrackIds.includes(track.id));
                          return (
                            <View key={`${peerId}-${stream.id}`} style={styles.videoCard}>
                              <RtcVideoView
                                objectFit={isScreen ? 'contain' : 'cover'}
                                streamURL={stream.toURL()}
                                style={styles.videoView}
                              />
                              <Text numberOfLines={1} style={styles.videoLabel}>
                                {peer.member.name} · {isScreen ? 'Tela' : 'Vídeo'}
                              </Text>
                            </View>
                          );
                        })
                    )}
                  </ScrollView>
                ) : null}
              </ScrollView>

              <View style={styles.callControls}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={micEnabled ? 'Desativar microfone' : 'Ativar microfone'}
                  onPress={() => void toggleMicrophone()}
                  style={[styles.callControl, micEnabled && styles.callControlActive]}
                >
                  <Text style={styles.callControlText}>
                    {micEnabled ? '🎙️ Microfone' : '🔇 Microfone'}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={cameraStream ? 'Desligar câmera' : 'Ligar câmera'}
                  onPress={() => void toggleCamera()}
                  style={[styles.callControl, cameraStream && styles.callControlActive]}
                >
                  <Text style={styles.callControlText}>
                    {cameraStream ? '📹 Câmera' : 'Câmera'}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Compartilhar tela"
                  disabled={Platform.OS !== 'android'}
                  onPress={() => void toggleScreenShare()}
                  style={[
                    styles.callControl,
                    screenStream && styles.callControlActive,
                    Platform.OS !== 'android' && styles.disabled,
                  ]}
                >
                  <Text style={styles.callControlText}>
                    {screenStream
                      ? '▣ Parar tela'
                      : Platform.OS === 'android'
                        ? '▣ Compartilhar'
                        : 'Tela · Android'}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.chatPanel}>
              <View style={styles.channelChatToolbar}>
                <Text style={styles.sectionTitle}>Mensagens da sala</Text>
                <Text style={styles.channelChatRoomName}>{activeChannel.label}</Text>
              </View>
              <ScrollView
                ref={scrollRef}
                style={styles.messageList}
                contentContainerStyle={styles.messageContent}
              >
                {visibleMessages.length === 0 ? (
                  <Text style={styles.emptyText}>Ainda não há mensagens. Comece a conversa.</Text>
                ) : (
                  visibleMessages.map((message) => (
                    <View key={message.id} style={styles.messageBubble}>
                      <Text style={styles.messageAuthor}>
                        {message.author}
                        {message.memberId === clientId ? ' · você' : ''}
                      </Text>
                      <Text style={styles.messageText}>{message.text}</Text>
                    </View>
                  ))
                )}
              </ScrollView>
              <View style={styles.composer}>
                <TextInput
                  accessibilityLabel="Mensagem do canal"
                  editable={!busy}
                  onChangeText={setMessageInput}
                  onSubmitEditing={() => void sendMessage()}
                  placeholder="Escreva uma mensagem..."
                  placeholderTextColor="#8790a8"
                  returnKeyType="send"
                  style={styles.messageInput}
                  value={messageInput}
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={busy || !messageInput.trim()}
                  onPress={() => void sendMessage()}
                  style={[
                    styles.sendButton,
                    (busy || !messageInput.trim()) && styles.disabled,
                  ]}
                >
                  <Text style={styles.sendButtonText}>Enviar</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      ) : selectedTab === 'calls' || selectedTab === 'channel-chat' ? (
        <View style={styles.waitingScreen}>
          <View style={styles.waitingCard}>
            <Text style={styles.waitingIcon}>🎧</Text>
            <Text style={styles.waitingTitle}>Você ainda não está em uma sala</Text>
            <Text style={styles.waitingText}>
              Quando entrar em um canal, os participantes, controles de chamada e o chat aparecerão aqui.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.navigate({ pathname: '/', params: { tab: 'rooms' } })}
              style={styles.waitingButton}
            >
              <Text style={styles.waitingButtonText}>Explorar salas públicas</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.lobby,
            {
              width: '100%',
              maxWidth: pageMaxWidth,
              alignSelf: 'center',
              paddingHorizontal: horizontalPadding,
            },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {selectedTab === 'home' ? (
            <>
              <Text style={[styles.eyebrow, styles.homeWelcome]}>
                BEM-VINDO AO ORBIT ROOM
              </Text>
              <View style={styles.homeCard}>
                <Text style={[styles.heading, styles.homeHeading]}>Encontre sua sala.</Text>
                <Text style={[styles.intro, styles.homeIntro]}>
                  Entre em um canal público e converse com as pessoas que estão online.
                </Text>
            <View style={styles.categoryGrid}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.navigate({ pathname: '/', params: { tab: 'rooms' } })}
                style={[styles.categoryCard, styles.publicCategory]}
              >
                <Text style={styles.categoryIcon}>🌐</Text>
                <Text style={styles.categoryTitle}>Salas públicas</Text>
                <Text style={styles.categoryDescription}>Entre em uma conversa aberta.</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.navigate({ pathname: '/rooms', params: { section: 'private' } })}
                style={[styles.categoryCard, styles.privateCategory]}
              >
                <Text style={styles.categoryIcon}>🔒</Text>
                <Text style={styles.categoryTitle}>Salas privadas</Text>
                <Text style={styles.categoryDescription}>Acesse espaços por convite.</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.navigate({ pathname: '/rooms', params: { section: 'create' } })}
                style={[styles.categoryCard, styles.createCategory]}
              >
                <Text style={styles.categoryIcon}>➕</Text>
                <Text style={styles.categoryTitle}>Criar sala</Text>
                <Text style={styles.categoryDescription}>Monte um espaço para seus amigos.</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.navigate({ pathname: '/rooms', params: { section: 'mine' } })}
                style={[styles.categoryCard, styles.myRoomsCategory]}
              >
                <Text style={styles.categoryIcon}>📁</Text>
                <Text style={styles.categoryTitle}>Minhas salas</Text>
                <Text style={styles.categoryDescription}>Gerencie salas e convites.</Text>
              </Pressable>
            </View>
                <View style={styles.homeProfileCard}>
                  <View style={styles.homeAvatar}>
                    <Text style={styles.homeAvatarText}>
                      {(name || 'V').slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.homeProfileText}>
                    <Text style={styles.fieldLabel}>
                      {accountProfile ? 'Seu perfil' : 'Perfil visitante'}
                    </Text>
                    <Text numberOfLines={1} style={styles.homeProfileName}>
                      {name || 'Anônimo'}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.navigate(accountProfile ? '/profile' : '/login')}
                    style={styles.homeProfileButton}
                  >
                    <Text style={styles.homeProfileButtonText}>
                      {accountProfile ? 'Editar' : 'Entrar'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.eyebrow}>CANAIS ABERTOS</Text>
              <Text style={styles.heading}>Salas públicas</Text>
              <Text style={styles.intro}>
                Escolha um canal para entrar na conversa. A chamada só começa depois que você tocar em Entrar.
              </Text>
            </>
          )}

          {selectedTab === 'rooms' ? (
            <>
          {accountProfile ? (
            <View style={styles.nameCard}>
              <Text style={styles.fieldLabel}>Perfil sincronizado com o website</Text>
              <TextInput
                accessibilityLabel="Nome do perfil"
                autoCapitalize="words"
                maxLength={60}
                onChangeText={setNameInput}
                onSubmitEditing={() => setNameInput(nameInput.trim())}
                placeholder="Seu nome"
                placeholderTextColor="#8790a8"
                returnKeyType="done"
                style={styles.nameInput}
                value={nameInput}
              />
              <Text style={styles.helperText}>Seu nome e sua foto são compartilhados entre o app e o website.</Text>
              <Pressable
                accessibilityRole="button"
                disabled={busy || !nameInput.trim() || nameInput.trim() === name}
                onPress={() => void saveVisitorName()}
                style={[
                  styles.saveNameButton,
                  (busy || !nameInput.trim() || nameInput.trim() === name) && styles.disabled,
                ]}
              >
                <Text style={styles.saveNameButtonText}>
                  {nameInput.trim() === name ? 'Perfil atualizado' : 'Salvar perfil'}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.nameCard}>
              <Text style={styles.fieldLabel}>Como podemos chamar você?</Text>
              <TextInput
                accessibilityLabel="Seu nome"
                autoCapitalize="words"
                maxLength={40}
                onChangeText={setNameInput}
                onSubmitEditing={() => setNameInput(nameInput.trim())}
                placeholder="Seu nome"
                placeholderTextColor="#8790a8"
                returnKeyType="done"
                style={styles.nameInput}
                value={nameInput}
              />
              <Text style={styles.helperText}>
                O perfil visitante fica salvo somente neste aparelho. Não é uma conta Google.
              </Text>
              <Pressable
                accessibilityRole="button"
                disabled={busy || !nameInput.trim() || nameInput.trim() === name}
                onPress={() => void saveVisitorName()}
                style={[
                  styles.saveNameButton,
                  (busy || !nameInput.trim() || nameInput.trim() === name) && styles.disabled,
                ]}
              >
                <Text style={styles.saveNameButtonText}>
                  {name && nameInput.trim() === name ? 'Nome salvo' : 'Salvar nome'}
                </Text>
              </Pressable>
            </View>
          )}

          <View style={styles.apiCard}>
            <View style={styles.apiStatusRow}>
              <View
                style={[
                  styles.apiStatusDot,
                  apiStatus === 'connected' && styles.apiStatusOnline,
                  apiStatus === 'offline' && styles.apiStatusOffline,
                ]}
              />
              <Text style={styles.apiStatusTitle}>
                {apiStatus === 'connected'
                  ? 'API conectada'
                  : apiStatus === 'checking'
                    ? 'Verificando API'
                    : apiStatus === 'offline'
                      ? 'API indisponível'
                      : 'API não configurada'}
              </Text>
              {apiStatus !== 'connected' ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={apiStatus === 'checking'}
                  onPress={() => void checkApiConnection()}
                  style={styles.retryButton}
                >
                  <Text style={styles.retryButtonText}>
                    {apiStatus === 'checking' ? '...' : 'Tentar novamente'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.apiStatusMessage}>{apiStatusMessage}</Text>
            {apiStatus === 'not-configured' ? (
              <Text style={styles.apiSetupHint}>
                Configure EXPO_PUBLIC_API_URL no arquivo .env dentro da pasta
                mobile-adaptation e reinicie o Expo.
              </Text>
            ) : null}
          </View>

          <Text style={styles.sectionTitle}>Canais públicos</Text>
          <View style={styles.channelList}>
            {CHANNELS.map((channel, index) => (
              <Pressable
                key={channel.id}
                accessibilityRole="button"
                disabled={
                  busy ||
                  !clientId ||
                  !nameInput.trim() ||
                  apiStatus !== 'connected'
                }
                onPress={() => void joinChannel(channel)}
                style={({ pressed }) => [
                  styles.channelCard,
                  pressed && styles.pressed,
                  busy && styles.disabled,
                ]}
              >
                <View style={styles.channelIcon}>
                  <Text style={styles.channelIconText}>{index + 1}</Text>
                </View>
                <View style={styles.channelInfo}>
                  <Text style={styles.channelName}>{channel.label}</Text>
                  <Text style={styles.channelDescription}>{channel.description}</Text>
                  <Text style={styles.channelCapacity}>Limite: 10 pessoas</Text>
                </View>
                <View style={styles.channelAction}>
                  <Text style={styles.channelActionText}>{busy ? '…' : 'Entrar'}</Text>
                  <Text style={styles.joinArrow}>›</Text>
                </View>
              </Pressable>
            ))}
          </View>

          <View style={styles.footerNote}>
            <Text style={styles.footerText}>
              O app compartilha o servidor e as salas de voz com o website. Câmera e microfone
              precisam de um development build; o compartilhamento de tela está disponível no
              Android nesta etapa.
            </Text>
          </View>
            </>
          ) : null}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  profileErrorScreen: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'transparent',
    gap: 14,
  },
  profileErrorTitle: { color: '#f4f3ff', fontSize: 22, fontWeight: '800' },
  profileErrorHint: { color: '#a5aec4', fontSize: 13, lineHeight: 20 },
  header: {
    minHeight: 76,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 48, height: 48, borderRadius: 15 },
  brandTitle: { color: '#e8eaff', fontSize: 14, fontWeight: '800', letterSpacing: 1.7 },
  brandSubtitle: { color: '#8992ab', fontSize: 12, marginTop: 3 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIconButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.22)',
    backgroundColor: 'rgba(13,18,40,0.68)',
  },
  headerIcon: { fontSize: 18 },
  errorBanner: {
    marginHorizontal: 18,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(251,113,133,0.35)',
    backgroundColor: 'rgba(159,18,57,0.2)',
  },
  errorText: { color: '#fecdd3', fontSize: 13, lineHeight: 19 },
  lobby: { padding: 22, paddingBottom: 40 },
  waitingScreen: { flex: 1, justifyContent: 'center', padding: 20 },
  waitingCard: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    alignItems: 'center',
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.24)',
    backgroundColor: 'rgba(13,18,40,0.84)',
  },
  waitingIcon: { fontSize: 38, marginBottom: 12 },
  waitingTitle: { color: '#f4f3ff', fontSize: 19, fontWeight: '800', textAlign: 'center' },
  waitingText: { color: '#a5aec4', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 9 },
  waitingButton: {
    minHeight: 46,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 18,
    paddingHorizontal: 18,
    borderRadius: 13,
    backgroundColor: '#6366f1',
  },
  waitingButtonText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 20,
    marginBottom: 6,
  },
  categoryCard: {
    width: '48%',
    minHeight: 132,
    flexGrow: 1,
    flexBasis: 140,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
  },
  publicCategory: {
    backgroundColor: 'rgba(99,102,241,0.2)',
    borderColor: 'rgba(129,140,248,0.3)',
  },
  privateCategory: {
    backgroundColor: 'rgba(245,158,11,0.13)',
    borderColor: 'rgba(245,158,11,0.25)',
  },
  createCategory: {
    backgroundColor: 'rgba(16,185,129,0.13)',
    borderColor: 'rgba(52,211,153,0.24)',
  },
  myRoomsCategory: {
    backgroundColor: 'rgba(14,165,233,0.13)',
    borderColor: 'rgba(56,189,248,0.24)',
  },
  categoryIcon: { fontSize: 26, marginBottom: 7 },
  categoryTitle: { color: '#f1f2fa', fontSize: 13, fontWeight: '800', textAlign: 'center' },
  categoryDescription: {
    color: '#a5aec4',
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
    marginTop: 5,
  },
  homeWelcome: { textAlign: 'center', marginTop: 6, marginBottom: 14 },
  homeCard: {
    width: '100%',
    padding: 18,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.22)',
    backgroundColor: 'rgba(13,18,40,0.72)',
  },
  homeHeading: { textAlign: 'center', marginTop: 0 },
  homeIntro: { textAlign: 'center', marginTop: 8 },
  homeProfileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 14,
    padding: 15,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
    backgroundColor: 'rgba(13,18,40,0.76)',
  },
  homeAvatar: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: 'rgba(99,102,241,0.24)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.35)',
  },
  homeAvatarText: { color: '#ddd6fe', fontSize: 17, fontWeight: '800' },
  homeProfileText: { flex: 1, gap: 5 },
  homeProfileName: { color: '#f1f2fa', fontSize: 14, fontWeight: '700' },
  homeProfileButton: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: 'rgba(99,102,241,0.24)',
  },
  homeProfileButtonText: { color: '#c4b5fd', fontSize: 12, fontWeight: '800' },
  eyebrow: { color: '#a78bfa', fontSize: 11, fontWeight: '800', letterSpacing: 1.7 },
  heading: { color: '#f4f3ff', fontSize: 30, fontWeight: '800', marginTop: 8 },
  intro: { color: '#a5aec4', fontSize: 15, lineHeight: 23, marginTop: 8 },
  nameCard: {
    padding: 16,
    marginTop: 24,
    marginBottom: 28,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
    backgroundColor: 'rgba(13,18,40,0.82)',
  },
  fieldLabel: { color: '#e5e7f2', fontSize: 14, fontWeight: '700' },
  nameInput: {
    marginTop: 12,
    minHeight: 48,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingHorizontal: 14,
    color: '#f8fafc',
    backgroundColor: 'rgba(4,8,20,0.8)',
    fontSize: 15,
  },
  helperText: { color: '#818ba4', fontSize: 12, marginTop: 9 },
  saveNameButton: {
    alignSelf: 'flex-start',
    marginTop: 13,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: 'rgba(99,102,241,0.22)',
  },
  saveNameButtonText: { color: '#c4b5fd', fontSize: 12, fontWeight: '700' },
  apiCard: {
    padding: 15,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
    borderRadius: 16,
    backgroundColor: 'rgba(13,18,40,0.76)',
  },
  apiStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  apiStatusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fbbf24' },
  apiStatusOnline: { backgroundColor: '#34d399' },
  apiStatusOffline: { backgroundColor: '#fb7185' },
  apiStatusTitle: { flex: 1, color: '#e8eaff', fontSize: 13, fontWeight: '800' },
  apiStatusMessage: { color: '#a5aec4', fontSize: 12, lineHeight: 18, marginTop: 8 },
  apiSetupHint: { color: '#c4b5fd', fontSize: 12, lineHeight: 18, marginTop: 8 },
  retryButton: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: 'rgba(129,140,248,0.16)',
  },
  retryButtonText: { color: '#c4b5fd', fontSize: 11, fontWeight: '700' },
  sectionTitle: { color: '#e8eaff', fontSize: 16, fontWeight: '800', marginBottom: 12 },
  channelList: { gap: 10 },
  channelCard: {
    minHeight: 76,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
    borderRadius: 16,
    backgroundColor: 'rgba(13,18,40,0.76)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.55 },
  channelIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(129,140,248,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelIconText: { color: '#c4b5fd', fontSize: 16, fontWeight: '800' },
  channelInfo: { flex: 1, marginLeft: 13 },
  channelName: { color: '#f1f2fa', fontSize: 15, fontWeight: '700' },
  channelDescription: { color: '#929bb2', fontSize: 12, marginTop: 4 },
  channelCapacity: { color: '#a5aec4', fontSize: 11, marginTop: 5 },
  channelAction: { flexDirection: 'row', alignItems: 'center', marginLeft: 8 },
  channelActionText: { color: '#c4b5fd', fontSize: 12, fontWeight: '700' },
  joinArrow: { color: '#a78bfa', fontSize: 28, paddingHorizontal: 4 },
  footerNote: {
    marginTop: 26,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(129,140,248,0.08)',
  },
  footerText: { color: '#aab2c8', fontSize: 12, lineHeight: 18 },
  channelScreen: { flex: 1, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 10 },
  channelWorkspace: { flex: 1, gap: 12 },
  channelWorkspaceWide: { flexDirection: 'row' },
  callPanel: {
    flex: 1,
    minHeight: 0,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
    backgroundColor: 'rgba(13,18,40,0.72)',
  },
  callPanelScroll: { flex: 1 },
  callPanelContent: { flexGrow: 1, paddingBottom: 12 },
  chatPanel: {
    flex: 1,
    minHeight: 0,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
    backgroundColor: 'rgba(13,18,40,0.82)',
  },
  channelChatToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  channelChatRoomName: { color: '#8992ab', fontSize: 12, fontWeight: '700' },
  channelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  channelHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  returnToCallButton: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(99,102,241,0.2)',
  },
  returnToCallText: { color: '#c4b5fd', fontSize: 12, fontWeight: '700' },
  mutedText: { color: '#939cb4', fontSize: 13, marginTop: 5 },
  leaveButton: {
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: 'rgba(251,113,133,0.16)',
  },
  leaveButtonText: { color: '#fda4af', fontSize: 13, fontWeight: '700' },
  voiceNotice: {
    borderRadius: 14,
    padding: 13,
    marginBottom: 20,
    backgroundColor: 'rgba(129,140,248,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(129,140,248,0.2)',
  },
  voiceNoticeTitle: { color: '#c4b5fd', fontSize: 13, fontWeight: '800' },
  voiceNoticeText: { color: '#aab2c8', fontSize: 12, lineHeight: 18, marginTop: 4 },
  participantsSection: { marginTop: 2 },
  participantGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 14,
    paddingBottom: 10,
  },
  participantCard: {
    width: 96,
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
  },
  participantAvatarRing: {
    width: 66,
    height: 66,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 33,
    borderWidth: 2,
    borderColor: 'rgba(52,211,153,0.7)',
    backgroundColor: 'rgba(99,102,241,0.24)',
  },
  participantAvatarSpeaking: {
    borderColor: '#34d399',
    shadowColor: '#34d399',
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 5,
  },
  participantPhoto: { width: '100%', height: '100%' },
  participantInitial: { color: '#e9d5ff', fontSize: 23, fontWeight: '800' },
  participantName: {
    maxWidth: 96,
    color: '#e8eaff',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  participantStatus: { color: '#8992ab', fontSize: 10 },
  participantStatusSpeaking: { color: '#6ee7b7', fontWeight: '800' },
  videoStrip: { flexGrow: 0, maxHeight: 150, marginBottom: 14 },
  videoStripContent: { gap: 10 },
  videoCard: {
    width: 180,
    height: 142,
    overflow: 'hidden',
    borderRadius: 14,
    backgroundColor: '#11182b',
  },
  videoView: { width: '100%', height: 116, backgroundColor: '#11182b' },
  videoLabel: {
    color: '#dce1f0',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  callControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 12,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  callControl: {
    minHeight: 42,
    justifyContent: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  callControlActive: {
    backgroundColor: 'rgba(99,102,241,0.28)',
    borderColor: 'rgba(167,139,250,0.55)',
  },
  callControlText: { color: '#e8eaff', fontSize: 12, fontWeight: '700' },
  messageList: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: 'rgba(4,8,20,0.42)',
  },
  messageContent: { padding: 12, gap: 9, flexGrow: 1 },
  emptyText: { color: '#858fa8', fontSize: 13, lineHeight: 20, marginTop: 10 },
  messageBubble: {
    alignSelf: 'flex-start',
    maxWidth: '90%',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: 'rgba(99,102,241,0.15)',
  },
  messageAuthor: { color: '#c4b5fd', fontSize: 11, fontWeight: '700', marginBottom: 4 },
  messageText: { color: '#f1f2fa', fontSize: 14, lineHeight: 20 },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 12,
  },
  messageInput: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 13,
    color: '#f8fafc',
    backgroundColor: 'rgba(255,255,255,0.055)',
    fontSize: 14,
  },
  sendButton: {
    minHeight: 46,
    justifyContent: 'center',
    borderRadius: 14,
    paddingHorizontal: 15,
    backgroundColor: '#6366f1',
  },
  sendButtonText: { color: '#fff', fontSize: 13, fontWeight: '800' },
});
