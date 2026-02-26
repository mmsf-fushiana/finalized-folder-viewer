import { Box } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { SupportedLng } from '../i18n';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const currentLang = i18n.language as SupportedLng;

  const handleLanguageChange = (lng: SupportedLng) => {
    i18n.changeLanguage(lng);
    localStorage.setItem('i18nextLng', lng);
  };

  return (
    <Box
      role="tablist"
      aria-orientation="horizontal"
      sx={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        bgcolor: 'action.hover',
        borderRadius: '50px',
        p: '2px',
      }}
    >
      <Box
        component="button"
        role="tab"
        aria-selected={currentLang === 'ja'}
        tabIndex={currentLang === 'ja' ? 0 : -1}
        onClick={() => handleLanguageChange('ja')}
        sx={{
          border: 'none',
          borderRadius: '50px',
          px: 1,
          py: 0.5,
          fontSize: 11,
          fontWeight: currentLang === 'ja' ? 700 : 400,
          cursor: 'pointer',
          transition: 'all 0.2s',
          bgcolor: currentLang === 'ja' ? 'background.paper' : 'transparent',
          color: currentLang === 'ja' ? 'text.primary' : 'text.secondary',
          '&:hover': {
            opacity: currentLang === 'ja' ? 1 : 0.7,
          },
        }}
      >
        JP
      </Box>
      <Box
        component="button"
        role="tab"
        aria-selected={currentLang === 'en'}
        tabIndex={currentLang === 'en' ? 0 : -1}
        onClick={() => handleLanguageChange('en')}
        sx={{
          border: 'none',
          borderRadius: '50px',
          px: 1,
          py: 0.5,
          fontSize: 11,
          fontWeight: currentLang === 'en' ? 700 : 400,
          cursor: 'pointer',
          transition: 'all 0.2s',
          bgcolor: currentLang === 'en' ? 'background.paper' : 'transparent',
          color: currentLang === 'en' ? 'text.primary' : 'text.secondary',
          '&:hover': {
            opacity: currentLang === 'en' ? 1 : 0.7,
          },
        }}
      >
        ENG
      </Box>
    </Box>
  );
}
