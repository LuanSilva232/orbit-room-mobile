import { router } from 'expo-router';
import type { Channel } from './types';

let activeChannel: Channel | null = null;

export function getActiveCallChannel(): Channel | null {
  return activeChannel;
}

export function setActiveCallChannel(channel: Channel | null): void {
  activeChannel = channel;
}

export function openActiveChannelChat(): void {
  if (!activeChannel) {
    router.navigate({ pathname: '/', params: { tab: 'calls' } });
    return;
  }

  router.navigate({
    pathname: '/',
    params: {
      tab: 'channel-chat',
      roomId: activeChannel.id,
      roomName: activeChannel.label,
    },
  });
}
