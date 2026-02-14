import { Typography, Box, Chip } from '@mui/material';
import { isDesktop } from '../hooks';

export function Health() {
  const desktop = isDesktop();
  const windowEnv = typeof window !== 'undefined' ? window.env : undefined;
  const windowElectronAPI = typeof window !== 'undefined' ? (window as any).electronAPI : undefined;

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Health
        <Chip
          label={desktop ? 'Desktop' : 'Web'}
          color={desktop ? 'primary' : 'secondary'}
          size="small"
          sx={{ ml: 2 }}
        />
      </Typography>
      <Typography variant="body1">
        Welcome to Finalized Folder Viewer.
      </Typography>
      {desktop && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Electron機能が利用可能です
        </Typography>
      )}
      <Box sx={{ mt: 4, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
        <Typography variant="h6">Debug Info</Typography>
        <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap' }}>
          window.env: {JSON.stringify(windowEnv, null, 2)}
        </Typography>
        <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap' }}>
          window.electronAPI: {windowElectronAPI ? 'exists' : 'undefined'}
        </Typography>
        <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap' }}>
          isDesktop(): {String(desktop)}
        </Typography>
      </Box>
    </Box>
  );
}
