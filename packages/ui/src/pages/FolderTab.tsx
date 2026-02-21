import { useState, useEffect } from 'react';
import { Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { FolderView, initialRatings } from '../components';
import type { RatingType, TypeRatings } from '../components';
import type { Level, Version } from '../types';
import { loadFinalizationData, loadGAList } from '../data';
import {
  useRezonAttackStarSum, useRezonAccessLvSum,
  useLockedFolderLevel, useConfirmedNoiseRate, useGameStore,
} from '../stores/gameStore';
import { TYPE_NAME_MAP } from '../i18n';
import { getNoiseLevel } from '../utils/noiseLevel';

const finalizationData = loadFinalizationData();
const gaList = loadGAList();

export function FolderTab({ version }: { version: Version }) {
  const { t } = useTranslation();
  const [level, setLevel] = useState<Level>(1);
  const [typeRatings, setTypeRatings] = useState<TypeRatings>(initialRatings);

  const handleRatingChange = (type: RatingType, value: number) => {
    setTypeRatings(prev => ({ ...prev, [type]: value }));
  };

  // レゾン同期（Zustand ストアからアタックスターを自動適用）
  const attackStarSum = useRezonAttackStarSum();
  const accessLvSum = useRezonAccessLvSum();
  useEffect(() => {
    const override: Record<string, number> = {};
    for (const [engKey, value] of Object.entries(attackStarSum)) {
      const jpKey = TYPE_NAME_MAP[engKey];
      if (jpKey) override[jpKey] = value;
    }
    if (Object.keys(override).length > 0) {
      setTypeRatings(prev => ({ ...prev, ...override }));
    }
  }, [attackStarSum]);

  // ノイズ率からレベルを自動決定
  const confirmedNoiseRate = useConfirmedNoiseRate();
  useEffect(() => {
    if (confirmedNoiseRate !== null) {
      const derived = getNoiseLevel(confirmedNoiseRate, accessLvSum) as Level;
      setLevel(derived);
    }
  }, [confirmedNoiseRate, accessLvSum]);

  // フォルダレベルロック
  const lockedLevel = useLockedFolderLevel();
  const capturedNoiseRate = useGameStore((s) => s._capturedNoiseRate);
  const folderFinalized = useGameStore((s) => s._folderFinalized);
  const effectiveLevel = lockedLevel ?? level;

  const cards = finalizationData?.[version]?.[`LV${effectiveLevel}` as keyof typeof finalizationData.BA] ?? [];

  if (!cards || cards.length === 0) {
    return <Typography>{t('error.notFound')}</Typography>;
  }

  return (
    <>
      {/* デバッグ表示 */}
      <Typography variant="caption" component="div" sx={{ px: 2, py: 0.5, fontFamily: 'Consolas, monospace', color: 'text.secondary', bgcolor: '#f5f5f5', borderRadius: 1, mb: 1 }}>
        lockedLevel: {lockedLevel ?? 'null'} | 
        ロックフラグ: {String(folderFinalized)}
      </Typography>
      
      
      <Typography variant="caption" component="div" sx={{ px: 2, py: 0.5, fontFamily: 'Consolas, monospace', color: 'text.secondary', bgcolor: '#f5f5f5', borderRadius: 1, mb: 1 }}>
        level: {level} | lockedLevel: {lockedLevel ?? 'null'} | effectiveLevel: {effectiveLevel}
        {' | '}confirmedNoiseRate: {confirmedNoiseRate ?? 'null'}
        {' | '}captured: {capturedNoiseRate ?? 'null'} | finalized: {String(folderFinalized)}
        {' | '}accessLvSum: {accessLvSum}
      </Typography>
      <FolderView
        version={version}
        level={effectiveLevel}
        cards={cards}
        gaList={gaList ?? []}
        ratings={typeRatings}
        onRatingChange={handleRatingChange}
        onLevelChange={setLevel}
        accessLvSum={accessLvSum}
      />
    </>
  );
}
