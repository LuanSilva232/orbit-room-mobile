import type { ComponentType } from 'react';
import {
  MediaStream,
  RTCPeerConnection,
  RTCView,
  mediaDevices,
} from 'react-native-webrtc';
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
  RtcVideoViewProps,
} from './rtc-runtime.types';

export const RtcVideoView = RTCView as ComponentType<RtcVideoViewProps>;

type Peer = {
  connection: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  pendingCandidates: RTCIceCandidateInit[];
};

type SessionDescription = { type: 'offer' | 'answer'; sdp: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDescription(
  value: unknown,
  expectedType: 'offer' | 'answer'
): value is SessionDescription {
  return (
    isRecord(value) &&
    value.type === expectedType &&
    typeof value.sdp === 'string'
  );
}

function isIceCandidate(value: unknown): value is RTCIceCandidateInit {
  return (
    isRecord(value) &&
    typeof value.candidate === 'string' &&
    (typeof value.sdpMid === 'string' || value.sdpMid === null) &&
    (typeof value.sdpMLineIndex === 'number' || value.sdpMLineIndex === null)
  );
}

class NativeRtcEngine implements RtcEngine {
  private readonly peers = new Map<string, Peer>();
  private readonly localStreams: RtcMediaStream[] = [];

  constructor(
    private readonly clientId: string,
    private readonly sendSignal: (message: {
      to: string;
      kind: RtcSignalKind;
      data: unknown;
    }) => Promise<void>,
    private readonly events: RtcEngineEvents
  ) {}

  addPeer(peerId: string): void {
    if (peerId === this.clientId || this.peers.has(peerId)) return;

    const peer: Peer = {
      connection: new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun.services.mozilla.com' },
        ],
      }),
      polite: this.clientId < peerId,
      makingOffer: false,
      ignoreOffer: false,
      pendingCandidates: [],
    };
    this.peers.set(peerId, peer);

    const connection = peer.connection;
    for (const stream of this.localStreams) {
      for (const track of stream.getTracks()) connection.addTrack(track, stream);
    }

    connection.addEventListener('icecandidate', (event) => {
      if (!event.candidate) return;
      const { candidate, sdpMid, sdpMLineIndex } = event.candidate;
      void this.send(peerId, 'ice', {
        candidate,
        sdpMid,
        sdpMLineIndex,
      });
    });

    connection.addEventListener('track', (event) => {
      const stream = event.streams[0] ?? new MediaStream();
      if (!event.streams[0] && event.track && !stream.getTracks().includes(event.track)) {
        stream.addTrack(event.track);
      }

      const track = event.track;
      if (track) {
        const removeEndedTrack = () => {
          if (!stream.getTracks().includes(track)) return;
          stream.removeTrack(track);
          if (stream.getTracks().length === 0) this.events.onStreamGone(peerId, stream);
        };
        track.addEventListener('ended', removeEndedTrack);
      }
      this.events.onTrack(peerId, stream);
    });

    connection.addEventListener('negotiationneeded', async () => {
      try {
        peer.makingOffer = true;
        await connection.setLocalDescription();
        const description = connection.localDescription;
        if (description?.type === 'offer' && description.sdp) {
          await this.send(peerId, 'offer', {
            type: description.type,
            sdp: description.sdp,
          });
        }
      } catch (error) {
        this.reportError(error, 'Não foi possível iniciar a chamada.');
      } finally {
        peer.makingOffer = false;
      }
    });

    connection.addEventListener('connectionstatechange', () => {
      if (connection.connectionState === 'failed') {
        this.reconnect(peerId);
      } else if (connection.connectionState === 'disconnected') {
        this.restartIce(peerId);
      } else if (connection.connectionState === 'closed') {
        this.removePeer(peerId);
      }
    });

    connection.addEventListener('signalingstatechange', () => {
      if (connection.signalingState === 'stable') peer.ignoreOffer = false;
    });
  }

  async handleSignal(peerId: string, kind: RtcSignalKind, data: unknown): Promise<void> {
    if (!this.peers.has(peerId)) this.addPeer(peerId);
    const peer = this.peers.get(peerId);
    if (!peer) return;
    const { connection } = peer;

    if (kind === 'offer') {
      if (!isDescription(data, 'offer')) {
        this.events.onError(new Error('A oferta WebRTC recebida é inválida.'));
        return;
      }

      const offerCollision =
        peer.makingOffer || connection.signalingState !== 'stable';
      peer.ignoreOffer = !peer.polite && offerCollision;
      if (peer.ignoreOffer) return;

      try {
        if (connection.signalingState === 'have-local-offer') {
          await connection.setLocalDescription({ type: 'rollback', sdp: '' });
        }
        await connection.setRemoteDescription(data);
        await this.flushCandidates(peer);
        await connection.setLocalDescription();
        const answer = connection.localDescription;
        if (answer?.type === 'answer' && answer.sdp) {
          await this.send(peerId, 'answer', {
            type: answer.type,
            sdp: answer.sdp,
          });
        }
      } catch (error) {
        this.reportError(error, 'Não foi possível aceitar a chamada recebida.');
      }
    } else if (kind === 'answer') {
      if (!isDescription(data, 'answer')) {
        this.events.onError(new Error('A resposta WebRTC recebida é inválida.'));
        return;
      }
      try {
        await connection.setRemoteDescription(data);
        await this.flushCandidates(peer);
      } catch (error) {
        this.reportError(error, 'Não foi possível concluir a chamada.');
      }
    } else if (kind === 'ice') {
      if (!isIceCandidate(data)) return;
      if (!connection.remoteDescription) {
        peer.pendingCandidates.push(data);
        return;
      }
      try {
        await connection.addIceCandidate(data);
      } catch (error) {
        if (!peer.ignoreOffer) {
          this.reportError(error, 'A conexão de mídia foi interrompida.');
        }
      }
    }
  }

  addLocalStream(stream: RtcMediaStream): void {
    if (this.localStreams.includes(stream)) return;
    this.localStreams.push(stream);
    for (const peer of this.peers.values()) {
      for (const track of stream.getTracks()) {
        peer.connection.addTrack(track, stream);
      }
    }
  }

  removeLocalStream(stream: RtcMediaStream): void {
    const streamIndex = this.localStreams.indexOf(stream);
    if (streamIndex !== -1) this.localStreams.splice(streamIndex, 1);
    const trackIds = new Set(stream.getTracks().map((track) => track.id));

    for (const peer of this.peers.values()) {
      for (const sender of peer.connection.getSenders()) {
        if (sender.track && trackIds.has(sender.track.id)) {
          peer.connection.removeTrack(sender);
        }
      }
    }
  }

  removePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    peer.connection.close();
    this.peers.delete(peerId);
    this.events.onPeerGone(peerId);
  }

  closeAll(): void {
    for (const peerId of Array.from(this.peers.keys())) this.removePeer(peerId);
    this.localStreams.length = 0;
  }

  private async send(peerId: string, kind: RtcSignalKind, data: unknown): Promise<void> {
    try {
      await this.sendSignal({ to: peerId, kind, data });
    } catch (error) {
      this.reportError(error, 'Não foi possível enviar a sinalização da chamada.');
    }
  }

  private async flushCandidates(peer: Peer): Promise<void> {
    const candidates = peer.pendingCandidates.splice(0);
    for (const candidate of candidates) {
      await peer.connection.addIceCandidate(candidate);
    }
  }

  private reconnect(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    const oldConnection = peer.connection;
    setTimeout(() => {
      if (
        this.peers.get(peerId) !== peer ||
        oldConnection.connectionState !== 'failed'
      ) {
        return;
      }
      this.removePeer(peerId);
      this.addPeer(peerId);
    }, 1200);
  }

  private restartIce(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    const connection = peer.connection;
    setTimeout(() => {
      if (
        this.peers.get(peerId) !== peer ||
        connection.connectionState !== 'disconnected'
      ) {
        return;
      }
      try {
        connection.restartIce();
      } catch {
        this.reconnect(peerId);
      }
    }, 1200);
  }

  private reportError(error: unknown, fallback: string): void {
    this.events.onError(
      error instanceof Error ? error : new Error(fallback, { cause: error })
    );
  }
}

export function createRtcEngine(
  clientId: string,
  sendSignal: (message: {
    to: string;
    kind: RtcSignalKind;
    data: unknown;
  }) => Promise<void>,
  events: RtcEngineEvents
): RtcEngine {
  return new NativeRtcEngine(clientId, sendSignal, events);
}

export async function getRtcUserMedia(
  kind: 'audio' | 'video',
  facingMode: 'user' | 'environment' = 'user'
): Promise<RtcMediaStream> {
  return mediaDevices.getUserMedia(
    kind === 'audio'
      ? { audio: true, video: false }
      : { audio: false, video: { facingMode } }
  );
}

export async function getRtcDisplayMedia(): Promise<RtcMediaStream> {
  return mediaDevices.getDisplayMedia({});
}
