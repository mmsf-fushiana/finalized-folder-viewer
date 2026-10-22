// useRomNavigator.ts : デスクトップ版の ROM 状態に応じた画面遷移とキャプション更新
//
// DLL が status メッセージで知らせる romVersion / romFile を監視し、
//   - 流星3 の版が判明したら /monitor/<版> へ自動遷移する (別版への切り替えも追従)
//   - 流星3 以外になっても画面は移動しない (モニター画面に留まる)
//   - ウィンドウキャプションを「アプリ名 - <ROM 名> [<版>]」にする
// gameAPI の購読もここで一度だけ行い、アプリ生存中は維持する。

import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { subscribeGameAPI, useGameStore } from '../stores/gameStore';
import type { Version } from '../types';

/** ウィンドウの基本タイトル (apps/desktop の index.html / main.ts と同じ文字列) */
export const APP_TITLE = 'SSR3 melonDS Viewer 1.0.0';

/** モニター画面のウィンドウサイズ */
const MONITOR_WINDOW = { width: 800, height: 1030 };

/** "ビググレ種.nds" → "ビググレ種" */
export function stripRomExtension(file: string): string {
  const dot = file.lastIndexOf('.');
  return dot > 0 ? file.slice(0, dot) : file;
}

/**
 * キャプション文字列
 *   名前と版あり: "SSR3 melonDS Viewer 1.0.0 - ビググレ種 [RJ]"
 *   名前のみ    : "SSR3 melonDS Viewer 1.0.0 - ビググレ種"
 *   版のみ      : "SSR3 melonDS Viewer 1.0.0 - [RJ]"
 *   どちらも無し: "SSR3 melonDS Viewer 1.0.0"
 */
export function formatCaption(romFile: string, romVersion: Version | ''): string {
  const parts = [stripRomExtension(romFile), romVersion ? `[${romVersion}]` : ''].filter(Boolean);
  return parts.length > 0 ? `${APP_TITLE} - ${parts.join(' ')}` : APP_TITLE;
}

export function useRomNavigator(): void {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const romVersion = useGameStore((s) => s.romVersion);
  const romFile = useGameStore((s) => s.romFile);

  // gameAPI 購読 (アプリ生存中ずっと)
  useEffect(() => subscribeGameAPI(), []);

  // 版が判明したらモニター画面へ。別版へ変わればその版へ。'' になっても移動しない
  useEffect(() => {
    if (!romVersion) return;
    const target = `/monitor/${romVersion}`;
    if (pathname === target) return;
    const onMonitor = pathname.startsWith('/monitor/');
    if (pathname !== '/' && !onMonitor) return; // /settings などは触らない
    if (!onMonitor) {
      window.electronAPI?.resizeWindow(MONITOR_WINDOW.width, MONITOR_WINDOW.height);
    }
    navigate(target, { replace: true });
  }, [romVersion, pathname, navigate]);

  // キャプション (Electron は document.title をウィンドウタイトルに反映する)
  useEffect(() => {
    document.title = formatCaption(romFile, romVersion);
  }, [romFile, romVersion]);
}
