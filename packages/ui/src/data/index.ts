import type { FinalizationData, GalaxyAdvance } from '../types';

// Import JSON data using alias defined in both web and desktop vite configs
import finalizationData from '@data/finalization_cards_detailed.json';
import gaList from '@data/ga_list.json';
import cardList from '@data/card_list.json';

export const loadFinalizationData = (): FinalizationData => {
  return finalizationData as FinalizationData;
};

export const loadGAList = (): GalaxyAdvance[] => {
  return gaList as GalaxyAdvance[];
};

// カード名の順序マップ（card_list.jsonの並び順）
const cardOrderMap = new Map<string, number>(
  (cardList as Array<{ name: string }>).map((card, index) => [card.name, index])
);

export const getCardOrder = (cardName: string): number => {
  return cardOrderMap.get(cardName) ?? Number.MAX_SAFE_INTEGER;
};
