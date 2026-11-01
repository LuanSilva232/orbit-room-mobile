export type ChannelId = string;

export type Channel = {
  id: ChannelId;
  label: string;
  description: string;
};

export type Member = {
  clientId: string;
  name: string;
  channel: string;
  joinedAt: number;
  photo?: string;
  bio?: string;
  cover?: string;
  muted?: boolean;
  isAnonymous: boolean;
};

export type MailboxMessage =
  | { id: number; type: 'signal'; from: string; kind: 'offer' | 'answer' | 'ice'; data: unknown }
  | { id: number; type: 'peer-joined'; member: Member }
  | { id: number; type: 'peer-left'; clientId: string }
  | { id: number; type: 'peer-updated'; member: Member }
  | { id: number; type: 'channel-state'; channel: string; members: Member[] }
  | { id: number; type: 'chat'; message: ChatMessage }
  | { id: number; type: 'chat-deleted'; messageId: string }
  | { id: number; type: 'chat-cleared'; channel: string }
  | { id: number; type: 'screen-kind'; from: string; trackIds: string[]; streamId?: string }
  | { id: number; type: 'admin-mute' | 'peer-mute'; targetId: string; muted: boolean }
  | { id: number; type: 'kicked'; reason?: string };

export type ChatMessage = {
  id: string;
  channel: string;
  memberId: string;
  author: string;
  text: string;
  time: number;
  photo?: string;
};
