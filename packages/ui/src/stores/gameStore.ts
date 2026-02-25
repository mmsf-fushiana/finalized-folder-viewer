// gameStore.ts : DLLからのゲームデータ状態管理
// Zustand によるグローバルステート + セレクターフック

import { useMemo } from 'react';
import { create } from 'zustand';
// import { useShallow } from 'zustand/react/shallow';
// import { useStoreWithEqualityFn } from 'zustand/traditional';
import rezonMapping from '@data/rezon_mapping.json';
import cardListJson from '@data/card_list.json';
import abilityMapping from '@data/ability_mapping.json';
import noiseCardMapping from '@data/noise_card.json';
import rockEquipmentMapping from '@data/rock_equipment.json';
import wcMapping from '@data/wc_mapping.json';
import noiseMapping from '@data/noise.json';
import { getNoiseLevel } from '../utils/noiseLevel';
import type { Card, Level } from '../types';

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
  // フォルダレベルロック（内部ステート）
  _capturedNoiseRate: number | null; // フラグA: COMFIRM一致時にキャプチャしたNOISE_RATE (非null=フラグA ON)
  _folderFinalized: boolean;         // ロックフラグ: ノイズ→0遷移でON、COMFIRM両方0でのみOFF
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
  _capturedNoiseRate: null,
  _folderFinalized: false,
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

    // フォルダレベルロック遷移検出
    // prevValues: 更新前の values, newValues: 更新後の values
    const checkFolderLock = (
      prevValues: Record<string, GameValue>,
      newValues: Record<string, GameValue>,
    ) => {
      const state = get();
      const hexVal = (vals: Record<string, GameValue>, key: string) => {
        const h = vals[key]?.value;
        return h ? hexToNumber(h) : 0;
      };

      const newConfirm1 = hexVal(newValues, 'COMFIRM_LV_1');
      const newConfirm2 = hexVal(newValues, 'COMFIRM_LV_2');
      const prevNoise = hexVal(prevValues, 'NOISE_RATE_1');
      const newNoise = hexVal(newValues, 'NOISE_RATE_1');

      // リセット: COMFIRM 両方 0 → フラグOFF
      if (newConfirm1 === 0 && newConfirm2 === 0) {
        if (state._folderFinalized || state._capturedNoiseRate !== null) {
          set({ _folderFinalized: false, _capturedNoiseRate: null });
        }
        return;
      }

      // キャプチャ (フラグA ON): COMFIRM_LV_1 === COMFIRM_LV_2 (1-12範囲) → NOISE_RATE_1 を保持
      if (newConfirm1 === newConfirm2 && newConfirm1 >= 1 && newConfirm1 <= 12) {
        const captured = newNoise > 0
          ? Math.trunc(newNoise / 10)
          : null;
        if (captured !== null && captured !== state._capturedNoiseRate) {
          set({ _capturedNoiseRate: captured });
        }
      }

      const capturedNoise = get()._capturedNoiseRate;

      // ロックフラグON: フラグA中にNOISE_RATE_1が0に遷移 & 変化前がキャプチャ値と一致
      if (capturedNoise !== null && newNoise === 0 && prevNoise !== 0) {
        const prevRate = Math.trunc(prevNoise / 10);
        if (prevRate === capturedNoise && !get()._folderFinalized) {
          set({ _folderFinalized: true });
        }
      }

      // フラグA OFF: NOISE_RATE_1が0以外かつキャプチャ値と異なる
      if (capturedNoise !== null && newNoise !== 0) {
        if (Math.trunc(newNoise / 10) !== capturedNoise) {
          set({ _capturedNoiseRate: null });
        }
      }
    };

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
        checkFolderLock(prev, values);
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
        checkFolderLock(prev, updatedValues);
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

export interface RezonEntry {
  name: string;
  chargeShot: string | null;
  finalizeTurn: number;
  attackStar: Record<string, number>;
  FField: string | null;
  accessLv: number;
  FBarrier: string | null;
}

// /** 適用済みレゾン効果（加算 + 上書きマージ後） */
// export interface MergedRezonEffect {
//   // 上書き系（優先順位: MY_REZON が最強）
//   name: string | null;
//   chargeShot: string | null;
//   FField: string | null;
//   FBarrier: string | null;
//   // 加算系
//   attackStar: Record<string, number>;
//   finalizeTurn: number;
//   accessLv: number;
// }

