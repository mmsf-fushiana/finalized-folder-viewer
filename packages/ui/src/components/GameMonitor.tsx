import { useMemo } from 'react';
import {
  Box,
  Typography,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import { useGameState } from '../stores/gameStore';

/** ミリ秒付きタイムスタンプ文字列 */
function formatTimestamp(ms: number): string {
  if (!ms) return '---';
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const milli = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${milli}`;
}

export function GameMonitor() {
  const { state } = useGameState();
  const {
    pipeConnected,
    gameActive,
    mainram,
    values,
    lastDeltaKeys,
    lastDeltaTime,
    lastReceivedTime,
    lastError,
  } = state;

  // テーブル行データ
  const rows = useMemo(() => {
    return Object.entries(values).map(([name, gv]) => ({
      name,
      value: gv.value,
      address: gv.address,
      size: gv.size,
      lastUpdated: gv.lastUpdated,
      isChanged: lastDeltaKeys.includes(name),
    }));
  }, [values, lastDeltaKeys]);

  return (
    <Box>
      {/* ヘッダー: タイトル + 接続状態 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
        <Typography variant="h5" component="h1">
          Game Monitor
        </Typography>
        <Chip
          label="RJ"
          color="primary"
          size="small"
          variant="outlined"
        />
        <Chip
          label={pipeConnected ? 'Pipe接続中' : 'Pipe未接続'}
          color={pipeConnected ? 'success' : 'default'}
          size="small"
        />
        {pipeConnected && (
          <Chip
            label={gameActive ? 'ゲーム検出' : 'ゲーム待機中'}
            color={gameActive ? 'info' : 'warning'}
            size="small"
            variant="outlined"
          />
        )}
      </Box>

      {/* メタ情報 */}
      <Box
        sx={{
          display: 'flex',
          gap: 3,
          mb: 1.5,
          fontFamily: 'Consolas, monospace',
          fontSize: '0.75rem',
          color: 'text.secondary',
        }}
      >
        {mainram && <span>MainRAM: {mainram}</span>}
        <span>最終受信: {formatTimestamp(lastReceivedTime)}</span>
        {lastDeltaTime > 0 && (
          <span>最終差分: {formatTimestamp(lastDeltaTime)} ({lastDeltaKeys.length}件)</span>
        )}
      </Box>

      {/* エラー表示 */}
      {lastError && (
        <Paper sx={{ p: 1, mb: 1.5, bgcolor: 'error.dark', color: 'error.contrastText' }}>
          <Typography variant="body2">{lastError}</Typography>
        </Paper>
      )}

      {/* 値テーブル */}
      <TableContainer component={Paper} sx={{ maxHeight: 600 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 'bold', width: 120 }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 'bold', width: 100 }} align="right">Value</TableCell>
              <TableCell sx={{ fontWeight: 'bold', width: 100 }}>Address</TableCell>
              <TableCell sx={{ fontWeight: 'bold', width: 50 }} align="center">Size</TableCell>
              <TableCell sx={{ fontWeight: 'bold', width: 120 }}>Updated</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  {pipeConnected
                    ? 'データ受信待機中...'
                    : 'DLLに接続していません'}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.name}
                  sx={{
                    bgcolor: row.isChanged ? 'action.selected' : 'transparent',
                    transition: 'background-color 0.3s ease',
                  }}
                >
                  <TableCell
                    sx={{
                      fontFamily: 'Consolas, monospace',
                      fontSize: '0.8rem',
                      fontWeight: row.isChanged ? 'bold' : 'normal',
                    }}
                  >
                    {row.name}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      fontFamily: 'Consolas, monospace',
                      fontSize: '0.8rem',
                      fontWeight: row.isChanged ? 'bold' : 'normal',
                      color: row.isChanged ? 'primary.main' : 'text.primary',
                    }}
                  >
                    {row.value}
                  </TableCell>
                  <TableCell
                    sx={{
                      fontFamily: 'Consolas, monospace',
                      fontSize: '0.75rem',
                      color: 'text.secondary',
                    }}
                  >
                    {row.address}
                  </TableCell>
                  <TableCell
                    align="center"
                    sx={{
                      fontFamily: 'Consolas, monospace',
                      fontSize: '0.75rem',
                      color: 'text.secondary',
                    }}
                  >
                    {row.size}
                  </TableCell>
                  <TableCell
                    sx={{
                      fontFamily: 'Consolas, monospace',
                      fontSize: '0.7rem',
                      color: 'text.secondary',
                    }}
                  >
                    {formatTimestamp(row.lastUpdated)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
