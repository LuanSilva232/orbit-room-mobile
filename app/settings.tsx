import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ThemedText as Text,
  ThemedView as View,
} from '../components/themed-primitives';
import { useResponsiveLayout } from '../lib/responsive-layout';
import {
  loadAppPreferences,
  DEFAULT_APP_PREFERENCES,
  saveAppPreferences,
  type AppPreferences,
} from '../lib/app-preferences';
import { loadGuestProfile } from '../lib/guest-profile';
import { saveChatClearTimestamp } from '../lib/chat-history';
import { apiRequest } from '../lib/api';
import { getAuthClient } from '../lib/auth-client';
import { useAppTheme, type AppThemeId } from '../lib/theme';
import { translateText, type AppLanguage } from '../lib/i18n';
import { WEBSITE_ABOUT, WEBSITE_CHANGELOG } from '../lib/settings-content';
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushNotificationsEnabled,
} from '../lib/push-notifications';

type SettingsSection =
  | 'account'
  | 'profile'
  | 'friends'
  | 'online'
  | 'social-chat'
  | 'privacy'
  | 'audio'
  | 'appearance'
  | 'language'
  | 'notifications'
  | 'silent'
  | 'cleanup'
  | 'updates'
  | 'about';

type SettingsCategory = {
  id: SettingsSection;
  icon: string;
  title: string;
  description: string;
  route?: '/profile' | '/social' | '/messages';
};

type PrivacyPreferences = {
  showOnline: boolean;
  showLastseen: boolean;
  showRoom: boolean;
};

function isPrivacyPreferences(value: unknown): value is PrivacyPreferences {
  return (
    typeof value === 'object' &&
    value !== null &&
    'showOnline' in value &&
    typeof value.showOnline === 'boolean' &&
    'showLastseen' in value &&
    typeof value.showLastseen === 'boolean' &&
    'showRoom' in value &&
    typeof value.showRoom === 'boolean'
  );
}

const GROUPS: { title: string; categories: SettingsCategory[] }[] = [
  {
    title: '👤 Conta e comunidade',
    categories: [
      { id: 'account', icon: '🔑', title: 'Conta', description: 'Entrar, perfil e sessão; exclusão de conta ainda é pelo website.', route: '/profile' },
      { id: 'profile', icon: '👤', title: 'Perfil', description: 'Nome, biografia e perfil público.', route: '/profile' },
      { id: 'friends', icon: '🤝', title: 'Amigos', description: 'Solicitações, código de amizade e contatos.', route: '/social' },
      { id: 'online', icon: '👥', title: 'Pessoas online', description: 'Veja quem está conectado e em qual sala.', route: '/social' },
      { id: 'social-chat', icon: '💬', title: 'Bate-papo social', description: 'Conversas e solicitações de mensagem.', route: '/messages' },
      { id: 'privacy', icon: '🔒', title: 'Privacidade', description: 'Controle presença, atividade e sala visível.' },
    ],
  },
  {
    title: '🎙️ Áudio e vídeo',
    categories: [
      { id: 'audio', icon: '🎙️', title: 'Áudio e vídeo', description: 'Volume das vozes e câmera padrão para chamadas.' },
    ],
  },
  {
    title: '🎨 Aparência e comportamento',
    categories: [
      { id: 'appearance', icon: '🎨', title: 'Aparência', description: 'Escolha o tema visual do aplicativo.' },
      { id: 'language', icon: '🌐', title: 'Idioma', description: 'Escolha o idioma da interface do aplicativo.' },
      { id: 'notifications', icon: '🔔', title: 'Notificações', description: 'Mensagens, convites e solicitações.' },
      { id: 'silent', icon: '🤫', title: 'Modo silencioso', description: 'Entrar nas salas com o microfone desligado.' },
    ],
  },
  {
    title: '⚙️ Sistema',
    categories: [
      { id: 'cleanup', icon: '🧹', title: 'Limpeza de dados', description: 'Limpe seu histórico de chats e restaure preferências deste aparelho.' },
      { id: 'updates', icon: '🚀', title: 'Atualizações', description: 'Recursos e compatibilidade da versão mobile.' },
      { id: 'about', icon: 'ℹ️', title: 'Sobre', description: 'Identidade e informações do Orbit Room.' },
    ],
  },
];

const SECTION_TITLES: Record<SettingsSection, string> = Object.fromEntries(
  GROUPS.flatMap((group) => group.categories.map(({ id, title }) => [id, title]))
) as Record<SettingsSection, string>;

