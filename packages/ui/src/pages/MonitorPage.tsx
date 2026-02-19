import { useEffect, useReducer, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, Tab, Tabs, Typography } from '@mui/material';
import {
  gameReducer,
  GameContext,
  initialGameState,
} from '../stores/gameStore';
import type { GameMessage } from '../stores/gameStore';
import { GameMonitor } from '../components/GameMonitor';

type GameVersion = 'BA' | 'RJ';

export function MonitorPage() {
  const { t } = useTranslation();
  const { version } = useParams<{ version: string }>();
  const gameVersion = (version === 'BA' || version === 'RJ' ? version : 'RJ') as GameVersion;

  const [state, dispatch] = useReducer(gameReducer, initialGameState);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    const api = window.gameAPI;
    if (!api) return;

    const removeMessage = api.onMessage((msg: GameMessage) => {
      dispatch({ type: 'MESSAGE', payload: msg });
    });

    const removePipeStatus = api.onPipeStatus((connected: boolean) => {
      dispatch({ type: connected ? 'PIPE_CONNECTED' : 'PIPE_DISCONNECTED' });
    });

    // バージョン通知 → フルステート要求
    api.setVersion(gameVersion);
    api.getPipeStatus().then((connected) => {
      dispatch({ type: connected ? 'PIPE_CONNECTED' : 'PIPE_DISCONNECTED' });
      if (connected) api.requestRefresh();
    });

    return () => {
      removeMessage();
      removePipeStatus();
    };
  }, [gameVersion]);

  return (
    <GameContext.Provider value={{ state, dispatch }}>
      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
            <Tab label={t('monitor.tab.monitor')} />
            <Tab label={t('monitor.tab.tab2')} />
            <Tab label={t('monitor.tab.tab3')} />
          </Tabs>
        </Box>

        <Box sx={{ pt: 2 }}>
          {activeTab === 0 && <GameMonitor version={gameVersion} />}
          {activeTab === 1 && (
            <Typography color="text.secondary" sx={{ p: 2 }}>
              {t('monitor.tab.tab2')} (Coming soon)
            </Typography>
          )}
          {activeTab === 2 && (
            <Typography color="text.secondary" sx={{ p: 2 }}>
              {t('monitor.tab.tab3')} (Coming soon)
            </Typography>
          )}
        </Box>
      </Box>
    </GameContext.Provider>
  );
}
