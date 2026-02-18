import { useReducer, useEffect } from 'react';
import { Box } from '@mui/material';
import {
  GameContext,
  gameReducer,
  initialGameState,
} from '../stores/gameStore';
import type { GameMessage } from '../stores/gameStore';
import { GameMonitor } from '../components/GameMonitor';

declare global {
  interface Window {
    gameAPI?: {
      onMessage: (callback: (msg: GameMessage) => void) => () => void;
      onPipeStatus: (callback: (connected: boolean) => void) => () => void;
      getPipeStatus: () => Promise<boolean>;
      writeValue: (target: string, value: number) => void;
      requestRefresh: () => void;
      ping: () => void;
    };
  }
}

export function DesktopHome() {
  const [state, dispatch] = useReducer(gameReducer, initialGameState);

  useEffect(() => {
    const api = window.gameAPI;
    if (!api) return;

    const removeMessage = api.onMessage((msg: GameMessage) => {
      dispatch({ type: 'MESSAGE', payload: msg });
    });

    const removePipeStatus = api.onPipeStatus((connected: boolean) => {
      dispatch({ type: connected ? 'PIPE_CONNECTED' : 'PIPE_DISCONNECTED' });
    });

    // マウント時に現在のpipe状態を問い合わせ（接続イベント取りこぼし対策）
    api.getPipeStatus().then((connected) => {
      dispatch({ type: connected ? 'PIPE_CONNECTED' : 'PIPE_DISCONNECTED' });
      // 既に接続済みなら、フルステートを再要求（OnConnect時の送信はRenderer未準備で消失するため）
      if (connected) {
        api.requestRefresh();
      }
    });

    // StrictMode 二重実行対策: リスナーを確実に1つだけに保つ
    return () => {
      removeMessage();
      removePipeStatus();
    };
  }, []);

  return (
    <GameContext.Provider value={{ state, dispatch }}>
      <Box sx={{ p: 2 }}>
        <GameMonitor />
      </Box>
    </GameContext.Provider>
  );
}
