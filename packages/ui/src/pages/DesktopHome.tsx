import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Button,
  Link,
  Step,
  StepLabel,
  Stepper,
  Typography,
} from '@mui/material';
import { useGameStore, usePipeStatus, useGameActive } from '../stores/gameStore';
import type { GameMessage } from '../stores/gameStore';
import { VERSION_COLORS } from '../types';

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
    electronAPI?: {
      openExternal: (url: string) => void;
    };
  }
}

export function DesktopHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const pipeConnected = usePipeStatus();
  const gameActive = useGameActive();

  useEffect(() => {
    const api = window.gameAPI;
    if (!api) return;

    const { setPipeConnected, handleMessage } = useGameStore.getState();

    const removePipeStatus = api.onPipeStatus((connected) => {
      setPipeConnected(connected);
    });

    const removeMessage = api.onMessage((msg: GameMessage) => {
      handleMessage(msg);
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

  // Stepper: 0=エミュレータ接続待ち, 1=ROM検出待ち, 2=バージョン選択可能
  const activeStep = !pipeConnected ? 0 : !gameActive ? 1 : 2;

  const steps = [
    t('monitor.step.connect'),
    t('monitor.step.detect'),
    t('monitor.step.select'),
  ];

  let hintMessage: string;
  if (!pipeConnected) {
    hintMessage = t('monitor.startDS');
  } else if (!gameActive) {
    hintMessage = t('monitor.startGame');
  } else {
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

      <Stepper
        activeStep={activeStep}
        alternativeLabel
        sx={{
          width: '100%',
          maxWidth: 480,
          '& .MuiStepLabel-label': {
            fontSize: '0.75rem',
            color: 'text.secondary',
          },
        }}
      >
        {steps.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      <Typography variant="body2" color={activeStep < 2 ? 'error' : 'text.primary'}>
        {hintMessage}
      </Typography>

      <Box sx={{ display: 'flex', gap: 3 }}>
        {(['BA', 'RJ'] as const).map((ver) => (
          <Button
            key={ver}
            variant="contained"
            size="large"
            disabled={!canSelect}
            onClick={() => handleVersionSelect(ver)}
            sx={{
              minWidth: 140,
              fontSize: '1.1rem',
              py: 1.5,
              bgcolor: VERSION_COLORS[ver],
              '&:hover': { bgcolor: VERSION_COLORS[ver], filter: 'brightness(1.2)' },
            }}
          >
            {ver === 'BA' ? 'Black Ace' : 'Red Joker'}
          </Button>
        ))}
      </Box>

      <Link
        component="button"
        onClick={() => {
          const url = 'https://mmsf-fushiana.github.io/finalized-folder-viewer/';
          if (window.electronAPI?.openExternal) {
            window.electronAPI.openExternal(url);
          } else {
            window.open(url, '_blank', 'noopener,noreferrer');
          }
        }}
        variant="body2"
        color="text.secondary"
        sx={{ mt: 2 }}
      >
        Web版 ファイナライズフォルダビューアを開く
      </Link>
    </Box>
  );
}
