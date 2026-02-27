import { useState, useEffect } from 'react';
import { Typography, Switch, FormControlLabel, Chip, Box, Divider } from '@mui/material';
import { Trans, useTranslation } from 'react-i18next';
import { FolderView, initialRatings } from '../components';
import type { RatingType, TypeRatings } from '../components';
import type { Level, Version } from '../types';
import { VERSION_COLORS } from '../types';
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
  const fTurnRemaining = useGameNumber('F_Turn_Remaining');

  // レベル自動決定
  useEffect(() => {
    if (folderFinalized) return; // ロック中はスキップ
    // COMFIRM両方0（バトル開始時）→ 最低レベルにリセット
    if (confirmLv1 === 0 && confirmLv2 === 0) {
      setLevel(getNoiseLevel(200, accessLvSum) as Level);
      return;
    }
    if (updateOnFinalize) {
      // ファイナライズ選択時のみ: COMFIRM一致(1-12)でその値をレベルに
      if (confirmLv1 === confirmLv2 && confirmLv1 >= 1 && confirmLv1 <= 12) {
        setLevel(confirmLv1 as Level);
      }
    } else {
      // リアルタイム: ノイズ率からレベル決定 (200未満はテーブル範囲外のため無視)
      if (noiseRate >= 200) {
        const derived = getNoiseLevel(noiseRate, accessLvSum) as Level;
        setLevel(derived);
      }
    }
  }, [noiseRate, accessLvSum, folderFinalized, updateOnFinalize, confirmLv1, confirmLv2]);

  // フォルダレベルロック
  const lockedLevel = useLockedFolderLevel();
  const capturedNoiseRate = useGameStore((s) => s._capturedNoiseRate);
  const confirmedLevel = useGameStore((s) => s._confirmedFolderLevel);
  const effectiveLevel = folderFinalized ? (confirmedLevel ?? lockedLevel ?? level) : level;

  const cards = finalizationData?.[version]?.[`LV${effectiveLevel}` as keyof typeof finalizationData.BA] ?? [];

  if (!cards || cards.length === 0) {
    return <Typography>{t('error.notFound')}</Typography>;
  }

  return (
    <>
      <Box sx={{ pt: 1, px: 2, mb: 0.5, display: 'flex', alignItems: 'center', gap: 1, whiteSpace: 'nowrap' }}>
        <Typography variant="caption">{t('monitor.noiseRate')}:</Typography>
        <Chip
          label={noiseRate >= 0 && noiseRate <= 999 ? `${noiseRate}%` : '---'}
          size="small"
          sx={{
            bgcolor: noiseRate >= 0 && noiseRate <= 999
              ? noiseRate < 50 ? 'rgb(92, 185, 92)' : noiseRate < 200 ? '#f69e46' : '#d50000'
              : '#9e9e9e',
            color: 'white',
            fontSize: 14,
            height: 22,
            letterSpacing: '0.09em',
            borderRadius: 1,
            '& .MuiChip-label': { px: 0.5 },
          }}
        />
        {fTurnRemaining > 0 && (
          <>
            <Divider orientation="vertical" flexItem />
            <Chip
              label={version}
              size="small"
              sx={{
                bgcolor: VERSION_COLORS[version],
                color: 'white',
                fontSize: 14,
                height: 22,
                borderRadius: 1,
                '& .MuiChip-label': { px: 0.5 },
              }}
            />
            {confirmedLevel && (
              <Chip
                label={`Lv. ${confirmedLevel}`}
                size="small"
                variant="outlined"
                sx={{
                  color: '#d50000',
                  borderColor: '#d50000',
                  fontSize: 14,
                  height: 22,
                  borderRadius: 1,
                  '& .MuiChip-label': { px: 0.5 },
                }}
              />
            )}
            <Typography variant="caption"><Trans i18nKey="monitor.remainingTurns" values={{ count: fTurnRemaining }} components={{ 1: <b /> }} /></Typography>
            <Divider orientation="vertical" flexItem />
          
          </>
        )}
        
        <FormControlLabel
          control={<Switch checked={updateOnFinalize} onChange={(_, v) => setUpdateOnFinalize(v)} size="small" />}
          label={t('monitor.updateOnFinalize')}
          sx={{ m: 0, ml: 'auto', '& .MuiFormControlLabel-label': { fontSize: 12 } }}
        />
      </Box>

            
      {/* デバッグ表示 */}
      {/* <Typography variant="caption" component="div" sx={{ px: 2, py: 0.5, fontFamily: 'Consolas, monospace', color: 'text.secondary', bgcolor: '#f5f5f5', borderRadius: 1, mb: 1 }}>
        noiseRate: {noiseRate}
        lockedLevel: {lockedLevel ?? 'null'} | 
        ロックフラグ: {String(folderFinalized)}
      </Typography>
      
      
      <Typography variant="caption" component="div" sx={{ px: 2, py: 0.5, fontFamily: 'Consolas, monospace', color: 'text.secondary', bgcolor: '#f5f5f5', borderRadius: 1, mb: 1 }}>
        level: {level} | lockedLevel: {lockedLevel ?? 'null'} | effectiveLevel: {effectiveLevel}
        {' | '}noiseRate: {noiseRate}
        {' | '}captured: {capturedNoiseRate ?? 'null'} | finalized: {String(folderFinalized)}
        {' | '}accessLvSum: {accessLvSum}
      </Typography> */}
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
