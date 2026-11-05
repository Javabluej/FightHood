import { CharacterId, InputState, StageId } from '../types';

export interface LobbyState {
  hostChar: CharacterId;
  guestChar: CharacterId;
  stage: StageId;
  hostReady?: boolean;
  guestReady?: boolean;
}

import type { FighterSnapshot } from '../combat/Fighter';
export type { FighterSnapshot } from '../combat/Fighter';

export interface StateSnapshotMessage {
  type: 'sync_snapshot';
  frame: number;
  timer: number;
  f1: FighterSnapshot;
  f2: FighterSnapshot;
  ackInputFrame?: number;
}

export type NetEventMessage =
  | { type: 'net_event'; event: 'pause'; paused: boolean }
  | { type: 'net_event'; event: 'hit'; attacker: 'p1' | 'p2'; moveId?: string; damage?: number; blocked?: boolean; knockdown?: boolean }
  | { type: 'net_event'; event: 'super_trigger'; attacker: 'p1' | 'p2' }
  | { type: 'net_event'; event: 'super_end' }
  | { type: 'net_event'; event: 'round_start'; round: number }
  | { type: 'net_event'; event: 'round_over'; p1Wins: number; p2Wins: number; timeUp?: boolean; peace?: boolean }
  | { type: 'net_event'; event: 'match_over'; winner: CharacterId; loser: CharacterId; peace?: boolean; p1Wins: number; p2Wins: number }
  | { type: 'net_event'; event: 'return_to_select' }
  | { type: 'net_event'; event: 'rematch' };

export type NetworkMessage =
  | { type: 'room_created'; code: string }
  | { type: 'room_joined'; code: string; role: 'host' | 'guest' }
  | { type: 'lobby_sync'; state: LobbyState }
  | { type: 'match_start'; stage: StageId; p1Char: CharacterId; p2Char: CharacterId }
  | { type: 'input_frame'; frame: number; input: InputState }
  | StateSnapshotMessage
  | NetEventMessage
  | { type: 'rematch' }
  | { type: 'peer_disconnect' }
  | { type: 'error'; message: string };

export class NetworkClient {
  private ws: WebSocket | null = null;
  public roomCode: string | null = null;
  public role: 'host' | 'guest' | null = null;
  public isConnected: boolean = false;

  public onRoomCreated: ((code: string) => void) | null = null;
  public onRoomJoined: ((code: string, role: 'host' | 'guest') => void) | null = null;
  public onLobbyUpdate: ((state: LobbyState) => void) | null = null;
  public onMatchStart: ((msg: { stage: StageId; p1Char: CharacterId; p2Char: CharacterId }) => void) | null = null;
  public onRemoteInput: ((input: InputState, frame: number) => void) | null = null;
  public onSnapshot: ((snap: StateSnapshotMessage) => void) | null = null;
  public onNetEvent: ((event: NetEventMessage) => void) | null = null;
  public onRematch: (() => void) | null = null;
  public onPeerDisconnect: (() => void) | null = null;
  public onError: ((err: string) => void) | null = null;

  constructor(private serverUrl?: string) {
    if (!this.serverUrl) {
      const host = window.location.hostname || 'localhost';
      this.serverUrl = import.meta.env.VITE_MULTIPLAYER_URL || `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${host}:8080`;
    }
  }

  private connectionAttempt: Promise<void> | null = null;

  public connect(): Promise<void> {
    if (this.connectionAttempt) return this.connectionAttempt;
    const attempt = this.openConnection();
    this.connectionAttempt = attempt;
    const clear = () => { if (this.connectionAttempt === attempt) this.connectionAttempt = null; };
    attempt.then(clear, clear);
    return attempt;
  }

