import * as net from 'net';
import { EventEmitter } from 'events';

const PIPE_NAME = '\\\\.\\pipe\\ssr3_viewer';
const RECONNECT_INTERVAL = 2000;

export interface PipeMessage {
  type: string;
  [key: string]: unknown;
}

export class PipeClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private buffer = '';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  connect(): void {
    this.stopped = false;
    this.tryConnect();
  }

  private tryConnect(): void {
    if (this.stopped) return;

    this.socket = net.createConnection(PIPE_NAME, () => {
      console.log('[PipeClient] Connected to DLL pipe');
      this.emit('connected');
    });

    this.socket.setEncoding('utf-8');

    this.socket.on('data', (data: string) => {
      this.buffer += data;
      // LF区切りでメッセージ分割
      const lines = this.buffer.split('\n');
      // 最後の不完全行はバッファに残す
      this.buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed) as PipeMessage;
          this.emit('message', msg);
        } catch {
          console.warn('[PipeClient] JSON parse error:', trimmed);
        }
      }
    });

    this.socket.on('error', (err: Error) => {
      console.log('[PipeClient] Error:', err.message);
    });

    this.socket.on('close', () => {
      console.log('[PipeClient] Disconnected');
      this.emit('disconnected');
      this.scheduleReconnect();
    });
  }

  /** コマンド送信 (JSON + LF) */
  send(cmd: object): void {
    if (!this.socket || this.socket.destroyed) return;
    const json = JSON.stringify(cmd) + '\n';
    this.socket.write(json);
  }

  /** 値書き込み */
  writeValue(target: string, value: number): void {
    this.send({ cmd: 'write', target, value });
  }

  /** フルステート要求 */
  requestRefresh(): void {
    this.send({ cmd: 'refresh' });
  }

  /** バージョン設定（BA / RJ） */
  setVersion(version: string): void {
    this.send({ cmd: 'setVersion', target: version });
  }

  /** ping送信 */
  ping(): void {
    this.send({ cmd: 'ping' });
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.tryConnect();
    }, RECONNECT_INTERVAL);
  }

  disconnect(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }
}
