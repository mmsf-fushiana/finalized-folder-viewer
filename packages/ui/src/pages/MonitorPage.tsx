import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, Tab, Tabs, Typography } from '@mui/material';
import {
  subscribeGameAPI, useGameStore, useGameValue, hexToNumber,
  useRezonAttackStarSum, useRezonFinalizeTurnSum, useRezonAccessLvSum,
} from '../stores/gameStore';
import { GameMonitor } from '../components/GameMonitor';

type GameVersion = 'BA' | 'RJ';

function ValueRow({ label }: { label: string }) {
  const gv = useGameValue(label);
  const hex = gv?.value ?? '';
  const dec = hex ? hexToNumber(hex) : 0;
  return (
    <Typography variant="body1">
      {label}: 0x{hex || '---'} ({dec})
    </Typography>
  );
}

function RezonSummary() {
  const attackStarSum = useRezonAttackStarSum();
  const finalizeTurnSum = useRezonFinalizeTurnSum();
  const accessLvSum = useRezonAccessLvSum();

  return (
    <>
      <Typography variant="body1">
        attackStar: {Object.entries(attackStarSum).map(([attr, count]) => `${attr}:${count}`).join(', ') || '---'}
      </Typography>
      <Typography variant="body1">finalizeTurn: {finalizeTurnSum}</Typography>
      <Typography variant="body1">accessLv: {accessLvSum}</Typography>
    </>
  );
}

function WarlockTab() {
  return (
    <Box sx={{ p: 2, fontFamily: 'Consolas, monospace', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>Debug Values</Typography>
      <ValueRow label="WARLOCK" />
      <ValueRow label="NOISE_RATE_1" />
      <ValueRow label="NOISE_RATE_2" />
      <ValueRow label="COMFIRM_LV_1" />
      <ValueRow label="COMFIRM_LV_2" />
      
      <ValueRow label="MY_REZON" />
      <ValueRow label="REZON_L0" />
      <ValueRow label="REZON_L1" />
      <ValueRow label="REZON_L2" />
      <ValueRow label="REZON_R0" />
      <ValueRow label="REZON_R1" />
      <ValueRow label="REZON_R2" />
      <RezonSummary />
      <ValueRow label="SELECTED_SSS_VAL_1" />
      <ValueRow label="SELECTED_SSS_VAL_2" />
      <ValueRow label="SSS_CURSOR" />
      <ValueRow label="CURRENT_CARD" />
      
      
    </Box>
  );
}

export function MonitorPage() {
  const { t } = useTranslation();
  const { version } = useParams<{ version: string }>();
  const gameVersion = (version === 'BA' || version === 'RJ' ? version : 'RJ') as GameVersion;

  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribeGameAPI(gameVersion);
    return () => {
      unsubscribe();
      useGameStore.getState().reset();
    };
  }, [gameVersion]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
          <Tab label={t('monitor.tab.monitor')} />
          <Tab label={t('monitor.tab.tab2')} />
          <Tab label={t('monitor.tab.tab3')} />
        </Tabs>
      </Box>

      <Box sx={{ pt: 2, px: 2 }}>
        {activeTab === 0 && <GameMonitor version={gameVersion} />}
        {activeTab === 1 && <WarlockTab />}
        {activeTab === 2 && (
          <Typography color="text.secondary" sx={{ p: 2 }}>
            (Coming soon)
          </Typography>
        )}
      </Box>
    </Box>
  );
}
