import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { ScrollViewInstance } from 'react-native';
import { Link, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { apiRequest, getApiConfiguration } from '../lib/api';
import { getMobileAuthToken } from '../lib/auth-session';
import {
  createRtcEngine,
  getRtcDisplayMedia,
  getRtcUserMedia,
  RtcVideoView,
} from '../lib/rtc-runtime';
import type { RtcEngine, RtcMediaStream } from '../lib/rtc-runtime';
import {
  loadGuestProfile,
  resetGuestProfile,
  saveGuestProfile,
  validateGuestName,
  type GuestProfile,
} from '../lib/guest-profile';
import type { ChatMessage, Channel, MailboxMessage, Member } from '../lib/types';

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

export default function HomeScreen() {
  const params = useLocalSearchParams<{ roomId?: string; roomName?: string }>();
  const [guestProfile, setGuestProfile] = useState<GuestProfile | null>(null);
  const [accountProfile, setAccountProfile] = useState<AccountProfile | null>(null);
  const [accountError, setAccountError] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [joinedChannel, setJoinedChannel] = useState<Channel | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [callError, setCallError] = useState('');
  const [micEnabled, setMicEnabled] = useState(false);
  const [cameraStream, setCameraStream] = useState<RtcMediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<RtcMediaStream | null>(null);
  const [remotePeers, setRemotePeers] = useState<Record<string, RemotePeer>>({});
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
  const name = accountProfile?.name ?? guestProfile?.displayName ?? '';
  const routeRoomId = typeof params.roomId === 'string' ? params.roomId : '';
  const routeRoomName = typeof params.roomName === 'string' ? params.roomName : '';
  const activeChannel = useMemo(
    () => joinedChannel ?? (
      routeRoomId && routeRoomName
        ? { id: routeRoomId, label: routeRoomName, description: 'Sala personalizada' }
        : null
    ),
    [joinedChannel, routeRoomId, routeRoomName]
  );

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
        setNameInput(profile.displayName);
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

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      const loadAccountProfile = async () => {
        try {
          const token = await getMobileAuthToken();
          if (!token) {
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
      await apiRequest<{ message: string }>('/api/health');
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
    apiRequest<{ message: string }>('/api/health').then(
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
        `/api/rtc?action=chat&channel=${encodeURIComponent(channel.id)}`
      ),
    ]);

    setMembers(channelData.members);
    setMessages(chatData.messages);
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

  const joinChannel = async (channel: Channel) => {
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

      let microphone: RtcMediaStream | null = null;
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
            muted: false,
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
        `/api/rtc?action=chat&channel=${encodeURIComponent(channel.id)}`
      );
      setMessages(history.messages);
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
      stream = await getRtcUserMedia('video');
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
      <View style={styles.header}>
        <View style={styles.brand}>
          <Image source={require('../assets/icon.png')} style={styles.logo} />
          <View>
            <Text style={styles.brandTitle}>ORBIT ROOM</Text>
            <Text style={styles.brandSubtitle}>Converse, de onde estiver.</Text>
          </View>
        </View>
        <Link href={accountProfile ? '/profile' : '/login'} asChild>
          <Pressable accessibilityRole="button" style={styles.accountButton}>
            <Text style={styles.accountButtonText}>{accountProfile ? 'Perfil' : 'Conta'}</Text>
          </Pressable>
        </Link>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.navShortcuts}
      >
          <Link href="/social" asChild>
            <Pressable accessibilityRole="button" style={styles.shortcutButton}>
              <Text style={styles.shortcutText}>Amigos</Text>
            </Pressable>
          </Link>
          <Link href="/messages" asChild>
            <Pressable accessibilityRole="button" style={styles.shortcutButton}>
              <Text style={styles.shortcutText}>Mensagens</Text>
            </Pressable>
          </Link>
          <Link href="/rooms" asChild>
            <Pressable accessibilityRole="button" style={styles.shortcutButton}>
              <Text style={styles.shortcutText}>Salas</Text>
            </Pressable>
          </Link>
      </ScrollView>

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

      {activeChannel ? (
        <View style={styles.channelScreen}>
          <View style={styles.channelHeader}>
            <View>
              <Text style={styles.eyebrow}>CANAL DE VOZ</Text>
              <Text style={styles.heading}>{activeChannel.label}</Text>
              <Text style={styles.mutedText}>
                {members.length + 1} {members.length === 0 ? 'pessoa' : 'pessoas'} online
                {refreshing ? ' · atualizando' : ''}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void leaveChannel()}
              style={[styles.leaveButton, busy && styles.disabled]}
            >
              <Text style={styles.leaveButtonText}>Sair</Text>
            </Pressable>
          </View>

          <View style={styles.voiceNotice}>
            <Text style={styles.voiceNoticeTitle}>
              {micEnabled ? 'Conectado à sala de voz' : 'Você entrou no canal'}
            </Text>
            <Text style={styles.voiceNoticeText}>
              {micEnabled
                ? 'Seu microfone está ativo. Use os controles para falar, ligar a câmera ou compartilhar a tela.'
                : 'O chat funciona mesmo sem permissão de microfone. Ative o microfone pelos controles quando quiser.'}
            </Text>
          </View>
          {callError ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{callError}</Text>
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>Pessoas no canal</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.memberList}
            contentContainerStyle={styles.memberListContent}
          >
            {channelParticipants.map((member) => (
              <View key={member.clientId} style={styles.memberChip}>
                <View style={styles.memberIdentity}>
                  <View
                    style={[
                      styles.onlineDot,
                      member.clientId !== clientId && member.muted && styles.mutedDot,
                    ]}
                  />
                  <Text numberOfLines={1} style={styles.memberName}>
                    {member.name}
                    {member.clientId === clientId ? ' (você)' : ''}
                    {member.clientId === clientId
                      ? micEnabled
                        ? ' · 🎙️'
                        : ' · 🔇'
                      : member.muted
                        ? ' · 🔇'
                        : ''}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>

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

          <View style={styles.callControls}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={micEnabled ? 'Desativar microfone' : 'Ativar microfone'}
              onPress={() => void toggleMicrophone()}
              style={[
                styles.callControl,
                micEnabled && styles.callControlActive,
              ]}
            >
              <Text style={styles.callControlText}>
                {micEnabled ? '🎙️ Microfone' : '🔇 Microfone'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={cameraStream ? 'Desligar câmera' : 'Ligar câmera'}
              onPress={() => void toggleCamera()}
              style={[
                styles.callControl,
                cameraStream && styles.callControlActive,
              ]}
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

          <Text style={styles.sectionTitle}>Chat do canal</Text>
          <ScrollView
            ref={scrollRef}
            style={styles.messageList}
            contentContainerStyle={styles.messageContent}
          >
            {messages.length === 0 ? (
              <Text style={styles.emptyText}>Ainda não há mensagens. Comece a conversa.</Text>
            ) : (
              messages.map((message) => (
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
              accessibilityLabel="Mensagem"
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
      ) : (
        <ScrollView
          contentContainerStyle={styles.lobby}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.eyebrow}>BEM-VINDO AO ORBIT ROOM</Text>
          <Text style={styles.heading}>Encontre sua sala.</Text>
          <Text style={styles.intro}>
            Entre em um canal público e converse com as pessoas que estão online.
          </Text>

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
                </View>
                <Text style={styles.joinArrow}>{busy ? '…' : '›'}</Text>
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
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#080d1d',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#080d1d',
  },
  profileErrorScreen: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#080d1d',
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
  logo: { width: 42, height: 42, borderRadius: 12 },
  brandTitle: { color: '#e8eaff', fontSize: 14, fontWeight: '800', letterSpacing: 1.7 },
  brandSubtitle: { color: '#8992ab', fontSize: 12, marginTop: 3 },
  accountButton: {
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.42)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  accountButtonText: { color: '#c4b5fd', fontSize: 13, fontWeight: '700' },
  navShortcuts: { paddingHorizontal: 18, paddingVertical: 8, gap: 8 },
  shortcutButton: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(167,139,250,0.12)',
  },
  shortcutText: { color: '#c4b5fd', fontSize: 12, fontWeight: '700' },
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
  eyebrow: { color: '#a78bfa', fontSize: 11, fontWeight: '800', letterSpacing: 1.7 },
  heading: { color: '#f4f3ff', fontSize: 30, fontWeight: '800', marginTop: 8 },
  intro: { color: '#a5aec4', fontSize: 15, lineHeight: 23, marginTop: 8 },
  nameCard: {
    padding: 16,
    marginTop: 24,
    marginBottom: 28,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: 'rgba(255,255,255,0.04)',
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
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.035)',
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
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.045)',
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
  joinArrow: { color: '#a78bfa', fontSize: 28, paddingHorizontal: 4 },
  footerNote: {
    marginTop: 26,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(129,140,248,0.08)',
  },
  footerText: { color: '#aab2c8', fontSize: 12, lineHeight: 18 },
  channelScreen: { flex: 1, paddingHorizontal: 18, paddingTop: 20, paddingBottom: 12 },
  channelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
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
  memberList: { maxHeight: 54, flexGrow: 0, marginBottom: 18 },
  memberListContent: { gap: 8, alignItems: 'center' },
  memberChip: {
    maxWidth: 180,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 8,
    paddingHorizontal: 11,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  memberIdentity: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#34d399' },
  mutedDot: { backgroundColor: '#fb7185' },
  memberName: { color: '#dce1f0', fontSize: 12, fontWeight: '600' },
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
    marginBottom: 16,
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
    backgroundColor: 'rgba(255,255,255,0.035)',
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
