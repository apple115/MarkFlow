import * as Y from 'yjs';
import { encrypt, decrypt, roomIdFromKey, type SyncConfig } from './sync';
import { log } from './logger';

type SignalingMessage = {
  type: 'offer' | 'answer' | 'ice-candidate' | 'peer-join' | 'peer-leave';
  payload?: any;
  from?: string;
};

/**
 * Manages WebRTC P2P connections via the Worker signaling server.
 * - Connects to signaling WebSocket for ICE candidate exchange
 * - Establishes WebRTC data channels with peers
 * - Sends/receives encrypted Yjs updates
 */
export type SyncStatus = 'offline' | 'online' | 'syncing';

export class SyncConnection {
  private deviceId: string;
  private config: SyncConfig;
  private ydoc: Y.Doc;
  private ws: WebSocket | null = null;
  private peers = new Map<string, { pc: RTCPeerConnection; dc: RTCDataChannel | null }>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private onStatusChange: (status: SyncStatus) => void;

  constructor(ydoc: Y.Doc, config: SyncConfig, onStatusChange: (status: SyncStatus) => void) {
    this.ydoc = ydoc;
    this.config = config;
    this.deviceId = crypto.randomUUID();
    this.onStatusChange = onStatusChange;
  }

  connect(): void {
    if (this.destroyed) return;
    const roomId = roomIdFromKey(this.config.roomKey);
    const url = `${this.config.serverUrl.replace('https://', 'wss://').replace('http://', 'ws://')}/room/${roomId}/signaling?deviceId=${this.deviceId}`;

    log.info('Sync: connecting to signaling', url);
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      log.info('Sync: signaling connected');
      this.onStatusChange('online');
    };

    ws.onmessage = async (event) => {
      try {
        const msg: SignalingMessage = JSON.parse(event.data as string);
        await this.handleSignalingMessage(msg);
      } catch (err) {
        log.warn('Sync: signaling message error', err);
      }
    };

    ws.onclose = () => {
      log.info('Sync: signaling disconnected, reconnecting in 5s');
      this.ws = null;
      this.onStatusChange('offline');
      if (!this.destroyed) {
        this.reconnectTimer = setTimeout(() => this.connect(), 5000);
      }
    };

    ws.onerror = () => {
      log.warn('Sync: signaling error');
    };
  }

  private async handleSignalingMessage(msg: SignalingMessage): Promise<void> {
    const { type, payload, from } = msg;

    if (type === 'peer-join' || type === 'peer-leave') {
      log.info('Sync: peer event', type);
      if (type === 'peer-join' && from && from !== this.deviceId) {
        this.createPeer(from);
      }
      return;
    }

    if (!from || from === this.deviceId) return;

    if (type === 'offer') {
      await this.handleOffer(from, payload);
    } else if (type === 'answer') {
      await this.handleAnswer(from, payload);
    } else if (type === 'ice-candidate') {
      const peer = this.peers.get(from);
      if (peer) {
        await peer.pc.addIceCandidate(new RTCIceCandidate(payload));
      }
    }
  }

  private makePC(peerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.sendSignaling({
          type: 'ice-candidate',
          payload: e.candidate.toJSON(),
          from: this.deviceId,
          to: peerId,
        });
      }
    };

    pc.ondatachannel = (e) => {
      this.setupDataChannel(peerId, e.channel);
    };

    return pc;
  }

  private createPeer(peerId: string): void {
    if (this.peers.has(peerId)) return;

    const pc = this.makePC(peerId);
    const dc = pc.createDataChannel('yjs-sync');
    this.peers.set(peerId, { pc, dc: null });

    this.setupDataChannel(peerId, dc);

    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => {
        this.sendSignaling({
          type: 'offer',
          payload: pc.localDescription
            ? { type: pc.localDescription.type, sdp: pc.localDescription.sdp }
            : null,
          from: this.deviceId,
          to: peerId,
        });
      })
      .catch((err) => log.warn('Sync: offer failed', err));
  }

  private async handleOffer(peerId: string, offer: RTCSessionDescriptionInit): Promise<void> {
    let peer = this.peers.get(peerId);
    if (!peer) {
      const pc = this.makePC(peerId);
      peer = { pc, dc: null };
      this.peers.set(peerId, peer);
    }

    await peer.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peer.pc.createAnswer();
    await peer.pc.setLocalDescription(answer);
    this.sendSignaling({
      type: 'answer',
      payload: { type: answer.type, sdp: answer.sdp },
      from: this.deviceId,
      to: peerId,
    });
  }

  private async handleAnswer(peerId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const peer = this.peers.get(peerId);
    if (peer) {
      await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
  }

  private setupDataChannel(peerId: string, dc: RTCDataChannel): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    peer.dc = dc;

    dc.binaryType = 'arraybuffer';

    dc.onopen = () => {
      log.info('Sync: data channel open with', peerId);
      const state = Y.encodeStateAsUpdate(this.ydoc);
      encrypt(state, this.config.roomKey).then((encrypted) => {
        if (dc.readyState === 'open') dc.send(encrypted);
      });
    };

    dc.onmessage = async (e) => {
      try {
        const encrypted = new Uint8Array(e.data as ArrayBuffer);
        const update = await decrypt(encrypted, this.config.roomKey);
        Y.applyUpdate(this.ydoc, update);
      } catch (err) {
        log.warn('Sync: data channel message error', err);
      }
    };

    dc.onclose = () => {
      log.info('Sync: data channel closed with', peerId);
      this.peers.delete(peerId);
    };
  }

  private sendSignaling(msg: Record<string, any>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /** Broadcast a Yjs update to all connected peers. */
  broadcastUpdate(update: Uint8Array): void {
    encrypt(update, this.config.roomKey).then((encrypted) => {
      for (const [, peer] of this.peers) {
        if (peer.dc?.readyState === 'open') {
          peer.dc.send(encrypted);
        }
      }
    });
  }

  updateConfig(config: SyncConfig): void {
    this.config = config;
  }

  destroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    for (const [, peer] of this.peers) {
      peer.dc?.close();
      peer.pc.close();
    }
    this.peers.clear();
  }
}
