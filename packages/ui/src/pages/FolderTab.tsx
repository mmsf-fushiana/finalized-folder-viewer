import { useState, useEffect } from 'react';
import { Typography, Switch, FormControlLabel } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { FolderView, initialRatings } from '../components';
import type { RatingType, TypeRatings } from '../components';
import type { Level, Version } from '../types';
import { loadFinalizationData, loadGAList } from '../data';
import {
  useRezonAttackStarSum, useRezonAccessLvSum,
  useLockedFolderLevel, useGameNumber, useGameStore,
} from '../stores/gameStore';
import { TYPE_NAME_MAP } from '../i18n';
import { getNoiseLevel } from '../utils/noiseLevel';

const finalizationData = loadFinalizationData();
const gaList = loadGAList();

export function FolderTab({ version }: { version: Version }) {
  const { t } = useTranslation();
  const [level, setLevel] = useState<Level>(1);
  const [typeRatings, setTypeRatings] = useState<TypeRatings>(initialRatings);
  const [updateOnFinalize, setUpdateOnFinalize] = useState(false);

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

  // ゲームデータ取得
  const rawNoiseRate1 = useGameNumber('NOISE_RATE_1');
  const noiseRate = Math.trunc(rawNoiseRate1 / 10);
  const folderFinalized = useGameStore((s) => s._folderFinalized);
  const confirmLv1 = useGameNumber('COMFIRM_LV_1');
  const confirmLv2 = useGameNumber('COMFIRM_LV_2');

  // レベル自動決定
  useEffect(() => {
    if (folderFinalized) return; // ロック中はスキップ
    if (updateOnFinalize) {
      // ファイナライズ選択時のみ: COMFIRM一致(1-12)でその値をレベルに
      if (confirmLv1 === confirmLv2 && confirmLv1 >= 1 && confirmLv1 <= 12) {
        setLevel(confirmLv1 as Level);
      }
    } else {
      // リアルタイム: ノイズ率からレベル決定
      if (noiseRate > 0) {
        const derived = getNoiseLevel(noiseRate, accessLvSum) as Level;
        setLevel(derived);
      }
    }
  }, [noiseRate, accessLvSum, folderFinalized, updateOnFinalize, confirmLv1, confirmLv2]);

  // フォルダレベルロック
  const lockedLevel = useLockedFolderLevel();
  const capturedNoiseRate = useGameStore((s) => s._capturedNoiseRate);
  const effectiveLevel = lockedLevel ?? level;

  const cards = finalizationData?.[version]?.[`LV${effectiveLevel}` as keyof typeof finalizationData.BA] ?? [];

  if (!cards || cards.length === 0) {
    return <Typography>{t('error.notFound')}</Typography>;
  }

  return (
    <>
      <FormControlLabel
        control={<Switch checked={updateOnFinalize} onChange={(_, v) => setUpdateOnFinalize(v)} size="small" />}
        label="ファイナライズ選択時に更新する"
        sx={{ px: 2, mb: 0.5 }}
      />
      {/* デバッグ表示 */}
      <Typography variant="caption" component="div" sx={{ px: 2, py: 0.5, fontFamily: 'Consolas, monospace', color: 'text.secondary', bgcolor: '#f5f5f5', borderRadius: 1, mb: 1 }}>
        noiseRate: {noiseRate}
        lockedLevel: {lockedLevel ?? 'null'} | 
        ロックフラグ: {String(folderFinalized)}
      </Typography>
      
      
      <Typography variant="caption" component="div" sx={{ px: 2, py: 0.5, fontFamily: 'Consolas, monospace', color: 'text.secondary', bgcolor: '#f5f5f5', borderRadius: 1, mb: 1 }}>
        level: {level} | lockedLevel: {lockedLevel ?? 'null'} | effectiveLevel: {effectiveLevel}
        {' | '}noiseRate: {noiseRate}
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