// 優先順位順（低→高、後ろほど強い）
const REZON_PRIORITY_KEYS = [
  'REZON_L0', 'REZON_L1', 'REZON_L2',
  'REZON_R0', 'REZON_R1', 'REZON_R2',
  'MY_REZON',
] as const;

// 既存の全キー取得用（順序不問）
const REZON_KEYS = REZON_PRIORITY_KEYS;

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
  const hexKey = useGameStore((s) =>
    REZON_PRIORITY_KEYS.map(k => s.values[k]?.value ?? '').join(','),
  );
  return useMemo(() => {
    const result: Record<string, number> = {};
    for (const hex of hexKey.split(',')) {
      if (!hex) continue;
      const entry = rezonMap[hex];
      if (!entry) continue;
      for (const [attr, count] of Object.entries(entry.attackStar)) {
        result[attr] = (result[attr] ?? 0) + count;
      }
    }
    return result;
  }, [hexKey]);
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

// /**
//  * 適用済みレゾン効果を取得（加算 + 優先順位上書きマージ）
//  *
//  * 加算系: accessLv, finalizeTurn, attackStar → 全レゾンの合計
//  * 上書き系: name, chargeShot, FField, FBarrier → 優先順位順で非nullが上書き
//  *   優先順位（低→高）: REZON_L0 → L1 → L2 → R0 → R1 → R2 → MY_REZON
//  */
// function mergedRezonEqual(a: MergedRezonEffect, b: MergedRezonEffect): boolean {
//   return a.name === b.name
//     && a.chargeShot === b.chargeShot
//     && a.FField === b.FField
//     && a.FBarrier === b.FBarrier
//     && a.finalizeTurn === b.finalizeTurn
//     && a.accessLv === b.accessLv
//     && JSON.stringify(a.attackStar) === JSON.stringify(b.attackStar);
// }
//
// export function useMergedRezonEffect(): MergedRezonEffect {
//   return useStoreWithEqualityFn(useGameStore, (s) => {
//     const merged: MergedRezonEffect = {
//       name: null,
//       chargeShot: null,
//       FField: null,
//       FBarrier: null,
//       attackStar: {},
//       finalizeTurn: 0,
//       accessLv: 0,
//     };
//
//     // REZON_PRIORITY_KEYS 順（低→高）でイテレート
//     for (const entry of getActiveRezonEntries(s.values)) {
//       // 加算系
//       merged.accessLv += entry.accessLv;
//       merged.finalizeTurn += entry.finalizeTurn;
//       for (const [attr, count] of Object.entries(entry.attackStar)) {
//         merged.attackStar[attr] = (merged.attackStar[attr] ?? 0) + count;
//       }
//       // 上書き系（非null なら後勝ち）
//       if (entry.name != null) merged.name = entry.name;
//       if (entry.chargeShot != null) merged.chargeShot = entry.chargeShot;
//       if (entry.FField != null) merged.FField = entry.FField;
//       if (entry.FBarrier != null) merged.FBarrier = entry.FBarrier;
//     }
//
//     return merged;
//   }, mergedRezonEqual);
// }


// ========================================
// デッキカード派生セレクター
// ========================================

const CARD_KEYS = Array.from({ length: 30 }, (_, i) =>
  `CARD${String(i + 1).padStart(2, '0')}`,
);

// card_list.json の ID(4桁hex) → Card マップ
const typedCardList = cardListJson as Card[];
const cardById = new Map<string, Card>();
const cardDefinitionOrder = new Map<string, number>();
for (let i = 0; i < typedCardList.length; i++) {
  const card = typedCardList[i];
  if (!card.id) continue;
  if (!cardById.has(card.id.toUpperCase())) cardById.set(card.id.toUpperCase(), card);
  if (!cardDefinitionOrder.has(card.name)) cardDefinitionOrder.set(card.name, i);
}

/** テーブル表示用: カード画像・名称・枚数 */
export interface DeckCardRow {
  card: Card;
  count: number;
}

