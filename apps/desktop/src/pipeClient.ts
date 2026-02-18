import * as net from 'net';
import { EventEmitter } from 'events';

const PIPE_NAME = '\\\\.\\pipe\\ssr3_viewer';
const RECONNECT_INTERVAL = 2000;

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
      // フレーム区切り: \n\n（空行）
      const frames = this.buffer.split('\n\n');
      // 最後の不完全フレームはバッファに残す
      this.buffer = frames.pop() || '';
      for (const frame of frames) {
        const trimmed = frame.trim();
        if (trimmed) {
          this.emit('frame', trimmed);
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
