import { useState, useMemo, useEffect } from 'react';
import { Box, Typography, Paper, Chip, IconButton, Tooltip, Rating } from '@mui/material';
import { ChevronLeft, ChevronRight } from '@mui/icons-material';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Card, GalaxyAdvance, Version, Level } from '../types';
import { TYPE_COLORS, TYPE_IMAGES, VERSION_COLORS } from '../types';
import { TYPE_KEY_MAP } from '../i18n';
import { CardGrid } from './CardGrid';
import { getNoiseRangeForLevel } from '../utils/noiseLevel';
import { getCardOrder } from '../data';

// 風以外の属性（Rating対象）
const RATING_TYPES = ['無', '電気', '火', '水', '木', 'ソード', 'ブレイク'] as const;
type RatingType = typeof RATING_TYPES[number];
type TypeRatings = Record<RatingType, number>;

interface FolderViewProps {
  version: Version;
  level: Level;
  cards: Card[];
  gaList: GalaxyAdvance[];
}

const ALL_TYPES = ['無', '電気', '火', '水', '木', '風', 'ソード', 'ブレイク'] as const;

interface TypeStatsProps {
  cards: Card[];
  selectedTypes: Set<string>;
  onTypeClick: (type: string) => void;
}

function TypeStats({ cards, selectedTypes, onTypeClick }: TypeStatsProps) {
  const { t } = useTranslation();
  if (!cards) return null;

  // Count all types including 0
  const typeCounts: Record<string, number> = {};
  ALL_TYPES.forEach(type => {
    typeCounts[type] = 0;
  });

  cards.forEach((card) => {
    (card?.types ?? []).forEach((type) => {
      if (typeCounts[type] !== undefined) {
        typeCounts[type] += 1;
      }
    });
  });

  const maxCount = Math.max(...Object.values(typeCounts), 1);
  const hasSelection = selectedTypes.size > 0;

  // 8 bars × 15px + 7 gaps × 16px + padding 24px = 256px
  const statsWidth = 256;

  return (
    <Paper elevation={2} sx={{ p: 1.5, borderRadius: 2, width: statsWidth }}>
      <Typography variant="subtitle2" gutterBottom>
        {t('typeStats.title')}
      </Typography>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 100 }}>
        {ALL_TYPES.map((type) => {
          const count = typeCounts[type] || 0;
          const height = maxCount > 0 ? (count / maxCount) * 60 : 0;
          const isSelected = selectedTypes.has(type);
          const isActive = !hasSelection || isSelected;

          return (
            <Tooltip
              key={type}
              title={isSelected
                ? t('typeStats.clearFilter', { type: t(`type.${TYPE_KEY_MAP[type]}`) })
                : t('typeStats.filter', { type: t(`type.${TYPE_KEY_MAP[type]}`) })
              }
              arrow
              placement="top"
            >
              <Box
                onClick={() => onTypeClick(type)}
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  width: 15,
                  cursor: 'pointer',
                  opacity: isActive ? 1 : 0.3,
                  transition: 'opacity 0.2s',
                  '&:hover': {
                    opacity: isActive ? 1 : 0.6,
                  },
                }}
              >
                {/* Bar */}
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', width: '100%', pt: 1 }}>
                  {count > 0 && (
                    <Box
                      sx={{
                        height,
                        bgcolor: TYPE_COLORS[type] || 'grey.500',
                        borderRadius: '2px 2px 0 0',
                        width: '100%',
                        transition: 'height 0.3s ease',
                      }}
                    />
                  )}
                </Box>
                {/* Icon */}
                <Box
                  component="img"
                  src={TYPE_IMAGES[type]}
                  alt={type}
                  sx={{ width: 16, height: 16, mt: 0.5 }}
                />
                {/* Count */}
                <Typography variant="caption" sx={{ fontSize: 10, textAlign: 'center' }}>
                  {count}
                </Typography>
              </Box>
            </Tooltip>
          );
        })}
      </Box>
    </Paper>
  );
}

const CLASS_ITEMS = ['standard', 'mega', 'giga', 'nfb'] as const;

const CLASS_COLORS: Record<string, string> = {
  standard: '#F5A623',
  mega: '#4A90D9',
  giga: '#E85D75',
  nfb: '#7B8A8E',
};