/** CARD01-CARD30 の30枚カードオブジェクト配列を返す */
export function useDeckCards(): Card[] {
  const hexKey = useGameStore((s) =>
    CARD_KEYS.map(k => s.values[k]?.value ?? '').join(','),
  );
  return useMemo(() => {
    const result: Card[] = [];
    for (const hex of hexKey.split(',')) {
      if (!hex) continue;
      const card = cardById.get(hex.toUpperCase());
      if (card) result.push(card);
    }
    return result;
  }, [hexKey]);
}

/**
 * CARD01-CARD30 を card_list.json 定義順にソートし、
 * 同名カードをグルーピングして { card, count } の配列を返す
 * テーブル表示（カード画像 / カード名称 / 枚数）用
 */
export function useDeckCardSummary(): DeckCardRow[] {
  const hexKey = useGameStore((s) =>
    CARD_KEYS.map(k => s.values[k]?.value ?? '').join(','),
  );
  return useMemo(() => {
    const cards: Card[] = [];
    for (const hex of hexKey.split(',')) {
      if (!hex) continue;
      const card = cardById.get(hex.toUpperCase());
      if (card) cards.push(card);
    }

    const countMap = new Map<string, { card: Card; count: number }>();
    for (const card of cards) {
      const existing = countMap.get(card.name);
      if (existing) existing.count++;
      else countMap.set(card.name, { card, count: 1 });
    }

    const rows = [...countMap.values()];
    rows.sort((a, b) =>
      (cardDefinitionOrder.get(a.card.name) ?? Infinity)
      - (cardDefinitionOrder.get(b.card.name) ?? Infinity),
    );
    return rows;
  }, [hexKey]);
}

// ========================================
// アビリティ派生セレクター
// ========================================

interface AbilityEntry {
  name: string;
  capacity: number;
}

const ABILITY_KEYS = Array.from({ length: 20 }, (_, i) =>
  `ABILITY${String(i + 1).padStart(2, '0')}`,
);

const abilityMap = abilityMapping as Record<string, AbilityEntry>;

/** アビリティ情報（アドレス順、設定済みのみ） */
export interface ActiveAbility {
  name: string;
  capacity: number;
}

/** ABILITY01-ABILITY20 のうち設定済みアビリティをアドレス順で返す */
export function useActiveAbilities(): ActiveAbility[] {
  const hexKey = useGameStore((s) =>
    ABILITY_KEYS.map(k => s.values[k]?.value ?? '').join(','),
  );
  return useMemo(() => {
    const result: ActiveAbility[] = [];
    for (const hex of hexKey.split(',')) {
      if (!hex || hex === '0000') continue;
      const entry = abilityMap[hex.toUpperCase()];
      if (entry) {
        result.push({ name: entry.name, capacity: entry.capacity });
      }
    }
    return result;
  }, [hexKey]);
}

// ========================================
// ノイズドカード派生セレクター
// ========================================

export interface NoiseCardEntry {
  suit: string;
  number: number | null;
  name: string;
  effect: string;
  effectDetail: {
    hp_plus: number;
    type_plus: Record<string, number>;
    ga_plus: Record<string, number>;
    mega_num_plus?: number;
    giga_num_plus?: number;
    [key: string]: unknown;
  };
}

const NOISED_CARD_KEYS = [
  'NOISED_CARD_1', 'NOISED_CARD_2', 'NOISED_CARD_3',
  'NOISED_CARD_4', 'NOISED_CARD_5',
] as const;

const noiseCardMap = noiseCardMapping as Record<string, NoiseCardEntry>;

/** 効果詳細の総和オブジェクト */
export interface AggregatedEffectDetail {
  hp_plus: number;
  type_plus: Record<string, number>;
  ga_plus: Record<string, number>;
  mega_num_plus: number;
  giga_num_plus: number;
  statusGuard?: boolean;
  autoLockOn?: boolean;
  airShoes?: boolean;
  superArmor?: boolean;
  floatShoes?: boolean;
  kawarimi?: boolean;
}

/** トランプ手役 */
export interface PokerHand {
  name: string;
  effects: string[];
}

type Suit = string;

