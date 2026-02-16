// Shared hooks

declare global {
  interface Window {
    env?: {
      isElectron?: boolean;
    };
  }
}

/**
 * デスクトップ版(Electron)かどうかを判定する
 * preloadスクリプトで注入された window.env.isElectron で判定
 */
export function isDesktop(): boolean {
  return typeof window !== 'undefined' && window.env?.isElectron === true;
}