  private openConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (this.ws && this.isConnected && this.ws.readyState === WebSocket.OPEN) {
          resolve();
          return;
        }
        if (this.ws) {
          this.ws.close();
        }
        const socket = new WebSocket(this.serverUrl!);
        this.ws = socket;
        const timeout = setTimeout(() => {
          socket.close();
          reject(new Error('Multiplayer server did not respond.'));
        }, 8000);
        this.ws.onopen = () => {
          clearTimeout(timeout);
          this.isConnected = true;
          resolve();
        };
        this.ws.onerror = (e) => {
          clearTimeout(timeout);
          console.warn('Multiplayer server connection error:', e);
          reject(e);
        };
        this.ws.onclose = () => {
          clearTimeout(timeout);
          reject(new Error('Multiplayer connection closed.'));
          if (this.ws !== socket) return;
          this.isConnected = false;
          this.onPeerDisconnect?.();
        };
        this.ws.onmessage = (event) => {
          if (this.ws !== socket) return;
          try {
            this.handleMessage(JSON.parse(event.data));
          } catch (e) {
            console.error('Failed to parse incoming message:', e);
          }
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  public createRoom(): void {
    if (!this.ws || !this.isConnected) return;
    this.role = 'host';
    this.ws.send(JSON.stringify({ type: 'create_room' }));
  }

  public joinRoom(code: string): void {
    if (!this.ws || !this.isConnected) return;
    this.role = 'guest';
    this.roomCode = code.toUpperCase().trim();
    this.ws.send(JSON.stringify({ type: 'join_room', code: this.roomCode }));
  }

  public sendLobbyUpdate(state: LobbyState): void {
    if (!this.ws || !this.isConnected) return;
    this.ws.send(JSON.stringify({ type: 'lobby_sync', state }));
  }

  public startMatch(stage: StageId, p1Char: CharacterId, p2Char: CharacterId): void {
    if (!this.ws || !this.isConnected) return;
    this.ws.send(
      JSON.stringify({
        type: 'match_start',
        stage,
        p1Char,
        p2Char,
      })
    );
  }

  public sendInput(frame: number, input: InputState): void {
    if (!this.ws || !this.isConnected) return;
    this.ws.send(JSON.stringify({ type: 'input_frame', frame, input }));
  }

  public sendSnapshot(frame: number, timer: number, f1: FighterSnapshot, f2: FighterSnapshot, ackInputFrame = 0): void {
    if (!this.ws || !this.isConnected) return;
    // Never queue stale positions behind a congested connection.
    if (this.ws.bufferedAmount > 64 * 1024) return;
    this.ws.send(JSON.stringify({ type: 'sync_snapshot', frame, timer, f1, f2, ackInputFrame }));
  }

  public sendNetEvent(event: NetEventMessage): void {
    if (!this.ws || !this.isConnected) return;
    this.ws.send(JSON.stringify(event));
  }

  public sendRematch(): void {
    if (!this.ws || !this.isConnected) return;
    this.ws.send(JSON.stringify({ type: 'rematch' }));
  }

  private handleMessage(msg: NetworkMessage): void {
    switch (msg.type) {
      case 'room_created':
        this.roomCode = msg.code;
        this.role = 'host';
        this.onRoomCreated?.(msg.code);
        break;
      case 'room_joined':
        this.roomCode = msg.code;
        this.role = msg.role;
        this.onRoomJoined?.(msg.code, msg.role);
        break;
      case 'lobby_sync':
        this.onLobbyUpdate?.(msg.state);
        break;
      case 'match_start':
        this.onMatchStart?.(msg);
        break;
      case 'input_frame':
        this.onRemoteInput?.(msg.input, msg.frame);
        break;
      case 'sync_snapshot':
        this.onSnapshot?.(msg);
        break;
      case 'net_event':
        this.onNetEvent?.(msg);
        break;
      case 'rematch':
        this.onRematch?.();
        break;
      case 'peer_disconnect':
        this.onPeerDisconnect?.();
        break;
      case 'error':
        this.onError?.(msg.message);
        break;
    }
  }

  public disconnect(): void {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.roomCode = null;
    this.role = null;
  }
}