/** 手役判定 */
function detectPokerHand(cards: NoiseCardEntry[]): PokerHand | null {
  // ジョーカーは手役判定から除外（numberがnull）
  const numbered = cards.filter((c) => c.number !== null);
  if (cards.length < 5) return null;

  const suits = cards.map((c) => c.suit);
  const numbers = numbered.map((c) => c.number as number);

  // スート判定
  const allSameSuit = suits.every((s) => s === suits[0]) && suits[0] !== 'joker';
  const suitName = suits[0] as Suit;

  // 数字の出現回数
  const numCounts = new Map<number, number>();
  for (const n of numbers) {
    numCounts.set(n, (numCounts.get(n) ?? 0) + 1);
  }
  const counts = [...numCounts.values()].sort((a, b) => b - a);

  // ストレート判定（5枚全てに番号あり + 連番）
  let isStraight = false;
  let isRoyal = false;
  if (numbered.length === 5) {
    const sorted = [...numbers].sort((a, b) => a - b);
    isStraight = sorted.every((v, i) => i === 0 || v === sorted[i - 1] + 1);
    // ロイヤル: 1(A), 10, 11(J), 12(Q), 13(K)
    isRoyal = [1, 10, 11, 12, 13].every((n) => numbers.includes(n));
  }

  // ロイヤルストレートフラッシュ
  if (allSameSuit && isRoyal) {
    return { name: 'royalStraightFlush', effects: ['autoLockOn'] };
  }
  // ストレートフラッシュ
  if (allSameSuit && isStraight) {
    return { name: 'straightFlush', effects: ['giga+1', 'mega+1'] };
  }
  // フラッシュ（スート別）
  if (allSameSuit) {
    switch (suitName) {
      case 'diamond': return { name: 'diamondFlush', effects: ['airShoes'] };
      case 'heart':   return { name: 'heartFlush', effects: ['superArmor'] };
      case 'spade':   return { name: 'spadeFlush', effects: ['floatShoes'] };
      case 'club':    return { name: 'clubFlush', effects: ['kawarimi', 'hp+200'] };
    }
  }
  // ストレート
  if (isStraight) {
    return { name: 'straight', effects: ['hp+300'] };
  }
  // 5カード
  if (counts[0] === 5) {
    return { name: 'fiveOfAKind', effects: ['statusGuard'] };
  }
  // 4カード
  if (counts[0] === 4) {
    return { name: 'fourOfAKind', effects: ['mega+2'] };
  }
  // フルハウス (3+2)
  if (counts[0] === 3 && counts[1] === 2) {
    return { name: 'fullHouse', effects: ['hp+500'] };
  }
  // 3カード
  if (counts[0] === 3) {
    return { name: 'threeOfAKind', effects: ['noBug'] };
  }
  // 2ペア
  if (counts[0] === 2 && counts[1] === 2) {
    return { name: 'twoPair', effects: ['noBug'] };
  }

  return null;
}

/** 手役効果を AggregatedEffectDetail に適用 */
function applyHandEffects(detail: AggregatedEffectDetail, hand: PokerHand): void {
  for (const effect of hand.effects) {
    switch (effect) {
      case 'hp+200': detail.hp_plus += 200; break;
      case 'hp+300': detail.hp_plus += 300; break;
      case 'hp+500': detail.hp_plus += 500; break;
      case 'mega+1': detail.mega_num_plus += 1; break;
      case 'mega+2': detail.mega_num_plus += 2; break;
      case 'giga+1': detail.giga_num_plus += 1; break;
      case 'statusGuard': detail.statusGuard = true; break;
      case 'autoLockOn':  detail.autoLockOn = true; break;
      case 'airShoes':    detail.airShoes = true; break;
      case 'superArmor':  detail.superArmor = true; break;
      case 'floatShoes':  detail.floatShoes = true; break;
      case 'kawarimi':    detail.kawarimi = true; break;
      // noBug → effectDetail には反映しない
    }
  }
}

export interface NoiseCardResult {
  /** 設定済みノイズドカード（アドレス順） */
  cards: NoiseCardEntry[];
  /** 5枚の effectDetail を総和したオブジェクト（手役効果適用済み） */
  effectDetail: AggregatedEffectDetail;
  /** トランプの手役（該当なしは null） */
  hand: PokerHand | null;
}

