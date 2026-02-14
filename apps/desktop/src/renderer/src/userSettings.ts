export interface UserSettings {
  theme: 'light' | 'dark';
}

const defaultSettings: UserSettings = {
  theme: 'light',
};

let cachedSettings: UserSettings | null = null;

export async function loadUserSettings(): Promise<UserSettings> {
  if (cachedSettings) {
    return cachedSettings;
  }
  // Desktop版では将来的にElectronのuserData配下にファイル保存
  // 現時点ではデフォルト値を返す
  cachedSettings = defaultSettings;
  return cachedSettings;
}

export async function saveUserSettings(settings: UserSettings): Promise<void> {
  cachedSettings = settings;
  // Desktop版では将来的にElectronのuserData配下にファイル保存
}
