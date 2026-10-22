import { AppLayout } from './AppLayout';
import { useRomNavigator } from '../hooks/useRomNavigator';

/**
 * デスクトップ版のルートレイアウト。
 * AppLayout は web の /health でも使うため、gameAPI 購読と ROM に応じた遷移はここに置く。
 */
export function DesktopLayout() {
  useRomNavigator();
  return <AppLayout />;
}