/** ノイズドカード5枚のカード・効果詳細総和・手役を返す */
export function useNoiseCards(): NoiseCardResult {
  const hexKey = useGameStore((s) =>
    NOISED_CARD_KEYS.map(k => s.values[k]?.value ?? '').join(','),
  );
  return useMemo(() => {
    const cards: NoiseCardEntry[] = [];
    for (const hex of hexKey.split(',')) {
      if (!hex) continue;
      const entry = noiseCardMap[hex];
      if (entry) cards.push(entry);
    }

    const detail: AggregatedEffectDetail = {
      hp_plus: 0,
      type_plus: { fire: 0, aqua: 0, elec: 0, wood: 0, sword: 0, break: 0 },
      ga_plus: { null: 0, fire: 0, aqua: 0, elec: 0, wood: 0, sword: 0, break: 0 },
      mega_num_plus: 0,
      giga_num_plus: 0,
    };
    for (const card of cards) {
      const ed = card.effectDetail;
      detail.hp_plus += ed.hp_plus;
      detail.mega_num_plus += ed.mega_num_plus ?? 0;
      detail.giga_num_plus += ed.giga_num_plus ?? 0;
      for (const [k, v] of Object.entries(ed.type_plus)) {
        detail.type_plus[k] = (detail.type_plus[k] ?? 0) + v;
      }
      for (const [k, v] of Object.entries(ed.ga_plus)) {
        detail.ga_plus[k] = (detail.ga_plus[k] ?? 0) + v;
      }
    }

    const hand = detectPokerHand(cards);
    if (hand) applyHandEffects(detail, hand);

    return { cards, effectDetail: detail, hand };
  }, [hexKey]);
}

// ========================================
// サポートユーズ派生セレクター
// ========================================

const SUPPORT_ABILITY_HEX = new Set(['3832', '3836', '382B']);

/** サポートユーズ名称を返す（アビリティ→ノイズドカードsupportで上書き） */
export function useSupportUse(): string | null {
  return useGameStore((s) => {
    let name: string | null = null;

    // アビリティ内の値が 3832/3836/382B → 最後の要素の名称
    for (const key of ABILITY_KEYS) {
      const hex = s.values[key]?.value;
      if (!hex) continue;
      if (SUPPORT_ABILITY_HEX.has(hex)) {
        const entry = abilityMap[hex];
        if (entry) name = entry.name;
      }
    }

    // ノイズドカード内の最後の support があれば上書き
    for (const key of NOISED_CARD_KEYS) {
      const hex = s.values[key]?.value;
      if (!hex || hex === '0000') continue;
      const card = noiseCardMap[hex];
      if (card?.effectDetail?.support) {
        name = card.effectDetail.support as string;
      }
    }

    return name;
  });
}

// ========================================
// ウォーロックウェポン派生セレクター
// ========================================

interface RockEquipmentEntry {
  name: string;
  attack: number;
  rapid: number;
  charge: number;
  effect: string;
}

const rockEquipmentMap = rockEquipmentMapping as Record<string, RockEquipmentEntry>;

export interface WarlockWeapon {
  name: string;
  attack: number;
  rapid: number;
  charge: number;
  effect: string;
}

/** WARLOCK アドレスの値から装備中のウォーロックウェポンを返す（未装備は null） */
export function useWarlockWeapon(): WarlockWeapon | null {
  return useGameStore((s) => {
    const hex = s.values['WARLOCK']?.value;
    if (!hex || hex === '00000000') return null;
    return rockEquipmentMap[hex] ?? null;
  });
}

// ========================================
// ホワイトカード派生セレクター
// ========================================

const wcMap = wcMapping as Record<string, string[]>;

const cardByName = new Map<string, Card>(
  (cardListJson as Card[]).map((card) => [card.name, card]),
);

/** hex文字列からホワイトカード4枚の Card オブジェクトを返す（未照合は null） */
export function getWhiteCards(hex: string): (Card | null)[] {
  const names = wcMap[hex];
  if (!names) return [null, null, null, null];
  return names.map((name) => cardByName.get(name) ?? null);
}

// ========================================
// ノイズ（変身）派生セレクター
// ========================================

const noiseMap = noiseMapping as Record<string, { name: string }>;

export interface NoiseForm {
  name: string;
}

