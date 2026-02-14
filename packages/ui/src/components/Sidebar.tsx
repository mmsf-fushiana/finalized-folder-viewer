import { Box, Autocomplete, TextField, Button, Typography, Radio, Chip, InputAdornment, Card as MuiCard } from '@mui/material';
import { Search } from '@mui/icons-material';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Card, FinalizationData } from '../types';
import { TYPE_IMAGES, VERSION_COLORS } from '../types';
import { getCardOrder } from '../data';
import { useMemo, useState } from 'react';

interface SidebarProps {
  finalizationData: FinalizationData;
}

type LevelKey = 'LV1' | 'LV2' | 'LV3' | 'LV4' | 'LV5' | 'LV6' | 'LV7' | 'LV8' | 'LV9' | 'LV10' | 'LV11' | 'LV12';

const ALL_TYPES = ['無', '電気', '火', '水', '木', '風', 'ソード', 'ブレイク'] as const;

function getUniqueCards(data: FinalizationData | null | undefined): Card[] {
  if (!data) return [];

  const cardMap = new Map<string, Card>();
  const versions = ['BA', 'RJ'] as const;
  const levels: LevelKey[] = ['LV1', 'LV2', 'LV3', 'LV4', 'LV5', 'LV6', 'LV7', 'LV8', 'LV9', 'LV10', 'LV11', 'LV12'];

  versions.forEach((version) => {
    levels.forEach((level) => {
      const cards = data?.[version]?.[level];
      cards?.forEach((card) => {
        if (card?.name && !cardMap.has(card.name)) {
          cardMap.set(card.name, card);
        }
      });
    });
  });

  return Array.from(cardMap.values()).sort((a, b) =>
    getCardOrder(a.name) - getCardOrder(b.name)
  );
}

