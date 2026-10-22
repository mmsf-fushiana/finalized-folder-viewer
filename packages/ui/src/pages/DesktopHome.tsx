import { useTranslation } from 'react-i18next';
import { Box, Link, Step, StepLabel, Stepper, Typography } from '@mui/material';
import { usePipeStatus, useRomLoaded, useRomFile } from '../stores/gameStore';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

/**
 * 待機画面。
 * gameAPI の購読と、流星3 検出時の /monitor/<版> への遷移は useRomNavigator (DesktopLayout) が行うので、
 * ここは「melonDS 起動待ち → 流星3 の ROM 読み込み待ち」の状態表示だけを持つ。
 */
export function DesktopHome() {
  const { t } = useTranslation();

  const pipeConnected = usePipeStatus();
  const romLoaded = useRomLoaded();
  const romFile = useRomFile();

  // Stepper: 0=エミュレータ接続待ち, 1=流星3 ROM 読み込み待ち
  const activeStep = !pipeConnected ? 0 : 1;

  const steps = [t('monitor.step.connect'), t('monitor.step.detect')];

  let hintMessage: string;
  if (!pipeConnected) {
    hintMessage = t('monitor.startDS');
  } else if (!romLoaded) {
    hintMessage = t('monitor.startGame');
  } else {
    // ROM は読まれているが流星3 ではない (流星3 なら useRomNavigator が既に遷移している)
    hintMessage = romFile ? t('monitor.wrongRom', { file: romFile }) : t('monitor.unknownRom');
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        pt: 5,
        gap: 4,
        position: 'relative',
      }}
    >
      <Box sx={{ position: 'absolute', top: 8, right: 8 }}>
        <LanguageSwitcher />
      </Box>
      <Typography variant="h4" fontWeight="bold">
        {t('monitor.title')}
      </Typography>

      <Stepper
        activeStep={activeStep}
        alternativeLabel
        sx={{
          width: '100%',
          maxWidth: 480,
          '& .MuiStepLabel-label': {
            fontSize: '0.75rem',
            color: 'text.secondary',
          },
        }}
      >
        {steps.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      <Typography variant="body2" color="error">
        {hintMessage}
      </Typography>

      <Link
        component="button"
        onClick={() => {
          const url = 'https://mmsf-fushiana.github.io/finalized-folder-viewer/';
          if (window.electronAPI?.openExternal) {
            window.electronAPI.openExternal(url);
          } else {
            window.open(url, '_blank', 'noopener,noreferrer');
          }
        }}
        variant="body2"
        color="text.secondary"
        sx={{ mt: 2 }}
      >
        {t('monitor.openWebViewer')}
      </Link>
    </Box>
  );
}