function ClassStats({ cards }: { cards: Card[] }) {
  const { t } = useTranslation();
  if (!cards) return null;

  const classCounts: Record<string, number> = { standard: 0, mega: 0, giga: 0, nfb: 0 };
  cards.forEach((card) => {
    if (card.class === 'standard' && card.id) {
      classCounts.standard++;
    } else if (card.class === 'standard') {
      classCounts.nfb++;
    } else if (card.class === 'mega') {
      classCounts.mega++;
    } else if (card.class === 'giga') {
      classCounts.giga++;
    }
  });

  const maxCount = Math.max(...Object.values(classCounts), 1);

  return (
    <Paper elevation={2} sx={{ p: 1.5, borderRadius: 2, width: 256 }}>
      <Typography variant="subtitle2" gutterBottom>
        {t('classStats.title')}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {CLASS_ITEMS.map((cls) => {
          const count = classCounts[cls] || 0;
          const barWidth = maxCount > 0 ? (count / maxCount) * 100 : 0;
          return (
            <Box key={cls} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" sx={{ minWidth: 72, fontSize: 11, flexShrink: 0, textAlign: 'left' }}>
                {t(`classStats.${cls}`)}
              </Typography>
              <Box sx={{ flex: 1, position: 'relative', height: 8, bgcolor: 'grey.200', borderRadius: 1, overflow: 'hidden' }}>
                {count > 0 && (
                  <Box
                    sx={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      height: '100%',
                      width: `${barWidth}%`,
                      bgcolor: CLASS_COLORS[cls],
                      borderRadius: 1,
                      transition: 'width 0.3s ease',
                    }}
                  />
                )}
              </Box>
              <Typography variant="caption" sx={{ width: 24, fontSize: 11, flexShrink: 0, textAlign: 'left' }}>
                {count}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
}

function findAvailableGA(cards: Card[], gaList: GalaxyAdvance[]) {
  if (!cards || !gaList) return [];

  const cardNameCounts: Record<string, number> = {};
  cards.forEach((card) => {
    const name = card?.name_en;
    if (name) {
      cardNameCounts[name] = (cardNameCounts[name] || 0) + 1;
    }
  });

  const availableGAs: { ga: GalaxyAdvance; sourceCards: Card[] }[] = [];

  // Create a map of english name to japanese name for lookup
  const nameMap = new Map<string, Card>();
  cards.forEach(card => {
    if (card?.name_en) {
      nameMap.set(card.name_en, card);
    }
  });

  gaList.forEach((ga) => {
    if (!ga?.source_cards) return;

    const sourceCounts: Record<string, number> = {};
    ga.source_cards.forEach((source) => {
      sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    });

    let canMake = true;
    for (const [source, needed] of Object.entries(sourceCounts)) {
      if ((cardNameCounts[source] || 0) < needed) {
        canMake = false;
        break;
      }
    }

    if (canMake) {
      // Get Japanese names for source cards
      const sourceCardsWithData = ga.source_cards.map(name => nameMap.get(name)).filter(Boolean) as Card[];
      availableGAs.push({ ga, sourceCards: sourceCardsWithData });
    }
  });

  return availableGAs;
}

interface SnapRatingProps {
  value: number;
  onChange: (value: number) => void;
}


// 自作スナップRatingコンポーネント
function SnapRating({ value, onChange }: SnapRatingProps) {
  const [hoverIndex, setHoverIndex] = useState<number>(-1);

  // クリック時のスナップ値を計算
  const getSnappedValue = (idx: number): number => {
    if (idx === 0) return 0;      // 1番目 → 0
    if (idx <= 2) return 3;       // 2-3番目 → 3
    return 6;                      // 4-6番目 → 6
  };

  const handleClick = (idx: number) => {
    const newValue = getSnappedValue(idx);
    // 同じ値をクリックしたら0にリセット
    onChange(newValue === value ? 0 : newValue);
  };

  // hover中のスナップ範囲を取得
  const hoverSnapped = hoverIndex === -1 ? 0 : getSnappedValue(hoverIndex);

  return (
    <Box
      sx={{ display: 'flex', gap: 0.25 }}
      onMouseLeave={() => setHoverIndex(-1)}
    >
      {[0, 1, 2, 3, 4, 5].map((idx) => {
        const filled = idx < value; // 実際の値のみで色を決定
        const isInHoverRange = hoverIndex !== -1 && idx < hoverSnapped;
        return (
          <Box
            key={idx}
            onMouseEnter={() => setHoverIndex(idx)}
            onClick={() => handleClick(idx)}
            sx={{
              width: 14,
              height: 14,
              cursor: 'pointer',
              color: filled ? '#faaf00' : '#e0e0e0',
              fontSize: 14,
              lineHeight: 1,
              userSelect: 'none',
              transition: 'transform 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
              transform: isInHoverRange ? 'scale(1.3)' : 'scale(1)',
            }}
          >
            ★
          </Box>
        );
      })}
    </Box>
  );
}

interface AttributeRatingProps {
  ratings: TypeRatings;
  onRatingChange: (type: RatingType, value: number) => void;
}

function AttributeRating({ ratings, onRatingChange }: AttributeRatingProps) {
  const { t } = useTranslation();
  return (
    <Paper elevation={2} sx={{ p: 1.5, borderRadius: 2, width: 256 }}>
      <Typography variant="subtitle2" gutterBottom>
        {t('attackStar.title')}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {RATING_TYPES.map((type) => (
          <Box
            key={type}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <Box
              component="img"
              src={TYPE_IMAGES[type]}
              alt={type}
              sx={{ width: 18, height: 18 }}
            />
            <Typography variant="body2" sx={{ width: 60, fontSize: 12 }}>
              {t(`type.${TYPE_KEY_MAP[type]}`)}
            </Typography>
            <SnapRating
              value={ratings[type]}
              onChange={(v) => onRatingChange(type, v)}
            />
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

function GAList({
  cards,
  gaList,
}: {
  cards: Card[];
  gaList: GalaxyAdvance[];
}) {
  const { t, i18n } = useTranslation();
  if (!cards || !gaList) return null;

  const availableGAs = findAvailableGA(cards, gaList);

  return (
    <Paper elevation={2} sx={{ p: 1.5, borderRadius: 2, width: 256 }}>
      <Typography variant="subtitle2" gutterBottom>
        {t('ga.title')} ({availableGAs.length})
      </Typography>
      {availableGAs.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t('ga.empty')}
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {availableGAs.map(({ ga, sourceCards }, idx) => {
            // Count occurrences for display
            const cardCounts = new Map<string, { card: Card; count: number }>();
            sourceCards.forEach(card => {
              const existing = cardCounts.get(card.name);
              if (existing) {
                existing.count++;
              } else {
                cardCounts.set(card.name, { card, count: 1 });
              }
            });

            return (
              <Box key={idx} sx={{ p: 1, bgcolor: 'grey.100', borderRadius: 1 }}>
                <Typography variant="body2" fontWeight="bold">
                  {i18n.language === 'en' ? (ga.name_en || ga.name) : ga.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {Array.from(cardCounts.values())
                    .map(({ card, count }) => {
                      const cardName = i18n.language === 'en' ? (card.name_en || card.name) : card.name;
                      return count > 1 ? `${cardName} x${count}` : cardName;
                    })
                    .join(' + ')}
                </Typography>
              </Box>
            );
          })}
        </Box>
      )}
    </Paper>
  );
}

const initialRatings: TypeRatings = {
  '無': 0, '電気': 0, '火': 0, '水': 0, '木': 0, 'ソード': 0, 'ブレイク': 0,
};

// カードの有効攻撃力を計算
function getEffectiveAttack(card: Card, ratings: TypeRatings): { attack: number; boosted: boolean } {
  if (!card.types || card.types.length === 0) {
    return { attack: card.attack, boosted: false };
  }

  // カードの属性に対応するRatingの合計（風は除外）
  const totalRating = card.types
    .filter((t): t is RatingType => RATING_TYPES.includes(t as RatingType))
    .reduce((sum, type) => sum + ratings[type], 0);

  // 最大6でキャップ
  const effectiveRating = Math.min(totalRating, 6);

  if (effectiveRating >= 6 && card.attack3) {
    return { attack: card.attack3, boosted: true };
  } else if (effectiveRating >= 3 && card.attack2) {
    return { attack: card.attack2, boosted: true };
  }
  return { attack: card.attack, boosted: false };
}

export function FolderView({ version, level, cards, gaList }: FolderViewProps) {
  const { t } = useTranslation();
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [typeRatings, setTypeRatings] = useState<TypeRatings>(initialRatings);

  // Reset selection when page changes
  useEffect(() => {
    setSelectedTypes(new Set());
  }, [version, level]);

  const handleRatingChange = (type: RatingType, value: number) => {
    setTypeRatings(prev => ({ ...prev, [type]: value }));
  };

  const handleTypeClick = (type: string) => {
    setSelectedTypes(prev => {
      const newSet = new Set(prev);

      if (prev.size === 0) {
        // 未選択状態 → その属性のみ選択
        newSet.add(type);
      } else if (prev.has(type)) {
        // 選択済みの属性をクリック
        if (prev.size === 1) {
          // 1つしか選択されていない場合 → 未選択状態に戻す
          newSet.clear();
        } else {
          // 複数選択されている場合 → その属性を解除
          newSet.delete(type);
        }
      } else {
        // 未選択の属性をクリック → 追加
        newSet.add(type);
      }

      return newSet;
    });
  };

  // Sort cards: 1) standard with id, 2) mega + GA-named, 3) others, each by card_list.json order
  const sortedCards = useMemo(() => {
    if (!cards) return [];
    const getGroup = (card: Card): number => {
      if (card.class === 'standard' && card.id) return 0;
      if (card.class === 'mega' || card.name.endsWith('GA')) return 1;
      return 2;
    };
    return [...cards].sort((a, b) => {
      const diff = getGroup(a) - getGroup(b);
      if (diff !== 0) return diff;
      return getCardOrder(a.name) - getCardOrder(b.name);
    });
  }, [cards]);

  const filteredCards = useMemo(() => {
    if (selectedTypes.size === 0) return sortedCards;

    return sortedCards.filter(card =>
      card.types?.some(type => selectedTypes.has(type))
    );
  }, [sortedCards, selectedTypes]);

  // Attack calculation function for CardGrid
  const getAttack = useMemo(() => {
    return (card: Card) => getEffectiveAttack(card, typeRatings);
  }, [typeRatings]);

  if (!cards) {
    return <Typography color="error">{t('card.noData')}</Typography>;
  }

  const prevLevel = level > 1 ? level - 1 : null;
  const nextLevel = level < 12 ? level + 1 : null;

  // ノイズ率の範囲を取得
  const noiseRange = getNoiseRangeForLevel(level);
  const noiseRangeLabel = noiseRange === 'Over'
    ? 'over'
    : noiseRange.min === noiseRange.max
      ? `${noiseRange.min}%`
      : `${noiseRange.min}~${noiseRange.max}%`;

  return (
    <Box sx={{p: 2, pl: 3}}>
      {/* Header with navigation */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>

        {/* Navigation with fixed width container to prevent shifting */}
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Box sx={{ width: 32, visibility: prevLevel ? 'visible' : 'hidden' }}>
            <IconButton
              component={Link}
              to={`/${version}/${prevLevel ?? 1}`}
              size="small"
            >
              <ChevronLeft />
            </IconButton>
          </Box>

          {/* Level info container */}
          <Box sx={{ mx: 1, width: 168, display: 'flex', alignItems: 'center', gap: 1, bgcolor: "white" }}>
            <Chip
              label={version}
              size="small"
              sx={{
                bgcolor: VERSION_COLORS[version],
                color: 'white',
                fontWeight: "bold",
                fontSize: 12,
                letterSpacing: '0.12em',
                width: 36
              }}
            />
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Typography variant="h6">Lv.&nbsp;</Typography>
              <Typography variant="h6" sx={{ width: 20, textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>
                {level}
              </Typography>
            </Box>
            <Chip
              label={noiseRangeLabel}
              size="small"
              sx={{
                bgcolor: '#d50000',
                color: 'white',
                fontSize: 11,
                height: 20,
                letterSpacing: '0.09em',
                borderRadius: 1,
                '& .MuiChip-label': {
                  px: 0.5,
                },
              }}
            />
          </Box>

          <Box sx={{ width: 32, visibility: nextLevel ? 'visible' : 'hidden' }}>
            <IconButton
              component={Link}
              to={`/${version}/${nextLevel ?? 12}`}
              size="small"
            >
              <ChevronRight />
            </IconButton>
          </Box>
        </Box>
      </Box>

      {/* Main content: cards on left, stats on right */}
      <Box sx={{ display: 'flex', gap: 3 }}>
        {/* Card Grid */}
        <Box sx={{ flexShrink: 0 }}>
          <CardGrid cards={filteredCards} getAttack={getAttack} />
        </Box>

        {/* Stats panel */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, width: 256 }}>
          <TypeStats
            cards={cards}
            selectedTypes={selectedTypes}
            onTypeClick={handleTypeClick}
          />
          <ClassStats cards={cards} />
          <AttributeRating
            ratings={typeRatings}
            onRatingChange={handleRatingChange}
          />
          <GAList cards={cards} gaList={gaList ?? []} />
        </Box>
      </Box>
    </Box>
  );
}