export function Sidebar({ finalizationData }: SidebarProps) {
  const { t, i18n } = useTranslation();
  const { version: currentVersion, level: currentLevel } = useParams<{
    version: string;
    level: string;
  }>();
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  const uniqueCards = useMemo(
    () => getUniqueCards(finalizationData),
    [finalizationData]
  );

  const handleTypeSelect = (type: string) => {
    if (selectedType === type) {
      setSelectedType(null);
    } else {
      setSelectedType(type);
      setSelectedCard(null);
    }
  };

  const handleCardSelect = (_: unknown, card: Card | null) => {
    setSelectedCard(card);
    if (card) {
      setSelectedType(null);
    }
  };

  const isFilterActive = selectedType !== null || selectedCard !== null;

  const getHitCount = (version: 'BA' | 'RJ', lv: number): number => {
    const levelKey = `LV${lv}` as LevelKey;
    const cards = finalizationData?.[version]?.[levelKey] ?? [];

    if (selectedType) {
      return cards.filter(card => card?.types?.includes(selectedType)).length;
    }
    if (selectedCard) {
      return cards.filter(card => card?.name === selectedCard.name).length;
    }
    return 0;
  };

  const levels = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <Box
      sx={{
        width: 320,
        flexShrink: 0,
        borderRight: 1,
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        pt: 1,
      }}
    >
      {/* Search & Filter Section */}
      <MuiCard sx={{ m: 1, p: 2 }} variant="outlined">
        <Autocomplete
          options={uniqueCards}
          getOptionLabel={(option) => i18n.language === 'en' ? (option.name_en || option.name) : option.name}
          value={selectedCard}
          onChange={handleCardSelect}
          renderInput={(params) => (
            <TextField
              {...params}
              label={t('search.placeholder')}
              size="small"
              onFocus={() => {
                if (selectedType !== null) {
                  setSelectedType(null);
                }
              }}
              slotProps={{
                inputLabel: { sx: { fontSize: 12 } },
                input: {
                  ...params.InputProps,
                  sx: { fontSize: 12 },
                  startAdornment: (
                    <InputAdornment position="start" sx={{ mr: -0.5 }}>
                      <Search sx={{ fontSize: 18, color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                },
              }}
            />
          )}
          slotProps={{
            listbox: { sx: { '& .MuiAutocomplete-option': { fontSize: 12 } } },
          }}
          sx={{ mb: 2 }}
        />
        {/* <Chip
          label="属性フィルタ"
          size="small"
          sx={{
            mb: 1,
            fontSize: 11,
            bgcolor: 'rgb(90, 70, 100)',
            color: 'white',
            // fontWeight: 'bold',
            // letterSpacing: '0.05em',
          }}
        /> */}

        <Typography variant="caption" sx={{ display: 'block', mb: 1, color: 'text.secondary' }}>
          {t('filter.byAttribute')}
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {ALL_TYPES.map((type) => (
            <Box
              key={type}
              onClick={() => handleTypeSelect(type)}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                width: 30,
                cursor: 'pointer',
                '&:hover': { opacity: 0.8 },
              }}
            >
              <Box
                component="img"
                src={TYPE_IMAGES[type]}
                alt={type}
                sx={{
                  width: 18,
                  height: 18,
                  opacity: selectedType === type ? 1 : 0.3,
                  mb: 0.5,
                }}
              />
              <Radio
                size="small"
                checked={selectedType === type}
                sx={{ p: 0, '& .MuiSvgIcon-root': { fontSize: 16 } }}
              />
            </Box>
          ))}
        </Box>
      </MuiCard>

      {/* Level Buttons Section */}
      <Box sx={{ flex: 1, overflow: 'auto', mt: 1, px: 2 }}>
        <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
          <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <Chip
              label="Black Ace"
              size="small"
              sx={{
                bgcolor: VERSION_COLORS.BA,
                color: 'white',
                fontWeight: 'bold',
                fontSize: 11,
                letterSpacing: '0.1em',
              }}
            />
          </Box>
          <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <Chip
              label="Red Joker"
              size="small"
              sx={{
                bgcolor: VERSION_COLORS.RJ,
                color: 'white',
                fontWeight: 'bold',
                fontSize: 11,
                letterSpacing: '0.1em',
              }}
            />
          </Box>
        </Box>
        {levels.map((lv) => {
          const baCount = isFilterActive ? getHitCount('BA', lv) : null;
          const rjCount = isFilterActive ? getHitCount('RJ', lv) : null;
          const baDisabled = baCount === 0;
          const rjDisabled = rjCount === 0;

          return (
            <Box key={lv} sx={{ display: 'flex', gap: 2, mb: 1 }}>
              <Button
                component={baDisabled ? 'button' : Link}
                to={baDisabled ? undefined : `/BA/${lv}`}
                disabled={baDisabled}
                variant={
                  currentVersion === 'BA' && currentLevel === String(lv)
                    ? 'contained'
                    : 'outlined'
                }
                size="small"
                sx={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 11,
                  textTransform: 'none',
                  borderColor: VERSION_COLORS.BA,
                  color: currentVersion === 'BA' && currentLevel === String(lv)
                    ? 'white'
                    : VERSION_COLORS.BA,
                  bgcolor: currentVersion === 'BA' && currentLevel === String(lv)
                    ? VERSION_COLORS.BA
                    : 'transparent',
                  '&:hover': {
                    borderColor: VERSION_COLORS.BA,
                    bgcolor: VERSION_COLORS.BA,
                    color: 'white',
                  },
                  '&.Mui-disabled': {
                    borderColor: 'grey.300',
                    color: 'grey.400',
                  },
                }}
              >
                Lv. {lv}{baCount && baCount > 0 ? ` (${baCount})` : ''}
              </Button>
              <Button
                component={rjDisabled ? 'button' : Link}
                to={rjDisabled ? undefined : `/RJ/${lv}`}
                disabled={rjDisabled}
                variant={
                  currentVersion === 'RJ' && currentLevel === String(lv)
                    ? 'contained'
                    : 'outlined'
                }
                size="small"
                sx={{
                  flex: 1,
                  minWidth: 0,
                  textTransform: 'none',
                  borderColor: VERSION_COLORS.RJ,
                  color: currentVersion === 'RJ' && currentLevel === String(lv)
                    ? 'white'
                    : VERSION_COLORS.RJ,
                  bgcolor: currentVersion === 'RJ' && currentLevel === String(lv)
                    ? VERSION_COLORS.RJ
                    : 'transparent',
                  '&:hover': {
                    borderColor: VERSION_COLORS.RJ,
                    bgcolor: VERSION_COLORS.RJ,
                    color: 'white',
                  },
                  '&.Mui-disabled': {
                    borderColor: 'grey.300',
                    color: 'grey.400',
                  },
                }}
              >
                Lv.{lv}{rjCount && rjCount > 0 ? ` (${rjCount})` : ''}
              </Button>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}