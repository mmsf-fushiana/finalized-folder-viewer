import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import ja from './locales/ja.json';
import en from './locales/en.json';

// 日本語属性名から内部キーへのマッピング
export const TYPE_KEY_MAP: Record<string, string> = {
  '無': 'null',
  '電気': 'elec',
  '火': 'fire',
  '水': 'aqua',
  '木': 'wood',
  '風': 'wind',
  'ソード': 'sword',
  'ブレイク': 'break',
};

// 内部キーから日本語属性名へのマッピング（逆引き）
export const TYPE_NAME_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(TYPE_KEY_MAP).map(([k, v]) => [v, k])
);

// サポートする言語
export const supportedLngs = ['ja', 'en'] as const;
export type SupportedLng = typeof supportedLngs[number];

// ブラウザ言語を検出
function detectLanguage(): SupportedLng {
  const browserLang = navigator.language.split('-')[0];
  return supportedLngs.includes(browserLang as SupportedLng)
    ? (browserLang as SupportedLng)
    : 'ja';
}

i18n.use(initReactI18next).init({
  resources: {
    ja: { translation: ja },
    en: { translation: en },
  },
  lng: localStorage.getItem('i18nextLng') || detectLanguage(),
  fallbackLng: 'ja',
  interpolation: {
    escapeValue: false, // React already handles XSS
  },
});

export default i18n;