/** hex文字列からノイズ（変身）情報を返す（該当なしは null） */
export function getNoise(hex: string): NoiseForm | null {
  const entry = noiseMap[hex];
  if (!entry) return null;
  return { name: entry.name };
}

/** hex文字列からレゾンエントリを返す（該当なしは null） */
export function getRezonEntry(hex: string): RezonEntry | null {
  return rezonMap[hex] ?? null;
}

// ========================================
// ブラザー情報派生セレクター
// ========================================

type BrotherSlot = 1 | 2 | 3 | 4 | 5 | 6;

const BROTHER_KEYS: Record<BrotherSlot, {
  noise: string; wc: string; rezon: string; mega: string; giga: string;
}> = {
  1: { noise: 'BRO1_NOISE', wc: 'BRO1_WC', rezon: 'REZON_L0', mega: 'BRO1_MEGA', giga: 'BRO1_GIGA' },
  2: { noise: 'BRO2_NOISE', wc: 'BRO2_WC', rezon: 'REZON_L1', mega: 'BRO2_MEGA', giga: 'BRO2_GIGA' },
  3: { noise: 'BRO3_NOISE', wc: 'BRO3_WC', rezon: 'REZON_L2', mega: 'BRO3_MEGA', giga: 'BRO3_GIGA' },
  4: { noise: 'BRO4_NOISE', wc: 'BRO4_WC', rezon: 'REZON_R0', mega: 'BRO4_MEGA', giga: 'BRO4_GIGA' },
  5: { noise: 'BRO5_NOISE', wc: 'BRO5_WC', rezon: 'REZON_R1', mega: 'BRO5_MEGA', giga: 'BRO5_GIGA' },
  6: { noise: 'BRO6_NOISE', wc: 'BRO6_WC', rezon: 'REZON_R2', mega: 'BRO6_MEGA', giga: 'BRO6_GIGA' },
};

export interface BrotherInfo {
  noise: NoiseForm | null;
  cards: (Card | null)[];
  rezon: RezonEntry | null;
}

/** スロット番号(1-6)のブラザー情報を返す */
export function useBrotherInfo(slot: BrotherSlot): BrotherInfo {
  const keys = BROTHER_KEYS[slot];
  const hexKey = useGameStore((s) =>
    `${s.values[keys.noise]?.value ?? ''}|${s.values[keys.wc]?.value ?? ''}|${s.values[keys.rezon]?.value ?? ''}|${s.values[keys.mega]?.value ?? ''}|${s.values[keys.giga]?.value ?? ''}`,
  );
  return useMemo(() => {
    const [noiseHex, wcHex, rezonHex, megaHex, gigaHex] = hexKey.split('|');

    const noise = noiseHex ? getNoise(noiseHex) : null;
    const wcCards = wcHex ? getWhiteCards(wcHex.padStart(8, '0')) : [null, null, null, null];
    const megaCard = megaHex ? (cardById.get(megaHex.padStart(4, '0').toUpperCase()) ?? null) : null;
    const gigaCard = gigaHex ? (cardById.get(gigaHex.padStart(4, '0').toUpperCase()) ?? null) : null;
    const cards = [...wcCards, megaCard, gigaCard];
    const rezon = rezonHex ? (rezonMap[rezonHex] ?? null) : null;

    return { noise, cards, rezon };
  }, [hexKey]);
}

/** NOISE_RATE_1/2 が一致かつ 0-9999 なら末尾1桁を落とした値を返す */
export function useConfirmedNoiseRate(): number | null {
  return useGameStore((s) => {
    const hex1 = s.values['NOISE_RATE_1']?.value;
    const hex2 = s.values['NOISE_RATE_2']?.value;
    if (!hex1 || !hex2 || hex1 !== hex2) return null;
    const num = hexToNumber(hex1);
    if (num < 0 || num > 9999) return null;
    return Math.trunc(num / 10);
  });
}

/**
 * フォルダレベルロック: 確定フォルダ突入中のレベルを返す
 * _folderFinalized が true の間、capturedNoiseRate + accessLvSum からレベルを算出
 * ロック中でなければ null
 */
