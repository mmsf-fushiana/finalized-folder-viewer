/**
 * ノイズレベル関連のユーティリティ
 * ノイズ率とレベルの対応を管理
 */

export interface NoiseLevelRange {
  level: number;
  min: number;
  max: number;
}

// ノイズ率とレベルの対応テーブル
export const NOISE_LEVELS: NoiseLevelRange[] = [
  { level: 1, min: 200, max: 249 },
  { level: 2, min: 250, max: 299 },
  { level: 3, min: 300, max: 349 },
  { level: 4, min: 350, max: 399 },
  { level: 5, min: 400, max: 499 },
  { level: 6, min: 500, max: 599 },
  { level: 7, min: 600, max: 699 },
  { level: 8, min: 700, max: 799 },
  { level: 9, min: 800, max: 899 },
  { level: 10, min: 900, max: 998 },
  { level: 11, min: 999, max: 999 },
  { level: 12, min: 1000, max: Infinity }, // レベルオーバー（アイテムによる加算が必要）
];

/**
 * ノイズ率からレベルを計算
 * @param noiseRate ノイズ率 (200-999)
 * @param plus レベル強化アイテムによる加算値 (オプション)
 * @returns レベル (1-12)
 */
export function getNoiseLevel(noiseRate: number, plus?: number): number {
  // ノイズ率に基づいて基本レベルを取得
  const baseLevel = NOISE_LEVELS.find(
    (level) => noiseRate >= level.min && noiseRate <= level.max
  )?.level ?? 1;

  // plusがある場合は加算して最終レベルを計算（最大12）
  const finalLevel = plus ? Math.min(baseLevel + plus, 12) : baseLevel;

  return finalLevel;
}

/**
 * レベルからノイズ率の範囲を取得
 * @param level レベル (1-12)
 * @returns ノイズ率の範囲 or 'Over'（Lv.12の場合）
 */
export function getNoiseRangeForLevel(
  level: number
): { min: number; max: number } | 'Over' {
  // Lv.12は特別扱い（レベルオーバー）
  if (level === 12) {
    return 'Over';
  }

  // 該当するレベルの範囲を取得
  const range = NOISE_LEVELS.find((item) => item.level === level);

  if (!range) {
    // デフォルトはLv.1の範囲を返す
    return { min: NOISE_LEVELS[0].min, max: NOISE_LEVELS[0].max };
  }

  return { min: range.min, max: range.max };
}
