import { Box, Divider, Typography } from '@mui/material';
import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FolderView } from '../components';
import type { FinalizationData, GalaxyAdvance, Level, Version } from '../types';

interface OutletContext {
  finalizationData: FinalizationData;
  gaList: GalaxyAdvance[];
}

export function WebHome() {
  const { t } = useTranslation();
  const context = useOutletContext<OutletContext>();

  if (!context?.finalizationData) {
    return <Typography color="error">{t('error.loadFailed')}</Typography>;
  }

  const { finalizationData, gaList } = context;
  const versions: Version[] = ['BA', 'RJ'];
  const levels: Level[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  return (
    <Box>
      {versions.map((version) =>
        levels.map((level) => {
          const cards = finalizationData?.[version]?.[`LV${level}` as keyof typeof finalizationData.BA] ?? [];
          return (
            <Box key={`${version}-${level}`} sx={{ mb: 4 }}>
              <FolderView
                version={version}
                level={level}
                cards={cards}
                gaList={gaList ?? []}
              />
              <Divider sx={{ mt: 2 }} />
            </Box>
          );
        })
      )}
    </Box>
  );
}
