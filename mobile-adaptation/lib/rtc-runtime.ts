import type { ComponentType } from 'react';
import type {
  RtcEngine,
  RtcEngineEvents,
  RtcMediaStream,
  RtcSignalKind,
  RtcVideoViewProps,
} from './rtc-runtime.types';

export type {
  RtcEngine,
  RtcEngineEvents,
  RtcMediaStream,
  RtcSignalKind,
  RtcTrack,
  RtcVideoViewProps,
} from './rtc-runtime.types';

export const RtcVideoView: ComponentType<RtcVideoViewProps> = () => null;

export function createRtcEngine(
  _clientId: string,
  _sendSignal: (message: {
    to: string;
    kind: RtcSignalKind;
    data: unknown;
  }) => Promise<void>,
  _events: RtcEngineEvents
): RtcEngine {
  return {
    addPeer() {},
    removePeer() {},
    async handleSignal() {},
    async getSpeakingParticipants() {
      return [];
    },
    addLocalStream() {},
    removeLocalStream() {},
    closeAll() {},
  };
}

export function getRtcUserMedia(
  _kind: 'audio' | 'video',
  _facingMode?: 'user' | 'environment'
): Promise<RtcMediaStream> {
  return Promise.reject(
    new Error('Câmera e microfone nativos estão disponíveis no app Android/iOS.')
  );
}

export function getRtcDisplayMedia(): Promise<RtcMediaStream> {
  return Promise.reject(
    new Error('Compartilhamento de tela está disponível no app Android.')
  );
}
