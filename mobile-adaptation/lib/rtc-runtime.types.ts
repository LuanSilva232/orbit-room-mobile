import type {
  MediaStream as WebRtcMediaStream,
  MediaStreamTrack as WebRtcMediaStreamTrack,
  RTCVideoViewProps,
} from 'react-native-webrtc';

export type RtcTrack = WebRtcMediaStreamTrack;
export type RtcMediaStream = WebRtcMediaStream;

export type RtcSignalKind = 'offer' | 'answer' | 'ice';

export type RtcEngineEvents = {
  onTrack(peerId: string, stream: RtcMediaStream): void;
  onStreamGone(peerId: string, stream: RtcMediaStream): void;
  onPeerGone(peerId: string): void;
  onError(error: Error): void;
};

export type RtcEngine = {
  addPeer(peerId: string): void;
  removePeer(peerId: string): void;
  handleSignal(peerId: string, kind: RtcSignalKind, data: unknown): Promise<void>;
  addLocalStream(stream: RtcMediaStream): void;
  removeLocalStream(stream: RtcMediaStream): void;
  closeAll(): void;
};

export type { RTCVideoViewProps as RtcVideoViewProps };
