import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { apiRequest } from '../lib/api';

type Peer = { id: string; name: string; photo: string | null };
type Conversation = {
  id: string;
  peer: Peer;
  lastMessage: { text: string; time: number; fromMe: boolean } | null;
  unread: number;
};
type PendingConversation = {
  id: string;
  peer: Peer;
  lastMessage: { text: string; time: number } | null;
};
type Message = { id: string; fromMe: boolean; text: string; time: number };
type Friend = { id: string; name: string };

export default function MessagesScreen() {
  const params = useLocalSearchParams<{
    userId?: string;
    userName?: string;
    conversationId?: string;
  }>();
  const initialUserId = typeof params.userId === 'string' ? params.userId : '';
  const initialUserName = typeof params.userName === 'string' ? params.userName : '';
  const initialConversationId =
    typeof params.conversationId === 'string' ? params.conversationId : '';
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [sentRequests, setSentRequests] = useState<PendingConversation[]>([]);
  const [receivedRequests, setReceivedRequests] = useState<PendingConversation[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(
    initialUserId ? { id: initialUserId, name: initialUserName || 'Amigo' } : null
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const loadInbox = useCallback(async () => {
    const [inbox, requests, social] = await Promise.all([
      apiRequest<{ conversations: Conversation[]; pending: PendingConversation[] }>(
        '/api/social-chat?action=conversations'
      ),
      apiRequest<{ requests: PendingConversation[] }>(
        '/api/social-chat?action=requests'
      ),
      apiRequest<{ friends: Friend[] }>('/api/social'),
    ]);
    setConversations(inbox.conversations);
    setSentRequests(inbox.pending);
    setReceivedRequests(requests.requests);
    setFriends(social.friends);
    if (initialConversationId) {
      const conversation = inbox.conversations.find(
        (item) => item.id === initialConversationId
      );
      if (conversation) {
        setSelectedConversation(conversation);
        setSelectedFriend(null);
      }
    }
    if (initialUserId) {
      const existing = inbox.conversations.find((conversation) => conversation.peer.id === initialUserId);
      if (existing) {
        setSelectedConversation(existing);
        setSelectedFriend(null);
      } else {
        const friend = social.friends.find((item) => item.id === initialUserId);
        if (friend) setSelectedFriend(friend);
      }
    }
  }, [initialConversationId, initialUserId]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        await loadInbox();
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar as conversas.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [loadInbox]);

  const loadMessages = useCallback(async (conversationId: string) => {
    const response = await apiRequest<{ messages: Message[] }>(
      `/api/social-chat?action=messages&conv=${encodeURIComponent(conversationId)}`
    );
    setMessages(response.messages);
  }, []);

  useEffect(() => {
    const conversation = selectedConversation;
    if (!conversation) return;
    let mounted = true;
    const refresh = () => {
      void loadMessages(conversation.id).catch((loadError: unknown) => {
        if (mounted) setError(loadError instanceof Error ? loadError.message : 'Falha ao atualizar mensagens.');
      });
    };
    refresh();
    const timer = setInterval(refresh, 4000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [loadMessages, selectedConversation]);

  const selectedPeer = selectedConversation?.peer ?? selectedFriend;
  const sendRequest = async () => {
    if (!selectedFriend || !draft.trim()) return;
    setBusy(true);
    setError('');
    try {
      await apiRequest('/api/social-chat', {
        method: 'POST',
        body: JSON.stringify({
          action: 'send-request',
          toUserId: selectedFriend.id,
          text: draft.trim(),
        }),
      });
      setDraft('');
      setNotice('Solicitação de conversa enviada.');
      await loadInbox();
      setSelectedFriend(null);
      setSelectedConversation(null);
    } catch (sendError) {
      console.error('Não foi possível iniciar a conversa.', sendError);
      setError(sendError instanceof Error ? sendError.message : 'Não foi possível iniciar a conversa.');
    } finally {
      setBusy(false);
    }
  };

  const respondToRequest = async (conversationId: string, action: 'accept' | 'decline') => {
    setBusy(true);
    setError('');
    try {
      await apiRequest('/api/social-chat', {
        method: 'POST',
        body: JSON.stringify({ action, conversationId }),
      });
      await loadInbox();
    } catch (actionError) {
      console.error('Não foi possível responder à solicitação de conversa.', actionError);
      setError(actionError instanceof Error ? actionError.message : 'A ação não foi concluída.');
    } finally {
      setBusy(false);
    }
  };

  const sendMessage = async () => {
    const text = draft.trim();
    if (!selectedConversation || !text || busy) return;
    setBusy(true);
    setError('');
    try {
      await apiRequest('/api/social-chat', {
        method: 'POST',
        body: JSON.stringify({
          action: 'send-message',
          conversationId: selectedConversation.id,
          text,
        }),
      });
      setDraft('');
      await loadMessages(selectedConversation.id);
    } catch (sendError) {
      console.error('Não foi possível enviar a mensagem.', sendError);
      setError(sendError instanceof Error ? sendError.message : 'Não foi possível enviar a mensagem.');
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

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>Voltar</Text>
        </Pressable>
        <Text style={styles.title}>Mensagens</Text>
        <View style={styles.backButton} />
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <ScrollView style={styles.inbox} contentContainerStyle={styles.inboxContent}>
        {!selectedPeer ? (
          <>
            <Text style={styles.sectionTitle}>Conversas</Text>
            {conversations.map((conversation) => (
              <Pressable
                key={conversation.id}
                onPress={() => {
                  setSelectedConversation(conversation);
                  setSelectedFriend(null);
                  setMessages([]);
                }}
                style={styles.listItem}
              >
                <View style={styles.listText}>
                  <Text style={styles.itemTitle}>{conversation.peer.name}</Text>
                  <Text numberOfLines={1} style={styles.muted}>
                    {conversation.lastMessage?.text ?? 'Comece uma conversa'}
                  </Text>
                </View>
                {conversation.unread > 0 ? <Text style={styles.badge}>{conversation.unread}</Text> : null}
              </Pressable>
            ))}

            <Text style={styles.sectionTitle}>Solicitações recebidas</Text>
            {receivedRequests.map((request) => (
              <View key={request.id} style={styles.requestItem}>
                <View style={styles.listText}>
                  <Text style={styles.itemTitle}>{request.peer.name}</Text>
                  <Text numberOfLines={1} style={styles.muted}>{request.lastMessage?.text}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => void respondToRequest(request.id, 'accept')}
                  style={styles.actionButton}
                >
                  <Text style={styles.actionText}>Aceitar</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => void respondToRequest(request.id, 'decline')}
                  style={styles.rejectButton}
                >
                  <Text style={styles.rejectText}>Recusar</Text>
                </Pressable>
              </View>
            ))}

            <Text style={styles.sectionTitle}>Solicitações enviadas</Text>
            {sentRequests.map((request) => (
              <View key={request.id} style={styles.listItem}>
                <View style={styles.listText}>
                  <Text style={styles.itemTitle}>{request.peer.name}</Text>
                  <Text style={styles.muted}>Aguardando resposta</Text>
                </View>
              </View>
            ))}

            <Text style={styles.sectionTitle}>Iniciar conversa com amigo</Text>
            {friends.map((friend) => (
              <Pressable
                key={friend.id}
                onPress={() => {
                  setSelectedFriend(friend);
                  setSelectedConversation(null);
                  setMessages([]);
                }}
                style={styles.listItem}
              >
                <Text style={styles.itemTitle}>{friend.name}</Text>
                <Text style={styles.secondaryText}>Mensagem</Text>
              </Pressable>
            ))}
            {!conversations.length && !receivedRequests.length && !friends.length ? (
              <Text style={styles.muted}>Adicione amigos para começar uma conversa.</Text>
            ) : null}
          </>
        ) : (
          <>
            <Pressable
              onPress={() => {
                setSelectedConversation(null);
                setSelectedFriend(null);
                setMessages([]);
              }}
              style={styles.returnToInbox}
            >
              <Text style={styles.secondaryText}>‹ Caixa de entrada</Text>
            </Pressable>
            <Text style={styles.sectionTitle}>{selectedPeer.name}</Text>
            {selectedConversation ? (
              messages.map((message) => (
                <View
                  key={message.id}
                  style={[styles.messageBubble, message.fromMe ? styles.ownMessage : styles.theirMessage]}
                >
                  <Text style={styles.messageText}>{message.text}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.muted}>
                Envie uma solicitação para iniciar uma conversa. A outra pessoa precisará aceitar.
              </Text>
            )}
          </>
        )}
      </ScrollView>

      {selectedPeer ? (
        <View style={styles.composer}>
          <TextInput
            accessibilityLabel={selectedConversation ? 'Mensagem' : 'Solicitação de conversa'}
            editable={!busy}
            maxLength={2000}
            multiline
            onChangeText={setDraft}
            placeholder={selectedConversation ? 'Escreva uma mensagem...' : 'Escreva sua solicitação...'}
            placeholderTextColor="#8790a8"
            style={styles.input}
            value={draft}
          />
          <Pressable
            accessibilityRole="button"
            disabled={busy || !draft.trim()}
            onPress={() => void (selectedConversation ? sendMessage() : sendRequest())}
            style={[styles.actionButton, (busy || !draft.trim()) && styles.disabled]}
          >
            <Text style={styles.actionText}>{busy ? '...' : 'Enviar'}</Text>
          </Pressable>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#080d1d' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#080d1d' },
  header: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  backButton: { width: 64, paddingVertical: 10 },
  backText: { color: '#c4b5fd', fontWeight: '700' },
  title: { color: '#f4f3ff', fontSize: 17, fontWeight: '800' },
  inbox: { flex: 1 },
  inboxContent: { padding: 16, paddingBottom: 32, gap: 8 },
  sectionTitle: { color: '#f4f3ff', fontSize: 16, fontWeight: '800', marginTop: 16, marginBottom: 4 },
  listItem: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.045)',
    gap: 8,
  },
  requestItem: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.045)',
    gap: 6,
  },
  listText: { flex: 1 },
  itemTitle: { color: '#e5e7f2', fontSize: 13, fontWeight: '700' },
  muted: { color: '#8992ab', fontSize: 12, marginTop: 3, lineHeight: 18 },
  badge: { color: '#fff', backgroundColor: '#6366f1', overflow: 'hidden', padding: 5, borderRadius: 10 },
  actionButton: { paddingHorizontal: 11, paddingVertical: 9, borderRadius: 9, backgroundColor: '#6366f1' },
  actionText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  rejectButton: { paddingHorizontal: 6, paddingVertical: 8 },
  rejectText: { color: '#fda4af', fontSize: 11, fontWeight: '700' },
  secondaryText: { color: '#c4b5fd', fontSize: 12, fontWeight: '700' },
  returnToInbox: { paddingVertical: 8 },
  messageBubble: { maxWidth: '84%', padding: 12, borderRadius: 14, marginVertical: 4 },
  ownMessage: { alignSelf: 'flex-end', backgroundColor: '#3730a3' },
  theirMessage: { alignSelf: 'flex-start', backgroundColor: '#1e293b' },
  messageText: { color: '#f4f3ff', fontSize: 14, lineHeight: 20 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  input: {
    flex: 1,
    maxHeight: 110,
    minHeight: 46,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 12,
    color: '#f8fafc',
    backgroundColor: 'rgba(255,255,255,0.06)',
    fontSize: 14,
  },
  disabled: { opacity: 0.55 },
  error: { color: '#fecdd3', padding: 12, lineHeight: 19 },
  notice: { color: '#a7f3d0', paddingHorizontal: 14, paddingTop: 8 },
});
