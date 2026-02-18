// gameStore.ts : DLLからのゲームデータ状態管理
// React Context による差分マージ・リアルタイム更新

import { createContext, useContext } from 'react';

// ========================================
// 型定義
// ========================================

export interface GameValue {
  value: string;       // 16進数文字列 e.g. "000186A0" (big-endian, size分の桁数)
  address: string;
  size: number;
  lastUpdated: number; // Date.now() ms
}

/**
 * 16進数文字列 → 数値変換
 * DLLはbig-endian表現で送信するためparseIntで正しく変換される
 */
export function hexToNumber(hex: string): number {
  return parseInt(hex, 16);
}

export interface GameState {
  pipeConnected: boolean;
  gameActive: boolean;
  mainram: string;
  values: Record<string, GameValue>;
  // 差分表示用
  lastDeltaKeys: string[];     // 最後に変化したキー一覧
  lastDeltaTime: number;       // 最後の差分受信時刻
  lastReceivedTime: number;    // 最後にデータを受信した時刻
  // エラー
  lastError: string | null;
}

// DLL→Electronメッセージ型
export interface HelloMessage {
  type: 'hello';
  version: string;
  addresses: number;
}

export interface FullMessage {
  type: 'full';
  data: Record<string, { v: string; a: string; s: number }>;
}

export interface DeltaMessage {
  type: 'delta';
  data: Record<string, { v: string }>;
}

export interface StatusMessage {
  type: 'status';
  connected: boolean;
  gameActive: boolean;
  mainram?: string;
}

export interface ErrorMessage {
  type: 'error';
  code: string;
  msg: string;
}

export interface PongMessage {
  type: 'pong';
  ts: number;
}

export type GameMessage =
  | HelloMessage
  | FullMessage
  | DeltaMessage
  | StatusMessage
  | ErrorMessage
  | PongMessage;

// ========================================
// 初期状態
// ========================================

export const initialGameState: GameState = {
  pipeConnected: false,
  gameActive: false,
  mainram: '',
  values: {},
  lastDeltaKeys: [],
  lastDeltaTime: 0,
  lastReceivedTime: 0,
  lastError: null,
};

// ========================================
// Reducer
// ========================================

export type GameAction =
  | { type: 'PIPE_CONNECTED' }
  | { type: 'PIPE_DISCONNECTED' }
  | { type: 'MESSAGE'; payload: GameMessage };

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'PIPE_CONNECTED':
      return { ...state, pipeConnected: true };

    case 'PIPE_DISCONNECTED':
      return {
        ...state,
        pipeConnected: false,
        gameActive: false,
      };

    case 'MESSAGE':
      return handleMessage(state, action.payload);

    default:
      return state;
  }
}

function handleMessage(state: GameState, msg: GameMessage): GameState {
  const now = Date.now();

  switch (msg.type) {
    case 'hello':
      return { ...state, lastReceivedTime: now };

    case 'full': {
      const values: Record<string, GameValue> = {};
      const changedKeys: string[] = [];
      for (const [key, entry] of Object.entries(msg.data)) {
        const existing = state.values[key];
        const isChanged = existing !== undefined && existing.value !== entry.v;
        values[key] = {
          value: entry.v,
          address: entry.a,
          size: entry.s,
          lastUpdated: isChanged ? now : (existing?.lastUpdated ?? now),
        };
        if (isChanged) changedKeys.push(key);
      }
      return {
        ...state,
        values,
        // full受信時: 変化があったキーのみハイライト更新、変化なしなら既存のlastDeltaKeysを保持
        ...(changedKeys.length > 0 ? { lastDeltaKeys: changedKeys, lastDeltaTime: now } : {}),
        lastReceivedTime: now,
      };
    }

    case 'delta': {
      const updatedValues = { ...state.values };
      const changedKeys: string[] = [];
      for (const [key, entry] of Object.entries(msg.data)) {
        const existing = updatedValues[key];
        if (existing) {
          updatedValues[key] = {
            ...existing,
            value: entry.v,
            lastUpdated: now,
          };
        } else {
          updatedValues[key] = {
            value: entry.v,
            address: '',
            size: 0,
            lastUpdated: now,
          };
        }
        changedKeys.push(key);
      }
      return {
        ...state,
        values: updatedValues,
        lastDeltaKeys: changedKeys,
        lastDeltaTime: now,
        lastReceivedTime: now,
      };
    }

    case 'status':
      return {
        ...state,
        gameActive: msg.gameActive,
        mainram: msg.mainram || state.mainram,
        lastReceivedTime: now,
      };

    case 'error':
      return {
        ...state,
        lastError: `[${msg.code}] ${msg.msg}`,
        lastReceivedTime: now,
      };

    case 'pong':
      return { ...state, lastReceivedTime: now };

    default:
      return state;
  }
}

// ========================================
// Context
// ========================================

export interface GameContextType {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

export const GameContext = createContext<GameContextType>({
  state: initialGameState,
  dispatch: () => {},
});

export function useGameState() {
  return useContext(GameContext);
}