export default function SettingsScreen() {
  const { horizontalPadding, pageMaxWidth } = useResponsiveLayout();
  const appTheme = useAppTheme();
  const params = useLocalSearchParams<{ section?: string }>();
  const section = GROUPS.flatMap((group) => group.categories)
    .find((category) => category.id === params.section);
  const openSectionRoute = () => {
    if (section?.route) router.navigate(section.route);
  };
  const [preferences, setPreferences] = useState<AppPreferences | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [privacy, setPrivacy] = useState<PrivacyPreferences>({
    showOnline: true,
    showLastseen: true,
    showRoom: true,
  });
  const [privacyLoading, setPrivacyLoading] = useState(true);
  const [privacySignedIn, setPrivacySignedIn] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSignedIn, setPushSignedIn] = useState(false);
  const [pushLoading, setPushLoading] = useState(true);
  const [languageExpanded, setLanguageExpanded] = useState(false);

  useEffect(() => {
    let active = true;
    loadAppPreferences().then(
      (stored) => {
        if (active) setPreferences(stored);
      },
      (loadError: unknown) => {
        console.error('Não foi possível carregar as preferências mobile.', loadError);
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar as preferências.');
        }
      }
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (section?.id !== 'privacy') return;
    let active = true;
    const loadPrivacy = async () => {
      try {
        await Promise.resolve();
        if (!active) return;
        setPrivacyLoading(true);
        const session = await getAuthClient().getSession();
        if (session.error) throw new Error(session.error.message);
        if (!active) return;
        if (!session.data?.user) {
          setPrivacySignedIn(false);
          return;
        }

        const result = await apiRequest<{ profile: { privacy: unknown } }>('/api/profile');
        if (!isPrivacyPreferences(result.profile.privacy)) {
          throw new Error('O servidor retornou preferências de privacidade inválidas.');
        }
        if (active) {
          setPrivacy(result.profile.privacy);
          setPrivacySignedIn(true);
        }
      } catch (loadError) {
        console.error('Não foi possível carregar as configurações de privacidade.', loadError);
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Não foi possível carregar as configurações de privacidade.'
          );
        }
      } finally {
        if (active) setPrivacyLoading(false);
      }
    };
    void loadPrivacy();
    return () => {
      active = false;
    };
  }, [section?.id]);

  useEffect(() => {
    if (section?.id !== 'notifications') return;
    let active = true;
    const loadNotifications = async () => {
      try {
        await Promise.resolve();
        if (!active) return;
        setPushLoading(true);
        if (Platform.OS === 'web') {
          setPushSignedIn(false);
          setPushEnabled(false);
          return;
        }
        const [session, enabled] = await Promise.all([
          getAuthClient().getSession(),
          getPushNotificationsEnabled(),
        ]);
        if (session.error) throw new Error(session.error.message);
        if (active) {
          setPushSignedIn(Boolean(session.data?.user));
          setPushEnabled(enabled);
        }
      } catch (loadError) {
        console.error('Não foi possível carregar as notificações push.', loadError);
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Não foi possível carregar o estado das notificações.'
          );
        }
      } finally {
        if (active) setPushLoading(false);
      }
    };
    void loadNotifications();
    return () => {
      active = false;
    };
  }, [section?.id]);

  const openCategory = (category: SettingsCategory) => {
    setError('');
    setNotice('');
    if (category.route) {
      router.navigate(category.route);
      return;
    }
    router.navigate({ pathname: '/settings', params: { section: category.id } });
  };

  const toggleSilentMode = async (silentMode: boolean) => {
    if (!preferences) return;
    setBusy(true);
    setError('');
    setNotice('');
    const updated = { ...preferences, silentMode };
    try {
      await saveAppPreferences(updated);
      setPreferences(updated);
      setNotice(
        silentMode
          ? 'Você entrará em novas salas com o microfone desligado.'
          : 'O microfone poderá ser ativado ao entrar em uma sala.'
      );
    } catch (saveError) {
      console.error('Não foi possível salvar as preferências mobile.', saveError);
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar a preferência.');
    } finally {
      setBusy(false);
    }
  };

  const setOutputVolume = async (volume: number) => {
    if (!preferences) return;
    setBusy(true);
    setError('');
    setNotice('');
    const updated = { ...preferences, volume };
    try {
      await saveAppPreferences(updated);
      setPreferences(updated);
      setNotice(`Volume das vozes definido em ${Math.round(volume * 100)}%.`);
    } catch (saveError) {
      console.error('Não foi possível salvar o volume das chamadas.', saveError);
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar o volume.');
    } finally {
      setBusy(false);
    }
  };

  const setCameraFacing = async (cameraFacing: AppPreferences['cameraFacing']) => {
    if (!preferences) return;
    setBusy(true);
    setError('');
    setNotice('');
    const updated = { ...preferences, cameraFacing };
    try {
      await saveAppPreferences(updated);
      setPreferences(updated);
      setNotice('Câmera padrão salva. A mudança vale na próxima vez que ligar a câmera.');
    } catch (saveError) {
      console.error('Não foi possível salvar a câmera padrão.', saveError);
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Não foi possível salvar a câmera padrão.'
      );
    } finally {
      setBusy(false);
    }
  };

  const setTheme = async (theme: AppThemeId) => {
    if (!preferences || preferences.theme === theme) return;
    setBusy(true);
    setError('');
    try {
      const updated = { ...preferences, theme };
      await saveAppPreferences(updated);
      setPreferences(updated);
      setNotice('Tema aplicado neste aparelho.');
    } catch (themeError) {
      console.error('Não foi possível aplicar o tema escolhido.', themeError);
      setError(
        themeError instanceof Error
          ? themeError.message
          : 'Não foi possível salvar o tema escolhido.'
      );
    } finally {
      setBusy(false);
    }
  };

  const setLanguage = async (language: AppLanguage) => {
    if (!preferences || preferences.language === language) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updated = { ...preferences, language };
      await saveAppPreferences(updated);
      setPreferences(updated);
      setNotice('Idioma aplicado neste aparelho.');
    } catch (languageError) {
      console.error('Não foi possível aplicar o idioma escolhido.', languageError);
      setError(
        languageError instanceof Error
          ? languageError.message
          : 'Não foi possível salvar o idioma escolhido.'
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmClearChats = () => {
    Alert.alert(
      translateText('Limpar seu histórico de chats?'),
      translateText('As mensagens antigas deixarão de aparecer para você em todas as salas. Elas continuarão visíveis para as outras pessoas.'),
      [
        { text: translateText('Cancelar'), style: 'cancel' },
        {
          text: translateText('Limpar chats'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusy(true);
              setError('');
              setNotice('');
              try {
                const profile = await loadGuestProfile();
                const localCutoff = await saveChatClearTimestamp(profile.clientId);
                setNotice('Seu histórico local foi limpo. As mensagens dos outros continuam intactas.');
                try {
                  const result = await apiRequest<{
                    cleared: boolean;
                    clearedAt?: number;
                  }>('/api/rtc', {
                    method: 'POST',
                    body: JSON.stringify({
                      action: 'chat-clear-self',
                      clientId: profile.clientId,
                    }),
                  });
                  if (typeof result.clearedAt === 'number' && Number.isFinite(result.clearedAt)) {
                    await saveChatClearTimestamp(
                      profile.clientId,
                      Math.max(localCutoff, result.clearedAt)
                    );
                  }
                } catch (syncError) {
                  console.warn(
                    'O histórico foi limpo neste aparelho, mas não foi sincronizado com o servidor.',
                    syncError
                  );
                  setError(
                    'O histórico foi limpo neste aparelho, mas a sincronização com o servidor falhou. Outros aparelhos podem continuar mostrando as mensagens antigas.'
                  );
                }
              } catch (clearError) {
                console.error('Não foi possível limpar o histórico pessoal de chats.', clearError);
                setError(
                  clearError instanceof Error
                    ? clearError.message
                    : 'Não foi possível limpar seu histórico de chats.'
                );
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ]
    );
  };

  const updatePrivacy = async (
    key: keyof PrivacyPreferences,
    value: boolean
  ) => {
    if (!privacySignedIn) return;
    setBusy(true);
    setError('');
    setNotice('');
    const updated = { ...privacy, [key]: value };
    try {
      await apiRequest('/api/profile', {
        method: 'PUT',
        body: JSON.stringify({ privacy: updated }),
      });
      setPrivacy(updated);
      setNotice('Preferência de privacidade salva na sua conta.');
    } catch (saveError) {
      console.error('Não foi possível salvar as configurações de privacidade.', saveError);
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Não foi possível salvar as configurações de privacidade.'
      );
    } finally {
      setBusy(false);
    }
  };

  const togglePushNotifications = async (enabled: boolean) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const session = await getAuthClient().getSession();
      if (session.error) throw new Error(session.error.message);
      if (!session.data?.user) {
        throw new Error('Entre com sua conta para ativar notificações neste aparelho.');
      }
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
      console.error('Não foi possível atualizar as notificações push.', toggleError);
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : 'Não foi possível atualizar as notificações.'
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmPreferencesReset = () => {
    Alert.alert(
      translateText('Restaurar preferências?'),
      translateText('Volume, modo silencioso e câmera padrão voltarão aos valores iniciais. Seus dados e configurações da conta não serão apagados.'),
      [
        { text: translateText('Cancelar'), style: 'cancel' },
        {
          text: translateText('Restaurar'),
          onPress: () => {
            void saveAppPreferences(DEFAULT_APP_PREFERENCES).then(
              () => {
                setPreferences(DEFAULT_APP_PREFERENCES);
                setNotice('Preferências deste aparelho restauradas.');
                setError('');
              },
              (resetError: unknown) => {
                console.error('Não foi possível restaurar as preferências.', resetError);
                setError(
                  resetError instanceof Error
                    ? resetError.message
                    : 'Não foi possível restaurar as preferências.'
                );
              }
            );
          },
        },
      ]
    );
  };

  const contentStyle = [
    styles.content,
    {
      width: '100%' as const,
      maxWidth: pageMaxWidth,
      alignSelf: 'center' as const,
      paddingHorizontal: horizontalPadding,
    },
  ];

  if (!section) {
    return (
      <ScrollView contentContainerStyle={contentStyle}>
        <Text style={styles.eyebrow}>ORBIT ROOM</Text>
        <Text style={styles.title}>Configurações</Text>
        <Text style={styles.subtitle}>
          Conta, comunidade, chamadas e preferências do aplicativo.
        </Text>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {GROUPS.map((group) => (
          <View key={group.title} style={styles.group}>
            <Text style={styles.groupTitle}>{group.title}</Text>
            {group.categories.map((category) => (
              <View key={category.id} style={styles.categoryWrapper}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={
                    category.id === 'language'
                      ? { expanded: languageExpanded }
                      : undefined
                  }
                  onPress={() => {
                    if (category.id === 'language') {
                      setLanguageExpanded((expanded) => !expanded);
                    } else {
                      openCategory(category);
                    }
                  }}
                  style={({ pressed }) => [styles.card, pressed && styles.pressed]}
                >
                  <Text style={styles.icon}>{category.icon}</Text>
                  <View style={styles.cardText}>
                    <Text style={styles.cardTitle}>{category.title}</Text>
                    <Text style={styles.description}>{category.description}</Text>
                  </View>
                  <Text style={styles.arrow}>
                    {category.id === 'language'
                      ? languageExpanded ? '⌄' : '›'
                      : '›'}
                  </Text>
                </Pressable>
                {category.id === 'language' && languageExpanded ? (
                  <View style={styles.languageOptions}>
                    {([
                      ['pt-BR', 'Português'],
                      ['en', 'English'],
                      ['es', 'Español'],
                      ['fr', 'Français'],
                    ] as const).map(([language, label]) => {
                      const selected = preferences?.language === language;
                      return (
                        <Pressable
                          key={language}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          disabled={busy || !preferences}
                          onPress={() => void setLanguage(language)}
                          style={[
                            styles.languageOption,
                            {
                              backgroundColor: selected
                                ? appTheme.raisedSurface
                                : appTheme.surface,
                              borderColor: selected ? appTheme.accent : appTheme.border,
                            },
                          ]}
                        >
                          <Text style={styles.cardTitle}>{label}</Text>
                          <Text style={styles.themeSelection}>{selected ? '✓' : '○'}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={contentStyle} keyboardShouldPersistTaps="handled">
      <Pressable
        accessibilityRole="button"
        onPress={() => router.navigate('/settings')}
        style={styles.backButton}
      >
        <Text style={styles.backText}>‹ Todas as configurações</Text>
      </Pressable>
      <Text style={styles.eyebrow}>CONFIGURAÇÕES</Text>
      <Text style={styles.title}>{SECTION_TITLES[section.id]}</Text>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      {section.id === 'audio' || section.id === 'silent' ? (
        <View style={styles.detailCard}>
          <Text style={styles.detailTitle}>🎙️ Microfone</Text>
          {preferences ? (
            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text style={styles.cardTitle}>Modo silencioso</Text>
                <Text style={styles.description}>
                  Entrar em novas salas com o microfone desligado.
                </Text>
              </View>
              <Switch
                accessibilityLabel="Modo silencioso"
                disabled={busy}
                onValueChange={(value) => void toggleSilentMode(value)}
                thumbColor={preferences.silentMode ? '#fff' : '#cbd5e1'}
                trackColor={{ false: '#34405b', true: '#6366f1' }}
                value={preferences.silentMode}
              />
            </View>
          ) : (
            <ActivityIndicator color="#a78bfa" />
          )}
          {section.id === 'audio' ? (
            <>
              <View style={styles.volumeHeading}>
                <Text style={styles.cardTitle}>Volume das vozes</Text>
                <Text style={styles.volumeValue}>
                  {preferences ? `${Math.round(preferences.volume * 100)}%` : '…'}
                </Text>
              </View>
              <View style={styles.volumeControl}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Diminuir volume em 5 por cento"
                  disabled={busy || !preferences || preferences.volume === 0}
                  onPress={() => {
                    if (preferences) {
                      void setOutputVolume(
                        Math.max(0, Number((preferences.volume - 0.05).toFixed(2)))
                      );
                    }
                  }}
                  style={styles.volumeStep}
                >
                  <Text style={styles.volumeStepText}>−</Text>
                </Pressable>
                <View
                  accessibilityLabel={`Volume das vozes: ${Math.round((preferences?.volume ?? 1) * 100)} por cento`}
                  accessibilityRole="progressbar"
                  accessibilityValue={{
                    min: 0,
                    max: 100,
                    now: Math.round((preferences?.volume ?? 1) * 100),
                  }}
                  style={styles.volumeTrack}
                >
                  <View
                    style={[
                      styles.volumeFill,
                      { width: `${Math.round((preferences?.volume ?? 1) * 100)}%` },
                    ]}
                  />
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Aumentar volume em 5 por cento"
                  disabled={busy || !preferences || preferences.volume === 1}
                  onPress={() => {
                    if (preferences) {
                      void setOutputVolume(
                        Math.min(1, Number((preferences.volume + 0.05).toFixed(2)))
                      );
                    }
                  }}
                  style={styles.volumeStep}
                >
                  <Text style={styles.volumeStepText}>+</Text>
                </Pressable>
              </View>
            </>
          ) : null}
          {section.id === 'audio' && preferences ? (
            <>
              <View style={styles.volumeHeading}>
                <Text style={styles.cardTitle}>Câmera padrão</Text>
                <Text style={styles.volumeValue}>
                  {preferences.cameraFacing === 'user' ? 'Frontal' : 'Traseira'}
                </Text>
              </View>
              <View style={styles.volumeChoices}>
                {([
                  ['user', 'Frontal'],
                  ['environment', 'Traseira'],
                ] as const).map(([cameraFacing, label]) => (
                  <Pressable
                    key={cameraFacing}
                    accessibilityRole="button"
                    accessibilityState={{ selected: preferences.cameraFacing === cameraFacing }}
                    disabled={busy}
                    onPress={() => void setCameraFacing(cameraFacing)}
                    style={[
                      styles.volumeChoice,
                      preferences.cameraFacing === cameraFacing && styles.volumeChoiceSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.volumeChoiceText,
                        preferences.cameraFacing === cameraFacing && styles.volumeChoiceTextSelected,
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.helpText}>
                A captura nativa gerencia eco e ruído automaticamente. Os filtros de nitidez e
                cores do website usam processamento de vídeo web que não está disponível nesta versão.
              </Text>
            </>
          ) : null}
          <Text style={styles.helpText}>
            {section.id === 'audio'
              ? 'O volume ajusta as vozes recebidas nas chamadas. O volume geral do aparelho continua nos botões físicos.'
              : 'Ative esta opção para entrar em novas salas com o microfone desligado.'}
          </Text>
        </View>
      ) : null}

      {section.id === 'privacy' ? (
        <View style={styles.detailCard}>
          <Text style={styles.detailTitle}>🔒 Privacidade</Text>
          {privacyLoading ? (
            <ActivityIndicator color="#a78bfa" />
          ) : privacySignedIn ? (
            <>
              <PreferenceSwitch
                title="Mostrar “online agora”"
                description="Permite que seus amigos vejam quando você está online."
                value={privacy.showOnline}
                disabled={busy}
                onChange={(value) => void updatePrivacy('showOnline', value)}
              />
              <PreferenceSwitch
                title="Permitir “visto por último”"
                description="Permite que seus amigos vejam seu último acesso."
                value={privacy.showLastseen}
                disabled={busy}
                onChange={(value) => void updatePrivacy('showLastseen', value)}
              />
              <PreferenceSwitch
                title="Mostrar a sala em que estou"
                description="Permite que seus amigos vejam o nome da sala."
                value={privacy.showRoom}
                disabled={busy}
                onChange={(value) => void updatePrivacy('showRoom', value)}
              />
              <Text style={styles.helpText}>
                As opções são salvas na conta e sincronizadas com o website.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.description}>
                Entre com o Google para controlar quais informações seus amigos veem.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/login')}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>Entrar com Google</Text>
              </Pressable>
            </>
          )}
        </View>
      ) : null}

      {section.id === 'notifications' ? (
        <View style={styles.detailCard}>
          <Text style={styles.detailTitle}>🔔 Notificações</Text>
          {pushLoading ? (
            <ActivityIndicator color="#a78bfa" />
          ) : Platform.OS === 'web' ? (
            <Text style={styles.description}>
              Notificações push do app exigem Android ou iOS e um development build configurado.
            </Text>
          ) : !pushSignedIn ? (
            <>
              <Text style={styles.description}>
                Entre com sua conta para receber mensagens, convites e solicitações neste aparelho.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/login')}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>Entrar com Google</Text>
              </Pressable>
            </>
          ) : (
            <PreferenceSwitch
              title="Mensagens, convites e solicitações"
              description="Receba notificações push neste aparelho."
              value={pushEnabled}
              disabled={busy}
              onChange={(enabled) => void togglePushNotifications(enabled)}
            />
          )}
          <Text style={styles.helpText}>
            {Platform.OS === 'web'
              ? 'Notificações push do app exigem Android ou iOS e um development build configurado.'
              : 'Alertas de entrada e saída de participantes do website ainda não foram portados. O sistema pode pedir permissão; push requer projeto EAS configurado.'}
          </Text>
        </View>
      ) : null}

      {section.id === 'appearance' ? (
        <View style={styles.detailCard}>
          <Text style={styles.detailTitle}>Temas do aplicativo</Text>
          <Text style={styles.description}>
            Escolha uma paleta. A seleção fica salva neste aparelho e pode ser trocada quando quiser.
          </Text>
          <View style={styles.themeOptions}>
            {([
              {
                id: 'orbit',
                title: 'Padrão Orbit',
                description: 'Índigo, violeta e fundo espacial.',
                colors: ['#060a1c', '#6366f1', '#c4b5fd'],
              },
              {
                id: 'light',
                title: 'Claro',
                description: 'Superfícies claras e texto escuro.',
                colors: ['#f3f5fb', '#6253d8', '#192033'],
              },
              {
                id: 'black',
                title: 'Preto',
                description: 'Fundo preto e contrastes suaves.',
                colors: ['#000000', '#7c6cff', '#f5f5f7'],
              },
            ] as const).map((theme) => {
              const selected = (preferences?.theme ?? DEFAULT_APP_PREFERENCES.theme) === theme.id;
              return (
                <Pressable
                  key={theme.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  disabled={busy || !preferences}
                  onPress={() => void setTheme(theme.id)}
                  style={[
                    styles.themeOption,
                    selected && styles.themeOptionSelected,
                    {
                      backgroundColor: selected
                        ? appTheme.id === 'orbit'
                          ? 'rgba(99,102,241,0.14)'
                          : appTheme.id === 'light'
                            ? 'rgba(98,83,216,0.12)'
                            : 'rgba(124,108,255,0.2)'
                        : appTheme.id === 'orbit'
                          ? 'rgba(4,8,20,0.32)'
                          : appTheme.surface,
                      borderColor: selected ? appTheme.accent : appTheme.border,
                    },
                    (busy || !preferences) && { opacity: 0.55 },
                  ]}
                >
                  <View style={styles.themeSwatches}>
                    {theme.colors.map((color) => (
                      <View
                        key={color}
                        preserveThemeColors
                        style={[styles.themeSwatch, { backgroundColor: color }]}
                      />
                    ))}
                  </View>
                  <View style={styles.themeOptionCopy}>
                    <Text style={styles.cardTitle}>{theme.title}</Text>
                    <Text style={styles.description}>{theme.description}</Text>
                  </View>
                  <Text style={styles.themeSelection}>{selected ? '✓' : '○'}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {section.id === 'cleanup' ? (
        <View style={styles.detailCard}>
          <Text style={styles.detailTitle}>🧹 Dados deste aparelho</Text>
          <Text style={styles.description}>
            Limpe suas mensagens antigas sem apagá-las para as outras pessoas. As demais
            preferências deste aparelho também podem ser restauradas.
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={confirmClearChats}
            style={[styles.dangerButton, busy && { opacity: 0.55 }]}
          >
            <Text style={styles.dangerText}>Limpar meu histórico de chats</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={confirmPreferencesReset}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryText}>Restaurar preferências do app</Text>
          </Pressable>
        </View>
      ) : null}

      {section.id === 'updates' ? (
        <>
          <View style={styles.detailCard}>
            <Text style={styles.detailTitle}>🚀 Atualizações do Orbit Room</Text>
            <Text style={styles.description}>
              Notas de versão do website original, organizadas da mais recente para a mais antiga.
            </Text>
          </View>
          {WEBSITE_CHANGELOG.map((release) => (
            <View key={release.version} style={styles.releaseCard}>
              <View style={styles.releaseHeader}>
                <View style={styles.releaseVersion}>
                  <Text style={styles.releaseVersionText}>{release.version}</Text>
                </View>
                <Text style={styles.releaseDate}>{release.date.toUpperCase()}</Text>
                <Text style={styles.releaseNote}>Nota de atualização</Text>
              </View>
              {release.items.map((item, index) => (
                <View
                  key={`${release.version}-${index}`}
                  style={[
                    styles.releaseItem,
                    index === release.items.length - 1 && styles.releaseItemLast,
                  ]}
                >
                  <Text
                    style={[
                      styles.updateTag,
                      item.tag === 'novo' ? styles.updateTagNew :
                        item.tag === 'correcao' ? styles.updateTagFix : styles.updateTagImprove,
                    ]}
                  >
                    {item.tag === 'novo' ? '✨ Novo' :
                      item.tag === 'correcao' ? '🛠 Correção' : '⚡ Melhoria'}
                  </Text>
                  <Text style={styles.updateItem}>{item.text}</Text>
                </View>
              ))}
            </View>
          ))}
          <Text style={styles.helpText}>
            As notas descrevem o website; alguns recursos listados podem não estar disponíveis
            no aplicativo mobile.
          </Text>
        </>
      ) : null}

      {section.id === 'about' ? (
        <View style={styles.detailCard}>
          <View style={styles.aboutHeader}>
            <Image source={require('../assets/orbit-room-logo.png')} style={styles.aboutLogo} />
            <View style={styles.cardText}>
              <Text style={styles.detailTitle}>Orbit Room</Text>
              <Text style={styles.description}>
                {WEBSITE_ABOUT.version} · {WEBSITE_ABOUT.date} · Android e iOS
              </Text>
            </View>
          </View>
          <Text style={styles.aboutText}>{WEBSITE_ABOUT.introduction}</Text>
          <Text style={styles.aboutHeading}>{WEBSITE_ABOUT.heading}</Text>
          <Text style={styles.aboutText}>{WEBSITE_ABOUT.explanation}</Text>
          <View style={styles.aboutPrinciples}>
            {WEBSITE_ABOUT.principles.map((principle) => (
              <View key={principle} style={styles.aboutPrinciple}>
                <Text style={styles.aboutBullet}>•</Text>
                <Text style={styles.aboutText}>{principle}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.aboutText}>{WEBSITE_ABOUT.closing}</Text>
          <Text style={styles.aboutCredits}>{WEBSITE_ABOUT.credits}</Text>
        </View>
      ) : null}

      {section.route ? (
        <Pressable
          accessibilityRole="button"
          onPress={openSectionRoute}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>
            {section.id === 'account' ? 'Abrir conta e perfil' :
              section.id === 'profile' ? 'Editar perfil' :
                section.id === 'friends' ? 'Abrir amigos' :
                  section.id === 'online' ? 'Ver comunidade' :
                    section.id === 'social-chat' ? 'Abrir conversas' :
                      'Abrir perfil'}
          </Text>
        </Pressable>
      ) : null}
      {section.id === 'account' ? (
        <Text style={styles.helpText}>
          A solicitação e o cancelamento de exclusão de conta do website ainda não estão
          disponíveis no app mobile.
        </Text>
      ) : null}
    </ScrollView>
  );
}

function PreferenceSwitch({
  title,
  description,
  value,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  value: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.switchRow}>
      <View style={styles.switchText}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      <Switch
        accessibilityLabel={title}
        disabled={disabled}
        onValueChange={onChange}
        thumbColor={value ? '#fff' : '#cbd5e1'}
        trackColor={{ false: '#34405b', true: '#6366f1' }}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingTop: 24, paddingBottom: 32, gap: 10 },
  eyebrow: { color: '#a78bfa', fontSize: 11, fontWeight: '800', letterSpacing: 1.6 },
  title: { color: '#f4f3ff', fontSize: 28, fontWeight: '800', marginTop: 3 },
  subtitle: { color: '#a5aec4', fontSize: 14, lineHeight: 21, marginTop: 2, marginBottom: 8 },
  group: { gap: 9, marginTop: 8 },
  categoryWrapper: { gap: 6 },
  groupTitle: { color: '#a5aec4', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 2 },
  card: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: 13,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.22)',
    backgroundColor: 'rgba(13,18,40,0.82)',
  },
  pressed: { opacity: 0.75 },
  icon: { fontSize: 22, width: 34, textAlign: 'center' },
  cardText: { flex: 1, gap: 4 },
  cardTitle: { color: '#e8eaff', fontSize: 14, fontWeight: '800' },
  description: { color: '#8992ab', fontSize: 12, lineHeight: 18 },
  arrow: { color: '#a78bfa', fontSize: 25 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 12 },
  backText: { color: '#c4b5fd', fontSize: 13, fontWeight: '700' },
  detailCard: {
    gap: 14,
    marginTop: 8,
    padding: 17,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.22)',
    backgroundColor: 'rgba(13,18,40,0.82)',
  },
  detailTitle: { color: '#e8eaff', fontSize: 16, fontWeight: '800' },
  themeOptions: { gap: 9, marginTop: 4 },
  themeOption: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
    backgroundColor: 'rgba(4,8,20,0.32)',
  },
  themeOptionSelected: {
    borderColor: 'rgba(129,140,248,0.8)',
    backgroundColor: 'rgba(99,102,241,0.14)',
  },
  themeSwatches: { flexDirection: 'row', gap: 4 },
  themeSwatch: {
    width: 18,
    height: 36,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
  },
  themeOptionCopy: { flex: 1, gap: 4 },
  themeSelection: { color: '#a78bfa', fontSize: 19, fontWeight: '800' },
  languageOptions: { gap: 6, marginLeft: 46, marginBottom: 8 },
  languageOption: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 13,
    borderRadius: 12,
    borderWidth: 1,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchText: { flex: 1, gap: 4 },
  volumeHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  volumeValue: { color: '#c4b5fd', fontSize: 13, fontWeight: '800' },
  volumeControl: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  volumeStep: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  volumeStepText: { color: '#e0e7ff', fontSize: 22, fontWeight: '700' },
  volumeTrack: {
    flex: 1,
    height: 8,
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: 'rgba(148,163,184,0.24)',
  },
  volumeFill: { height: '100%', borderRadius: 8, backgroundColor: '#818cf8' },
  volumeChoices: { flexDirection: 'row', gap: 6 },
  volumeChoice: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.16)',
  },
  volumeChoiceSelected: {
    backgroundColor: 'rgba(99,102,241,0.3)',
    borderColor: 'rgba(167,139,250,0.5)',
  },
  volumeChoiceText: { color: '#8992ab', fontSize: 11, fontWeight: '700' },
  volumeChoiceTextSelected: { color: '#e0e7ff' },
  helpText: { color: '#8992ab', fontSize: 12, lineHeight: 19 },
  updateItem: { flex: 1, color: '#d8def0', fontSize: 13, lineHeight: 20 },
  releaseCard: {
    overflow: 'hidden',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.22)',
    backgroundColor: 'rgba(23,28,47,0.88)',
  },
  releaseHeader: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 13,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148,163,184,0.2)',
    backgroundColor: 'rgba(71,85,150,0.28)',
  },
  releaseVersion: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#6366f1',
  },
  releaseVersionText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  releaseDate: { color: '#a5aec4', fontSize: 10, fontWeight: '700' },
  releaseNote: {
    marginLeft: 'auto',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    color: '#cbd5e1',
    backgroundColor: 'rgba(148,163,184,0.15)',
    fontSize: 9,
    fontWeight: '700',
  },
  releaseItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    marginHorizontal: 13,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(148,163,184,0.15)',
  },
  releaseItemLast: { borderBottomWidth: 0 },
  updateTag: {
    overflow: 'hidden',
    minWidth: 82,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 9,
    fontWeight: '800',
  },
  updateTagNew: { color: '#99f6e4', backgroundColor: 'rgba(20,184,166,0.18)' },
  updateTagFix: { color: '#fde68a', backgroundColor: 'rgba(245,158,11,0.18)' },
  updateTagImprove: { color: '#bfdbfe', backgroundColor: 'rgba(59,130,246,0.18)' },
  aboutHeader: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  aboutLogo: { width: 58, height: 58, borderRadius: 14 },
  aboutText: { color: '#cbd5e1', fontSize: 13, lineHeight: 21 },
  aboutHeading: { color: '#f4f3ff', fontSize: 15, fontWeight: '800', marginTop: 2 },
  aboutPrinciples: { gap: 8, paddingLeft: 2 },
  aboutPrinciple: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  aboutBullet: { color: '#a78bfa', fontSize: 16, lineHeight: 20 },
  aboutCredits: {
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(148,163,184,0.2)',
    color: '#8992ab',
    fontSize: 12,
    fontWeight: '700',
  },
  primaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    paddingHorizontal: 16,
    borderRadius: 13,
    backgroundColor: '#6366f1',
  },
  primaryButtonText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  dangerButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(244,63,94,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(251,113,133,0.28)',
  },
  dangerText: { color: '#fda4af', fontSize: 13, fontWeight: '800' },
  secondaryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  secondaryText: { color: '#c4b5fd', fontSize: 13, fontWeight: '700' },
  error: { color: '#fecdd3', fontSize: 12, lineHeight: 19 },
  notice: { color: '#a7f3d0', fontSize: 12, lineHeight: 19 },
});
