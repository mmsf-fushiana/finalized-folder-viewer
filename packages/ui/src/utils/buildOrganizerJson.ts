/**
 * BuildTab のデータを MMSF Perfect Battle Organizer 互換 BuildRecord JSON に変換する
 *
 * Organizer: https://mmsf-perfect-battle-organizer.vercel.app/
 * マスタデータ: /organizer-master/*.json
 * 表記ゆれマッピング: /organizer-master/name-mapping.json
 */

import nameMapping from '@data/organizer-master/name-mapping.json';

// ──────────────────────────────────────────
// 型定義
// ──────────────────────────────────────────

type Version = 'BA' | 'RJ';

export interface OrganizerExportParams {
  version: Version;
  /** ノイズ日本語名 (t(noise.name))。ノイズなし時は空文字 */
  noiseName: string;
  /** ウォーロック装備日本語名 (t(warlock.name))。未装備時は空文字 */
  warlockWeaponName: string;
  /** デッキカード (card.name = アプリ側の日本語名) */
  deckCards: { name: string; count: number; isRegular: boolean }[];
  /** アビリティ (name = t(ab.name) の出力、capacity = 数値) */
  abilities: { name: string; capacity: number }[];
  /** ノイズドカード5枚の hex (ゲーム内4桁hex e.g. "0000") */
  noisedCardHexIds: string[];
  /** ホワイトカードセット hex (2桁 e.g. "3D") */
  whiteCardSetHex: string;
  /** ブラザー6枠 */
  brothers: {
    noiseName: string;
    rezonName: string;
    whiteCardSetHex: string;
    megaCardHex: string;
    gigaCardHex: string;
  }[];
  /** 自分のレゾン日本語名 (t("rezon.name." + key))。未設定時は空文字 */
  myRezonName: string;
}

// ──────────────────────────────────────────
// 名前変換ユーティリティ
// ──────────────────────────────────────────

const abilityNameMap = nameMapping.abilityName as Record<string, string>;
const abilityNameByVersion = nameMapping.abilityNameByVersion as Record<string, Record<string, string>>;
const warlockWeaponMap = nameMapping.warlockWeapon as Record<string, string>;
const rezonNameMap = nameMapping.rezonName as Record<string, string>;

/**
 * 半角英数字 → 全角変換 (カード名用)
 * 0-9 → ０-９, A-Z → Ａ-Ｚ
 */
function toFullWidth(str: string): string {
  return str.replace(/[0-9A-Z]/g, (ch) => {
    const code = ch.charCodeAt(0);
    // 0-9 (0x30-0x39) → ０-９ (0xFF10-0xFF19)
    if (code >= 0x30 && code <= 0x39) return String.fromCharCode(code - 0x30 + 0xFF10);
    // A-Z (0x41-0x5A) → Ａ-Ｚ (0xFF21-0xFF3A)
    return String.fromCharCode(code - 0x41 + 0xFF21);
  });
}

/** カード名変換: アプリ → Organizer */
function mapCardName(appName: string): string {
  return toFullWidth(appName);
}

/** アビリティ名変換: アプリの t() 出力 → Organizer name */
function mapAbilityName(appName: string, version: Version): string {
  // バージョン依存のマッピング (エース・ジョーカーPGM)
  if (appName in abilityNameByVersion) {
    return abilityNameByVersion[appName][version] ?? appName;
  }
  // 固定マッピング
  if (appName in abilityNameMap) {
    return abilityNameMap[appName];
  }
  return appName;
}

/** ウォーロック装備名変換 */
function mapWarlockWeapon(appName: string): string {
  return warlockWeaponMap[appName] ?? appName;
}

/** レゾン名変換: アプリの t() 出力 → Organizer ラベル */
function mapRezonName(appName: string): string {
  return rezonNameMap[appName] ?? appName;
}

/** ノイズドカード hex 変換: ゲーム内4桁 → Organizer 2桁 */
function mapNoisedCardHex(gameHex: string): string {
  const num = parseInt(gameHex, 16);
  return num.toString(16).padStart(2, '0');
}

// ──────────────────────────────────────────
// UUID 生成
// ──────────────────────────────────────────

function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ──────────────────────────────────────────
// ブラザールーレットスロット
// ──────────────────────────────────────────

const BROTHER_POSITIONS = [
  'top_left', 'top_right',
  'mid_left', 'mid_right',
  'btm_left', 'btm_right',
] as const;

function buildBrotherSlot(
  bro: OrganizerExportParams['brothers'][number],
  position: string,
) {
  return {
    id: uuid(),
    position,
    noiseId: bro.noiseName || '',
    rezonCardId: bro.rezonName ? mapRezonName(bro.rezonName) : '',
    whiteCardSetId: bro.whiteCardSetHex || '00',
    megaCardId: bro.megaCardHex || '',
    gigaCardId: bro.gigaCardHex || '',
  };
}

// ──────────────────────────────────────────
// メイン: BuildRecord JSON 生成
// ──────────────────────────────────────────

export function buildOrganizerJson(params: OrganizerExportParams): object {
  const {
    version, noiseName, warlockWeaponName,
    deckCards, abilities, noisedCardHexIds,
    whiteCardSetHex, brothers, myRezonName,
  } = params;

  // カード
  const cards = deckCards.map((c) => ({
    id: uuid(),
    name: mapCardName(c.name),
    quantity: c.count,
    isRegular: c.isRegular,
    notes: '',
    favoriteCount: 0,
  }));

  // アビリティ
  const abilityEntries = abilities.map((ab) => {
    const orgName = mapAbilityName(ab.name, version);
    return {
      id: uuid(),
      name: `${orgName}/${ab.capacity}`,
      quantity: 1,
      isRegular: false,
      notes: '',
      favoriteCount: 0,
    };
  });

  // ノイズドカード (hex ID 5枠)
  const noiseCardIds = noisedCardHexIds.map(mapNoisedCardHex);
  // 5枠に満たない場合は空文字で埋める
  while (noiseCardIds.length < 5) noiseCardIds.push('');

  // ブラザールーレットスロット
  const brotherRouletteSlots = BROTHER_POSITIONS.map((pos, i) =>
    buildBrotherSlot(brothers[i] ?? { noiseName: '', rezonName: '', whiteCardSetHex: '00', megaCardHex: '', gigaCardHex: '' }, pos),
  );

  // レゾンカード
  const rezonCards: string[] = [];
  if (myRezonName) {
    rezonCards.push(mapRezonName(myRezonName));
  }
  for (const bro of brothers) {
    if (bro.rezonName) {
      const mapped = mapRezonName(bro.rezonName);
      if (!rezonCards.includes(mapped)) {
        rezonCards.push(mapped);
      }
    }
  }

  return {
    id: uuid(),
    title: '',
    game: 'mmsf3',
    version: version === 'BA' ? 'black-ace' : 'red-joker',
    commonSections: {
      cards,
      abilities: abilityEntries,
    },
    gameSpecificSections: {
      mmsf1: {
        starForce: { leo: 0, pegasus: 0, dragon: 0 },
        brotherCards: [],
        favoriteCards: [],
      },
      mmsf2: {
        tribeOn: { thunder: '', fire: '', grass: '' },
        linkForce: [],
        abilityWave: [],
      },
      mmsf3: {
        noise: noiseName || 'ノーマルロックマン',
        warRockWeapon: warlockWeaponName ? mapWarlockWeapon(warlockWeaponName) : '',
        noiseCardIds,
        whiteCardSetId: whiteCardSetHex || '00',
        brotherRouletteSlots,
        rezonCards,
        pgms: [],
        sssLevels: [],
        nfb: [],
      },
    },
  };
}
