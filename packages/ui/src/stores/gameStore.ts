// gameStore.ts : DLLからのゲームデータ状態管理
// Zustand によるグローバルステート + セレクターフック

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import rezonMapping from '@data/rezon_mapping.json';

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
// Zustand Store
// ========================================

interface GameActions {
  setPipeConnected: (connected: boolean) => void;
  handleMessage: (msg: GameMessage) => void;
  reset: () => void;
}

type GameStore = GameState & GameActions;

const initialState: GameState = {
  pipeConnected: false,
  gameActive: false,
  mainram: '',
  values: {},
  lastDeltaKeys: [],
  lastDeltaTime: 0,
  lastReceivedTime: 0,
  lastError: null,
};

export const useGameStore = create<GameStore>()((set, get) => ({
  ...initialState,

  setPipeConnected: (connected) =>
    set(
      connected
        ? { pipeConnected: true }
        : { pipeConnected: false, gameActive: false },
    ),

  handleMessage: (msg) => {
    const now = Date.now();

    switch (msg.type) {
      case 'hello':
        set({ lastReceivedTime: now });
        break;

      case 'full': {
        const prev = get().values;
        const values: Record<string, GameValue> = {};
        const changedKeys: string[] = [];
        for (const [key, entry] of Object.entries(msg.data)) {
          const existing = prev[key];
          const isChanged = existing !== undefined && existing.value !== entry.v;
          values[key] = {
            value: entry.v,
            address: entry.a,
            size: entry.s,
            lastUpdated: isChanged ? now : (existing?.lastUpdated ?? now),
          };
          if (isChanged) changedKeys.push(key);
        }
        set({
          values,
          lastReceivedTime: now,
          ...(changedKeys.length > 0
            ? { lastDeltaKeys: changedKeys, lastDeltaTime: now }
            : {}),
        });
        break;
      }

      case 'delta': {
        const prev = get().values;
        const updatedValues = { ...prev };
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
        set({
          values: updatedValues,
          lastDeltaKeys: changedKeys,
          lastDeltaTime: now,
          lastReceivedTime: now,
        });
        break;
      }

      case 'status':
        set({
          gameActive: msg.gameActive,
          mainram: msg.mainram || get().mainram,
          lastReceivedTime: now,
        });
        break;

      case 'error':
        set({
          lastError: `[${msg.code}] ${msg.msg}`,
          lastReceivedTime: now,
        });
        break;

      case 'pong':
        set({ lastReceivedTime: now });
        break;
    }
  },

  reset: () => set(initialState),
}));

// ========================================
// セレクターフック
// ========================================

/** 特定キーの GameValue をリアルタイム取得 */
export function useGameValue(key: string): GameValue | undefined {
  return useGameStore((s) => s.values[key]);
}

/** 特定キーの数値をリアルタイム取得 (undefinedなら0) */
export function useGameNumber(key: string): number {
  return useGameStore((s) => {
    const v = s.values[key];
    return v ? hexToNumber(v.value) : 0;
  });
}

/** 特定キーの16進文字列をリアルタイム取得 */
export function useGameHex(key: string): string {
  return useGameStore((s) => s.values[key]?.value ?? '');
}

/** 特定キーが最後の差分に含まれているか */
export function useIsChanged(key: string): boolean {
  return useGameStore((s) => s.lastDeltaKeys.includes(key));
}

/** Pipe接続状態 */
export function usePipeStatus(): boolean {
  return useGameStore((s) => s.pipeConnected);
}

/** ゲーム検出状態 */
export function useGameActive(): boolean {
  return useGameStore((s) => s.gameActive);
}

// ========================================
// レゾン派生セレクター
// ========================================

interface RezonEntry {
  attackStar: Record<string, number>;
  finalizeTurn: number;
  accessLv: number;
}

const REZON_KEYS = [
  'MY_REZON', 'REZON_L0', 'REZON_L1', 'REZON_L2',
  'REZON_R0', 'REZON_R1', 'REZON_R2',
] as const;

const rezonMap = rezonMapping as Record<string, RezonEntry>;

/** 各レゾンのエントリを取得するヘルパー */
function getActiveRezonEntries(values: Record<string, GameValue>): RezonEntry[] {
  const entries: RezonEntry[] = [];
  for (const key of REZON_KEYS) {
    const hex = values[key]?.value;
    if (!hex) continue;
    const entry = rezonMap[hex];
    if (entry) entries.push(entry);
  }
  return entries;
}

/** 全レゾンの attackStar 属性別合計 */
export function useRezonAttackStarSum(): Record<string, number> {
  return useGameStore(
    useShallow((s) => {
      const result: Record<string, number> = {};
      for (const entry of getActiveRezonEntries(s.values)) {
        for (const [attr, count] of Object.entries(entry.attackStar)) {
          result[attr] = (result[attr] ?? 0) + count;
        }
      }
      return result;
    }),
  );
}

/** 全レゾンの finalizeTurn 合計 */
export function useRezonFinalizeTurnSum(): number {
  return useGameStore((s) => {
    let sum = 0;
    for (const entry of getActiveRezonEntries(s.values)) {
      sum += entry.finalizeTurn;
    }
    return sum;
  });
}

/** 全レゾンの accessLv 合計 */
export function useRezonAccessLvSum(): number {
  return useGameStore((s) => {
    let sum = 0;
    for (const entry of getActiveRezonEntries(s.values)) {
      sum += entry.accessLv;
    }
    return sum;
  });
}

// ========================================
// IPC購読 (Electron gameAPI → Zustand)
// ========================================

let unsubscribers: (() => void)[] = [];

/**
 * window.gameAPI のイベントを Zustand ストアに接続する。
 * MonitorPage マウント時に呼び出し、アンマウント時に返却関数で解除する。
 */
export function subscribeGameAPI(gameVersion: string): () => void {
  unsubscribeGameAPI(); // 二重購読防止

  const api = window.gameAPI;
  if (!api) return () => {};

  const { setPipeConnected, handleMessage } = useGameStore.getState();

  const removeMessage = api.onMessage((msg: GameMessage) => {
    handleMessage(msg);
  });
  unsubscribers.push(removeMessage);

  const removePipeStatus = api.onPipeStatus((connected: boolean) => {
    setPipeConnected(connected);
  });
  unsubscribers.push(removePipeStatus);

  // バージョン通知 → フルステート要求
  api.setVersion(gameVersion);
  api.getPipeStatus().then((connected) => {
    setPipeConnected(connected);
    if (connected) api.requestRefresh();
  });

  return unsubscribeGameAPI;
}

function unsubscribeGameAPI() {
  for (const unsub of unsubscribers) unsub();
  unsubscribers = [];
}
