import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, Button, Chip, Typography } from '@mui/material';
import type { GameMessage } from '../stores/gameStore';

type GameVersion = 'BA' | 'RJ';

declare global {
  interface Window {
    gameAPI?: {
      onMessage: (callback: (msg: GameMessage) => void) => () => void;
      onPipeStatus: (callback: (connected: boolean) => void) => () => void;
      getPipeStatus: () => Promise<boolean>;
      writeValue: (target: string, value: number) => void;
      requestRefresh: () => void;
      ping: () => void;
      setVersion: (version: string) => void;
    };
  }
}

export function DesktopHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [pipeConnected, setPipeConnected] = useState(false);
  const [gameActive, setGameActive] = useState(false);

  useEffect(() => {
    const api = window.gameAPI;
    if (!api) return;

    const removePipeStatus = api.onPipeStatus((connected) => {
      setPipeConnected(connected);
      if (!connected) setGameActive(false);
    });

    const removeMessage = api.onMessage((msg: GameMessage) => {
      if (msg.type === 'status') {
        setGameActive(msg.gameActive);
      }
    });

    api.getPipeStatus().then((connected) => {
      setPipeConnected(connected);
      if (connected) api.requestRefresh();
    });

    return () => {
      removePipeStatus();
      removeMessage();
    };
  }, []);

  const handleVersionSelect = (version: GameVersion) => {
    navigate(`/monitor/${version}`);
  };

  const canSelect = pipeConnected && gameActive;

  let statusLabel: string;
  let statusColor: 'error' | 'warning' | 'success';
  let hintMessage: string;

  if (!pipeConnected) {
    statusLabel = t('monitor.pipeDisconnected');
    statusColor = 'error';
    hintMessage = t('monitor.startDS');
  } else if (!gameActive) {
    statusLabel = t('monitor.waitingGame');
    statusColor = 'warning';
    hintMessage = t('monitor.startGame');
  } else {
    statusLabel = t('monitor.selectVersion');
    statusColor = 'success';
    hintMessage = t('monitor.romDetected');
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '60vh',
        gap: 4,
      }}
    >
      <Typography variant="h4" fontWeight="bold">
        流星のロックマン3 Viewer
      </Typography>

      <Chip
        label={statusLabel}
        color={statusColor}
        size="medium"
        sx={{ fontSize: '0.95rem', px: 1 }}
      />

      {hintMessage && (
        <Typography variant="body2" color="text.secondary">
          {hintMessage}
        </Typography>
      )}

      <Box sx={{ display: 'flex', gap: 3 }}>
        {(['BA', 'RJ'] as const).map((ver) => (
          <Button
            key={ver}
            variant="contained"
            size="large"
            disabled={!canSelect}
            onClick={() => handleVersionSelect(ver)}
            sx={{ minWidth: 140, fontSize: '1.1rem', py: 1.5 }}
          >
            {ver === 'BA' ? 'Black Ace' : 'Red Joker'}
          </Button>
        ))}
      </Box>
    </Box>
  );
}
