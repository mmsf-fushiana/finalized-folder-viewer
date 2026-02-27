import { useState } from 'react';
import { Box, Typography } from '@mui/material';
import { useParams, useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FolderView, initialRatings } from '../components';
import type { RatingType, TypeRatings } from '../components';
import type { FinalizationData, GalaxyAdvance, Level, Version } from '../types';

interface OutletContext {
  finalizationData: FinalizationData;
  gaList: GalaxyAdvance[];
}

export function FolderDetail() {
  const { t } = useTranslation();
  const { version, level } = useParams<{ version: string; level: string }>();
  const context = useOutletContext<OutletContext>();

  if (!context?.finalizationData) {
    return <Typography color="error">{t('error.loadFailed')}</Typography>;
  }

  const { finalizationData, gaList } = context;

  if (!version || !level) {
    return <Typography>{t('error.invalidParams')}</Typography>;
  }

  const ver = version.toUpperCase() as Version;
  const lv = parseInt(level, 10) as Level;

  if (!['BA', 'RJ'].includes(ver) || lv < 1 || lv > 12) {
    return <Typography>{t('error.invalidVersion')}</Typography>;
  }

  const cards = finalizationData?.[ver]?.[`LV${lv}` as keyof typeof finalizationData.BA] ?? [];

  const [typeRatings, setTypeRatings] = useState<TypeRatings>(initialRatings);

  const handleRatingChange = (type: RatingType, value: number) => {
    setTypeRatings(prev => ({ ...prev, [type]: value }));
  };

  if (!cards || cards.length === 0) {
    return <Typography>{t('error.notFound')}</Typography>;
  }

  return (
    <Box>
      <FolderView
        version={ver}
        level={lv}
        cards={cards}
        gaList={gaList ?? []}
        ratings={typeRatings}
        onRatingChange={handleRatingChange}
      />
    </Box>
  );
}
