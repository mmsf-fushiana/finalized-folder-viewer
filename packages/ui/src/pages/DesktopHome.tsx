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
      onMessage: (callback: (msg: GameMessage) => void) => void;
      onPipeStatus: (callback: (connected: boolean) => void) => void;
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

    api.onMessage((msg: GameMessage) => {
      dispatch({ type: 'MESSAGE', payload: msg });
    });

    api.onPipeStatus((connected: boolean) => {
      dispatch({ type: connected ? 'PIPE_CONNECTED' : 'PIPE_DISCONNECTED' });
    });
  }, []);

  return (
    <GameContext.Provider value={{ state, dispatch }}>
      <Box sx={{ p: 2 }}>
        <GameMonitor />
      </Box>
    </GameContext.Provider>
  );
}