export function useLockedFolderLevel(): Level | null {
  return useGameStore((s) => {
    if (!s._folderFinalized || s._capturedNoiseRate === null) return null;

    let accessLvSum = 0;
    for (const entry of getActiveRezonEntries(s.values)) {
      accessLvSum += entry.accessLv;
    }

    const level = getNoiseLevel(s._capturedNoiseRate, accessLvSum);
    return level as Level;
  });
}

// ========================================
// HP算出セレクター (未使用 - BuildTabではuseMemoで派生)
// ========================================

// const HP_ABILITY_RE = /^ability\.name\.hp(\d+)$/;
//
// export interface HpBreakdown {
//   baseHp: number;
//   abilityHp: number;
//   noiseCardHp: number;
//   totalHp: number;
// }
//
// function hpBreakdownEqual(a: HpBreakdown, b: HpBreakdown): boolean {
//   return a.baseHp === b.baseHp
//     && a.abilityHp === b.abilityHp
//     && a.noiseCardHp === b.noiseCardHp
//     && a.totalHp === b.totalHp;
// }
//
// /** BASE_HP + アビリティHP + ノイズドカードHP(手役効果込み)の内訳を返す */
// export function useHpBreakdown(): HpBreakdown {
//   return useStoreWithEqualityFn(useGameStore, (s) => {
//     // BASE_HP
//     const baseHp = s.values['BASE_HP']?.value
//       ? hexToNumber(s.values['BASE_HP'].value)
//       : 0;
//
//     // アビリティのHP合計
//     let abilityHp = 0;
//     for (const key of ABILITY_KEYS) {
//       const hex = s.values[key]?.value;
//       if (!hex || hex === '0000') continue;
//       const padded = hex.toUpperCase();
//       const entry = abilityMap[padded];
//       if (entry) {
//         const m = HP_ABILITY_RE.exec(entry.name);
//         if (m) abilityHp += parseInt(m[1], 10);
//       }
//     }
//
//     // ノイズドカードのHP+合計（手役効果込み）
//     const cards: NoiseCardEntry[] = [];
//     for (const key of NOISED_CARD_KEYS) {
//       const hex = s.values[key]?.value;
//       if (!hex || hex === '0000') continue;
//       const entry = noiseCardMap[hex];
//       if (entry) cards.push(entry);
//     }
//     let noiseCardHp = 0;
//     for (const card of cards) {
//       noiseCardHp += card.effectDetail.hp_plus;
//     }
//     const hand = detectPokerHand(cards);
//     if (hand) {
//       for (const eff of hand.effects) {
//         if (eff === 'hp+200') noiseCardHp += 200;
//         else if (eff === 'hp+300') noiseCardHp += 300;
//         else if (eff === 'hp+500') noiseCardHp += 500;
//       }
//     }
//
//     return {
//       baseHp,
//       abilityHp,
//       noiseCardHp,
//       totalHp: baseHp + abilityHp + noiseCardHp,
//     };
//   }, hpBreakdownEqual);
// }

// ========================================
// タッグ指定カード派生セレクター (未使用)
// ========================================

export interface TagIndices {
  tag1: number; // TAG1の0-basedインデックス (CARD01=0, ..., CARD30=29)
  tag2: number; // TAG2の0-basedインデックス
}

// /**
//  * タッグ指定カードのインデックスを返す（ジェミニモード以外は null）
//  *
//  * TAG1_2 の2バイト値: 上位バイト=TAG2, 下位バイト=TAG1 (0-based)
//  * NOISE=="04" のときジェミニ（タッグモード）、それ以外は null (スプシの "0000FFFF" 相当)
//  */
export function useTagIndices(): TagIndices | null {
  const noiseGv = useGameValue('NOISE');
  const tagGv = useGameValue('TAG1_2');

  console.log('useTagIndices', { noise: noiseGv?.value, tag: tagGv?.value });

  return useMemo(() => {
    const noiseHex = noiseGv?.value ?? '';
    const tagHex = tagGv?.value ?? '';

    if (noiseHex !== '04') return null;
    if (!tagHex || tagHex.length < 4 || tagHex.toUpperCase() === 'FFFF') return null;

    const tag1 = parseInt(tagHex.slice(2, 4), 16); // 下位バイト
    const tag2 = parseInt(tagHex.slice(0, 2), 16); // 上位バイト

    return { tag1, tag2 };
  }, [noiseGv, tagGv]);
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
