import { Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { Card } from '../types';
import { TYPE_IMAGES } from '../types';

const cardImageUrl = (filename: string) =>
  `${import.meta.env.BASE_URL ?? '/'}card_images/${filename}`;

function getCardNameBgColor(card: Card): string {
  if (card.class === 'mega') return '#6fb0f4';
  if (card.class === 'giga') return '#f78598';
  return 'white';
}

export type AttackInfo = { attack: number; boosted: boolean };
export type GetAttackFn = (card: Card) => AttackInfo;

interface CardGridProps {
  cards: Card[];
  getAttack?: GetAttackFn;
}

function CardCell({ card, attackInfo, lang }: { card: Card; attackInfo: AttackInfo; lang: string }) {
  if (!card) return null;
  const typeIcons = (card.types ?? []).map((type) => TYPE_IMAGES[type]).filter(Boolean);
  const cardName = lang === 'en' ? (card.name_en || card.name) : card.name;

  return (
    <Box sx={{ textAlign: 'center' }}>
      <Box
        sx={{
          width: 90,
          height: 68,
          bgcolor: 'black',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Box
          component="img"
          src={cardImageUrl(card.image_url)}
          alt={card.name ?? ''}
          sx={{
            height: 68,
            width: 'auto',
            maxWidth: 90,
            objectFit: 'contain',
          }}
        />
      </Box>
      <Box
        sx={{
          width: 90,
          bgcolor: 'black',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 0.5,
          py: 0.25,
        }}
      >
        <Typography
          variant="caption"
          sx={{
            color: attackInfo.boosted ? '#ff4444' : 'white',
            fontSize: '11px',
            fontWeight: 'bold',
          }}
        >
          {attackInfo.attack || '\u00A0'}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.25 }}>
          {typeIcons.map((icon, idx) => (
            <Box
              key={idx}
              component="img"
              src={icon}
              alt=""
              sx={{ width: 14, height: 14 }}
            />
          ))}
        </Box>
      </Box>
      <Typography
        variant="caption"
        sx={{
          display: 'block',
          width: 90,
          height: 27,
          fontSize: '10px',
          lineHeight: 1.2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          border: '1px solid black',
          bgcolor: getCardNameBgColor(card),
        }}
      >
        {cardName}
      </Typography>
    </Box>
  );
}

const defaultGetAttack: GetAttackFn = (card) => ({ attack: card.attack, boosted: false });

export function CardGrid({ cards, getAttack = defaultGetAttack }: CardGridProps) {
  const { t, i18n } = useTranslation();
  const minWidth = 89 * 5; // 5 columns

  if (!cards || cards.length === 0) {
    return (
      <Box sx={{ minWidth, minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.secondary' }}>
        {t('card.empty')}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 89px)',
        minWidth,
        // gap: 1,
      }}
    >
      {cards.map((card, index) => (
        <CardCell
          key={`${card?.id ?? index}-${index}`}
          card={card}
          attackInfo={getAttack(card)}
          lang={i18n.language}
        />
      ))}
    </Box>
  );
}
