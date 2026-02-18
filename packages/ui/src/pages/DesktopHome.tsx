import { useState, useEffect } from 'react';
import { Typography, Box, Paper, Chip } from '@mui/material';

declare global {
  interface Window {
    pipeAPI?: {
      onData: (callback: (text: string) => void) => void;
      onStatus: (callback: (connected: boolean) => void) => void;
    };
  }
}

export function DesktopHome() {
  const [pipeData, setPipeData] = useState<string>('DLL接続待機中...');
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (window.pipeAPI) {
      window.pipeAPI.onData((text) => setPipeData(text));
      window.pipeAPI.onStatus((status) => setConnected(status));
    }
  }, []);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Typography variant="h5" component="h1">
          Game Monitor
        </Typography>
        <Chip
          label={connected ? '接続中' : '未接続'}
          color={connected ? 'success' : 'default'}
          size="small"
        />
      </Box>
      <Paper sx={{ p: 2 }}>
        <Box
          component="pre"
          sx={{
            fontFamily: 'Consolas, monospace',
            fontSize: '0.85rem',
            lineHeight: 1.6,
            m: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {pipeData}
        </Box>
      </Paper>
    </Box>
  );
}
