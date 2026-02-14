import { Typography, Box, Paper } from '@mui/material';

export function DesktopHome() {
  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Desktop Home
      </Typography>
      <Paper sx={{ p: 3, mt: 2 }}>
        <Typography variant="h6" gutterBottom>
          Electron専用機能
        </Typography>
        <Typography variant="body1">
          このページはデスクトップ版専用です。
        </Typography>
      </Paper>
    </Box>
  );
}
