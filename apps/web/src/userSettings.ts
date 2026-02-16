const STORAGE_KEY = 'ssr3-viewer-settings';

export interface UserSettings {
  theme: 'light' | 'dark';
}

const defaultSettings: UserSettings = {
  theme: 'light',
};

export function loadUserSettings(): UserSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...defaultSettings, ...JSON.parse(stored) };
    }
  } catch {
    // ignore parse errors
  }
  return defaultSettings;
}

export function saveUserSettings(settings: UserSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
