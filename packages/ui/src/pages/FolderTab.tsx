import { useState, useEffect } from 'react';
import { Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { FolderView, initialRatings } from '../components';
import type { RatingType, TypeRatings } from '../components';
import type { Level, Version } from '../types';
import { loadFinalizationData, loadGAList } from '../data';
import { useRezonAttackStarSum, useRezonAccessLvSum } from '../stores/gameStore';
import { TYPE_NAME_MAP } from '../i18n';

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

  const cards = finalizationData?.[version]?.[`LV${level}` as keyof typeof finalizationData.BA] ?? [];

  if (!cards || cards.length === 0) {
    return <Typography>{t('error.notFound')}</Typography>;
  }

  return (
    <FolderView
      version={version}
      level={level}
      cards={cards}
      gaList={gaList ?? []}
      ratings={typeRatings}
      onRatingChange={handleRatingChange}
      onLevelChange={setLevel}
      accessLvSum={accessLvSum}
    />
  );
}
