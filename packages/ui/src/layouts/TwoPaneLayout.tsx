import { Box, AppBar, Toolbar, Typography } from '@mui/material';
import { Outlet } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import type { FinalizationData, GalaxyAdvance } from '../types';
import { VERSION_COLORS } from '../types/card';

interface TwoPaneLayoutProps {
  finalizationData: FinalizationData;
  gaList: GalaxyAdvance[];
}

export function TwoPaneLayout({
  finalizationData,
  gaList,
}: TwoPaneLayoutProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <AppBar
        position="static"
        sx={{
          minHeight: 40,
          background: `linear-gradient(340deg, ${VERSION_COLORS.RJ} 30%, ${VERSION_COLORS.BA} 70%)`,
        }}
      >
        <Toolbar variant="dense" sx={{ minHeight: 40, px: '16px !important' }}>
          <Box component="img" src="/s_icon.png" alt="" sx={{ width: 24, height: 24, mr: 1 }} />
          <Typography variant="body2" component="div" sx={{ flexGrow: 1, fontWeight: 'bold' }}>
            Finalized Folder Viewer
          </Typography>
          <LanguageSwitcher />
        </Toolbar>
      </AppBar>
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar finalizationData={finalizationData} />
        <Box sx={{ flex: 1, overflow: 'auto', p: 0 }}>
          <Outlet context={{ finalizationData, gaList }} />
        </Box>
      </Box>
    </Box>
  );
}