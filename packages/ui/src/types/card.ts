export interface Card {
  id: string;
  class: string;
  name: string;
  name_en: string;
  types: string[];
  attack: number;
  attack2?: number;
  attack3?: number;
  text: string;
  image_url: string;
}

export interface GalaxyAdvance extends Card {
  source_cards: string[];
  'attack_ga+': number;
}

export interface FinalizationSet {
  LV1: Card[];
  LV2: Card[];
  LV3: Card[];
  LV4: Card[];
  LV5: Card[];
  LV6: Card[];
  LV7: Card[];
  LV8: Card[];
  LV9: Card[];
  LV10: Card[];
  LV11: Card[];
  LV12: Card[];
}

export interface FinalizationData {
  BA: FinalizationSet;
  RJ: FinalizationSet;
}

export type Version = 'BA' | 'RJ';
export type Level = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

const base = import.meta.env.BASE_URL ?? '/';

export const TYPE_IMAGES: Record<string, string> = {
  '無': `${base}type_images/Null.png`,
  '電気': `${base}type_images/Elec.png`,
  '風': `${base}type_images/Wind.png`,
  '木': `${base}type_images/Wood.png`,
  '水': `${base}type_images/Aqua.png`,
  '火': `${base}type_images/Heat.png`,
  'ソード': `${base}type_images/Sword.png`,
  'ブレイク': `${base}type_images/Break.png`,
};

export const TYPE_COLORS: Record<string, string> = {
  '無': '#808080',
  '電気': '#FFD700',
  '火': '#FF4500',
  '水': '#1E90FF',
  '木': '#228B22',
  '風': '#87CEEB',
  'ソード': '#C0C0C0',
  'ブレイク': '#8B4513',
};

export const VERSION_COLORS: Record<Version, string> = {
  BA: 'rgb(49, 74, 90)',
  RJ: 'rgb(181, 33, 57)',
};

export const VERSION_COLORS_BORDER: Record<Version, string> = {
  BA: 'rgba(49, 74, 90, 0.3)',
  RJ: 'rgba(181, 33, 57, 0.3)',
};
