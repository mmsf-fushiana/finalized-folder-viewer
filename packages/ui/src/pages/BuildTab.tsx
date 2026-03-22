import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Box, Button } from "@mui/material";
import { ContentCopyIcon, FileDownloadIcon } from "../components/icons";
import {
  useGameNumber,
  useGameValue,
  useDeckCards,
  useDeckCardsSlotted,
  useDeckCardSummary,
  getNoise,
  getWhiteCards,
  useNoiseCards,
  useNoisedCardHexIds,
  useActiveAbilities,
  useBrotherInfo,
  useSSSInfo,
  getRezonEntry,
  useSupportUse,
  useWarlockWeapon,
  useTagIndices,
  type RezonEntry,
} from "../stores/gameStore";
import { JSheet } from "../components/JSheet";
import { buildHtmlDocument, type HtmlSection } from "../utils/buildHtmlTable";
import { buildMarkdownDocument } from "../utils/buildMarkdownTable";
import { buildOrganizerJson } from "../utils/buildOrganizerJson";

export const palette = [
  "#E39A9A",
  "#D34100",
  "#EBC38A",
  "#EB9A10",
  "#71D3DB",
  "#0082AA",
  "#92E379",
  "#619200",
  "#BABABA",
  "#828282",
];

const SUIT_STYLE: Record<string, { icon: string; bg: string }> = {
  heart: { icon: "♥", bg: "#D34100" },
  diamond: { icon: "♦", bg: "#EB9A10" },
  spade: { icon: "♠", bg: "#0082AA" },
  club: { icon: "♣", bg: "#619200" },
  joker: { icon: "★", bg: "#828282" },
};

const hdr = { fontWeight: "bold" as const, fontSize: 14, userSelect: "text" as const };

const HP_ABILITY_RE = /^ability\.name\.hp(\d+)$/;

function groupNames(
  names: (string | undefined | null)[],
): { name: string; count: number }[] {
  const map = new Map<string, number>();
  for (const n of names) {
    if (!n) continue;
    map.set(n, (map.get(n) ?? 0) + 1);
  }
  return [...map.entries()].map(([name, count]) => ({ name, count }));
}

// 2列テーブル用の共通カラム定義
const COLS_2 = [
  { type: "html" as const, align: "left" as const, width: 240 },
  { align: "right" as const, width: 80 },
];
const COLS_1 = [{ type: "html" as const, align: "left" as const, width: 320 }];
const COLS_2N = [
  { type: "html" as const, align: "left" as const, width: 280 },
  { align: "right" as const, width: 40 },
];
const COLS_SSS = [
  { type: "html" as const, align: "left" as const, width: 160 },
  { type: "html" as const, align: "left" as const, width: 160 },
];

type Version = 'BA' | 'RJ';

export function BuildTab({ version }: { version: Version }) {
  const { t, i18n } = useTranslation();

  // カード名の多言語切替ヘルパー
  const cn = useCallback(
    (card: { name: string; name_en?: string } | null | undefined): string | null =>
      card ? (i18n.language === "en" ? card.name_en || card.name : card.name) : null,
    [i18n.language],
  );
  const deckSummary = useDeckCardSummary();
  const noiseGv = useGameValue("NOISE");
  const wcGv = useGameValue("WHITE_CARDS");
  const noiseCards = useNoiseCards();
  const abilities = useActiveAbilities();
  const bro1 = useBrotherInfo(1);
  const bro2 = useBrotherInfo(2);
  const bro3 = useBrotherInfo(3);
  const bro4 = useBrotherInfo(4);
  const bro5 = useBrotherInfo(5);
  const bro6 = useBrotherInfo(6);
  const sss1 = useSSSInfo(1);
  const sss2 = useSSSInfo(2);
  const sss3 = useSSSInfo(3);
  const sss4 = useSSSInfo(4);
  const sss5 = useSSSInfo(5);
  const sss6 = useSSSInfo(6);
  const myRezonGv = useGameValue("MY_REZON");
  const supportUse = useSupportUse();
  const warlock = useWarlockWeapon();
  const baseHp = useGameNumber("BASE_HP");
  const noisedCardHexIds = useNoisedCardHexIds();

  // REG / TAG1 / TAG2 (すべて CARD配列の 0-based インデックス)
  const deckCards = useDeckCards();
  const deckCardsSlotted = useDeckCardsSlotted();
  const regGv = useGameValue("REG");
  const tagIndices = useTagIndices();

  console.log("tagIndices: ", tagIndices);

  const regIdx = regGv?.value ? parseInt(regGv.value, 16) : -1;

  const cardLabels = useMemo(() => {
    const labels = new Map<string, string[]>();
    const add = (idx: number, label: string) => {
      const name = deckCards[idx]?.name;
      if (!name) return;
      labels.set(name, [...(labels.get(name) ?? []), label]);
    };
    if (regIdx >= 0) add(regIdx, "REG");
    if (tagIndices) {
      add(tagIndices.tag1, "TAG1");
      add(tagIndices.tag2, "TAG2");
    }
    return labels;
  }, [deckCards, regIdx, tagIndices]);

  const myNoise = noiseGv?.value ? getNoise(noiseGv.value) : null;
  const myWC = wcGv?.value ? getWhiteCards(wcGv.value.padStart(8, "0")) : [];
  const brothers = [bro1, bro2, bro3, bro4, bro5, bro6];

  // ブラザー: ノイズ グルーピング
  const broNoises = groupNames(brothers.map((b) => b.noise?.name));

  // ブラザー: ホワイトカード グルーピング
  const broWCGroups = (() => {
    const map = new Map<string, { names: (string | null)[]; count: number }>();
    for (const bro of brothers) {
      const wc = bro.cards.slice(0, 4);
      if (wc.every((c) => c === null)) continue;
      const names = wc.map((c) => cn(c) ?? null);
      const key = names.join("|");
      const existing = map.get(key);
      if (existing) existing.count++;
      else map.set(key, { names, count: 1 });
    }
    return [...map.values()];
  })();

  // ブラザー: メガ/ギガ グルーピング
  const broMegas = groupNames(brothers.map((b) => cn(b.cards[4])));
  const broGigas = groupNames(brothers.map((b) => cn(b.cards[5])));

  // レゾン グルーピング (MY_REZON + ブラザー6)
  const myRezon = myRezonGv?.value ? getRezonEntry(myRezonGv.value) : null;
  const rezonGroups = groupNames([
    myRezon?.name,
    ...brothers.map((b) => b.rezon?.name),
  ]);

  const totalCapacity = abilities.reduce((sum, a) => sum + a.capacity, 0);

  // HP内訳: 既存フックのデータから派生（新しいストア購読なし）
  const hp = useMemo(() => {
    let abilityHp = 0;
    for (const ab of abilities) {
      const m = HP_ABILITY_RE.exec(ab.name);
      if (m) abilityHp += parseInt(m[1], 10);
    }
    const noiseCardHp = noiseCards.effectDetail.hp_plus;
    return {
      baseHp,
      abilityHp,
      noiseCardHp,
      totalHp: baseHp + abilityHp + noiseCardHp,
    };
  }, [baseHp, abilities, noiseCards.effectDetail.hp_plus]);

  // レゾン効果マージ: 既存フックのデータから派生（新しいストア購読なし）
  // 優先順位（低→高）: bro1(L0) → bro2(L1) → bro3(L2) → bro4(R0) → bro5(R1) → bro6(R2) → MY_REZON
  const rezonEffect = useMemo(() => {
    const entries: RezonEntry[] = [];
    for (const bro of brothers) {
      if (bro.rezon) entries.push(bro.rezon);
    }
    if (myRezon) entries.push(myRezon);

    const merged = {
      name: null as string | null,
      chargeShot: null as string | null,
      FField: null as string | null,
      FBarrier: null as string | null,
      attackStar: {} as Record<string, number>,
      finalizeTurn: 0,
      accessLv: 0,
    };
    for (const entry of entries) {
      merged.accessLv += entry.accessLv;
      merged.finalizeTurn += entry.finalizeTurn;
      for (const [attr, count] of Object.entries(entry.attackStar)) {
        merged.attackStar[attr] = (merged.attackStar[attr] ?? 0) + count;
      }
      if (entry.name != null) merged.name = entry.name;
      if (entry.chargeShot != null) merged.chargeShot = entry.chargeShot;
      if (entry.FField != null) merged.FField = entry.FField;
      if (entry.FBarrier != null) merged.FBarrier = entry.FBarrier;
    }
    return merged;
  }, [
    bro1.rezon,
    bro2.rezon,
    bro3.rezon,
    bro4.rezon,
    bro5.rezon,
    bro6.rezon,
    myRezon,
  ]);

  // ─── JSheet 用データ変換 ───────────────────────────────────────

  // チャージショット: 5枚中 cs を持つ最後のカードを採用
  const chargeShotName = useMemo(() => {
    let name: string | null = null;
    for (const card of noiseCards.cards) {
      const ed = card.effectDetail;
      if (ed.cs) {
        name = i18n.language === "en" ? (ed.card_name_en ?? ed.card_name ?? null) : (ed.card_name ?? null);
      }
    }
    return name;
  }, [noiseCards.cards, i18n.language]);

  // ロックマン
  const rockmanData = useMemo<string[][]>(
    () => [
      [myNoise ? t(myNoise.name) : "---", `HP: ${hp.baseHp}`],
      [t("build.support"), supportUse ? t(supportUse) : t("build.supportDefault")],
      [
        warlock ? t(warlock.name) : "---",
        warlock
          ? t("build.warlockStats", { attack: warlock.attack, rapid: warlock.rapid, charge: warlock.charge })
          : "---",
      ],
      [t("build.chargeShot"), chargeShotName ?? t("build.supportDefault")],
    ],
    [myNoise, t, hp.baseHp, supportUse, warlock, chargeShotName],
  );

  // ロックマン: ウォーロック装備セル（B3）に pre-wrap を適用
  const rockmanStyle = useMemo<Record<string, string>>(() => {
    const s: Record<string, string> = {};
    if (warlock) s["B3"] = "white-space: pre-wrap; text-align: right;";
    return s;
  }, [warlock]);

  // フォルダ
  const folderData = useMemo<string[][]>(() => {
    if (deckSummary.length === 0) return [["---", ""]];
    return deckSummary.map((row) => {
      const labels = cardLabels.get(row.card.name);
      const labelHtml =
        labels
          ?.map(
            (l) =>
              `<b style="margin-left:4px;color:${l === "REG" ? "red" : "blue"}">${l}</b>`,
          )
          .join("") ?? "";
      return [(cn(row.card) ?? row.card.name) + labelHtml, String(row.count)];
    });
  }, [deckSummary, cardLabels, cn]);

  // ホワイトカード（1セルに改行で結合）
  const wcData = useMemo<string[][]>(
    () => [[myWC.length > 0 ? myWC.map((card) => cn(card) ?? "---").join("\n") : "---"]],
    [myWC, cn],
  );
  const wcStyle = useMemo<Record<string, string>>(() => {
    const s: Record<string, string> = {};
    if (myWC.length > 1) s["A1"] = "white-space: pre-wrap;";
    return s;
  }, [myWC.length]);

  // ブラザー（ノイズ/WC/メガ/ギガ を1テーブルに結合）
  const [brotherData, brotherStyle] = useMemo<
    [string[][], Record<string, string>]
  >(() => {
    const rows: string[][] = [];
    const style: Record<string, string> = {};

    if (broNoises.length > 0) {
      broNoises.forEach((g) => rows.push([t(g.name), String(g.count)]));
    } else {
      rows.push(["---", ""]);
    }

    if (broWCGroups.length > 0) {
      broWCGroups.forEach((g) => {
        const rowIdx = rows.length + 1; // 1-based
        const names = g.names.map((n) => n ?? "---");
        // 複数名は \n 結合 + pre-wrap でセル内改行
        if (names.length > 1) style[`A${rowIdx}`] = "white-space: pre-wrap;";
        rows.push([names.join("\n"), String(g.count)]);
      });
    } else {
      rows.push(["---", ""]);
    }

    if (broMegas.length > 0) {
      broMegas.forEach((g) => rows.push([g.name, String(g.count)]));
    } else {
      rows.push(["---", ""]);
    }

    if (broGigas.length > 0) {
      broGigas.forEach((g) => rows.push([g.name, String(g.count)]));
    } else {
      rows.push(["---", ""]);
    }

    return [rows, style];
  }, [t, broNoises, broWCGroups, broMegas, broGigas]);

  // SSS (2列 x 3行: 左=slot1-3, 右=slot4-6)
  const sssSlots = [sss1, sss2, sss3, sss4, sss5, sss6];
  const sssCount = sssSlots.filter((s) => s.active).length;
  const formatSSS = (s: typeof sss1) =>
    s.active && s.name && s.group != null && s.level != null
      ? `${s.group}. Lv${s.level} ${t(s.name)}`
      : "";
  const sssData = useMemo<string[][]>(() => {
    const left = [sss1, sss2, sss3];
    const right = [sss4, sss5, sss6];
    const rows: string[][] = [];
    for (let i = 0; i < 3; i++) {
      const l = formatSSS(left[i]);
      const r = formatSSS(right[i]);
      if (l || r) rows.push([l, r]);
    }
    return rows;
  }, [t, sss1, sss2, sss3, sss4, sss5, sss6]);

  // ノイズドカード（背景色付き）
  const [noiseData, noiseStyle] = useMemo<
    [string[][], Record<string, string>]
  >(() => {
    if (noiseCards.cards.length === 0) return [[["---"]], {}];
    const data = noiseCards.cards.map((card) => {
      const s = SUIT_STYLE[card.suit] ?? { icon: "?", bg: "#fff" };
      return [`${s.icon}${card.number || " "} ${t(card.name)}/${t(card.effect)}`];
    });
    const style: Record<string, string> = {};
    noiseCards.cards.forEach((card, i) => {
      const s = SUIT_STYLE[card.suit] ?? { bg: "#fff" };
      style[`A${i + 1}`] = `background-color: ${s.bg}; color: white;`;
    });
    return [data, style];
  }, [noiseCards.cards, t]);

  // アビリティ（合計行を太字）
  const [abilityData, abilityStyle] = useMemo<
    [string[][], Record<string, string>]
  >(() => {
    const data: string[][] = [
      ...abilities.map((ab) => [t(ab.name), String(ab.capacity)]),
      [t("build.total"), String(totalCapacity)],
    ];
    const lastRow = data.length;
    const style: Record<string, string> = {};
    for (let i = 1; i <= lastRow; i++) {
      style[`B${i}`] = "text-align: right;";
    }
    style[`A${lastRow}`] = "font-weight: bold;";
    style[`B${lastRow}`] += " font-weight: bold;";
    return [data, style];
  }, [abilities, totalCapacity, t]);

  // レゾン
  const rezonData = useMemo<string[][]>(
    () =>
      rezonGroups.length > 0
        ? rezonGroups.map((g) => [t("rezon.name." + g.name), String(g.count)])
        : [["---", ""]],
    [rezonGroups, t],
  );

  // レゾン効果（1列: "ラベル 値" を1セルに）
  const rezonEffectData = useMemo<string[][]>(() => {
    const rows: string[][] = [];
    if (rezonEffect.finalizeTurn !== 0)
      rows.push([t("rezon.effect.finalizeTurn", { value: rezonEffect.finalizeTurn })]);
    if (rezonEffect.accessLv !== 0)
      rows.push([t("rezon.effect.accessLv", { value: rezonEffect.accessLv })]);
    const starKeys = ["null", "fire", "aqua", "elec", "wood", "sword", "break"] as const;
    for (const key of starKeys) {
      if ((rezonEffect.attackStar[key] ?? 0) > 0)
        rows.push([t("rezon.effect.attackStar", { type: t("starType." + key), value: rezonEffect.attackStar[key] })]);
    }
    if (rezonEffect.chargeShot != null)
      rows.push([t("rezon.effect.chargeShot", { shot: t("rezon.chargeShot." + rezonEffect.chargeShot) })]);
    if (rezonEffect.FBarrier != null)
      rows.push([t("rezon.effect.FBarrier", { barrier: t("rezon.FBarrier." + rezonEffect.FBarrier) })]);
    if (rezonEffect.FField != null)
      rows.push([t("rezon.effect.FField", { field: t("rezon.FField." + rezonEffect.FField) })]);
    return rows.length > 0 ? rows : [["---"]];
  }, [rezonEffect, t]);

  // ─── コピー処理 ───────────────────────────────────────────────

  const sections = useMemo<HtmlSection[]>(
    () => [
      { title: t("build.rockman"), data: rockmanData, columns: [{ type: "html", align: "left", width: 160 }, { align: "right", width: 160 }], style: rockmanStyle },
      { title: t("build.folder"), data: folderData, columns: COLS_2N, headers: [t("build.header.cardName"), t("build.header.count")] },
      { title: t("build.whiteCard"), data: wcData, columns: COLS_1, style: wcStyle, headers: [t("build.header.cardName")] },
      { title: t("build.brother"), data: brotherData, columns: COLS_2N, style: brotherStyle, headers: [t("build.header.name"), t("build.header.people")] },
      ...(sssCount > 0 ? [{ title: t("build.sss"), data: sssData, columns: COLS_SSS }] : []),
      { title: t("build.noisedCard"), data: noiseData, columns: COLS_1, style: noiseStyle, headers: [t("build.header.card")] },
      { title: t("build.ability"), data: abilityData, columns: COLS_2, style: abilityStyle, headers: [t("build.header.ability"), t("build.header.capacity")] },
      { title: t("build.rezon"), data: rezonData, columns: COLS_2N, headers: [t("build.header.rezon"), t("build.header.people")] },
      { title: t("build.rezonEffect"), data: rezonEffectData, columns: COLS_1, headers: [t("build.header.effect")] },
    ],
    [t, rockmanData, rockmanStyle, folderData, wcData, wcStyle, brotherData, brotherStyle, sssCount, sssData, noiseData, noiseStyle, abilityData, abilityStyle, rezonData, rezonEffectData],
  );

  const handleCopyHtml = useCallback(() => {
    navigator.clipboard.writeText(buildHtmlDocument(sections));
  }, [sections]);

  const handleCopyMarkdown = useCallback(() => {
    navigator.clipboard.writeText(buildMarkdownDocument(sections));
  }, [sections]);

  const handleExportJson = useCallback(() => {
    // 日本語翻訳を固定で取得（Organizer は日本語名ベース）
    const tJa = (key: string) => t(key, { lng: 'ja' });

    const json = buildOrganizerJson({
      version,
      noiseName: myNoise ? tJa(myNoise.name) : '',
      warlockWeaponName: warlock ? tJa(warlock.name) : '',
      deckSlots: deckCardsSlotted.map((c) => c?.name ?? null),
      regSlotIndex: regIdx,
      abilities: abilities.map((ab) => ({
        name: tJa(ab.name),
        capacity: ab.capacity,
      })),
      noisedCardHexIds,
      whiteCardSetHex: wcGv?.value?.padStart(8, '0').slice(-2) ?? '00',
      brothers: brothers.map((bro) => ({
        noiseName: bro.noise ? tJa(bro.noise.name) : '',
        rezonName: bro.rezon ? tJa('rezon.name.' + bro.rezon.name) : '',
        whiteCardSetHex: bro.wcHex.slice(-2),
        megaCardHex: bro.megaCardHex,
        gigaCardHex: bro.gigaCardHex,
      })),
      sssSlots: sssSlots.map((s) => ({ active: s.active, id: s.id })),
      myRezonName: myRezon ? tJa('rezon.name.' + myRezon.name) : '',
      noiseDisplayName: myNoise ? t(myNoise.name) : '',
    });

    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    a.href = url;
    a.download = `build-${version.toLowerCase()}-${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [version, myNoise, warlock, deckCardsSlotted, regIdx, abilities, noisedCardHexIds, wcGv, brothers, sssSlots, myRezon, t]);

  return (
    <Box
      sx={{
        p: 2,
        // pb: 4,
        fontFamily: "Consolas, monospace",
        display: "flex",
        flexDirection: "column",
        gap: 0,
        userSelect: "none",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "flex-start", mb: 1 }}>
        <Box>
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button variant="contained" size="small" startIcon={<ContentCopyIcon />} onClick={handleCopyHtml}>
              {t("build.copyHtml")}
            </Button>
            <Button variant="contained" size="small" startIcon={<ContentCopyIcon />} onClick={handleCopyMarkdown}>
              {t("build.copyMarkdown")}
            </Button>
          </Box>
          <Box sx={{ fontSize: 11, color: "#aaa", mt: 0.5 }}>
            {t("build.tableHint")}
          </Box>
        </Box>
        <Box sx={{ flex: 1 }} />
        <Box sx={{ textAlign: "right" }}>
          <Button variant="contained" size="small" startIcon={<FileDownloadIcon />} onClick={handleExportJson}>
            {t("build.exportJson")}
          </Button>
          <Box
            sx={{ fontSize: 13, mt: 0.5, color: "#88f", cursor: "pointer", "&:hover": { textDecoration: "underline" } }}
            onClick={() => {
              const url = "https://mmsf-perfect-battle-organizer.vercel.app/builds";
              if ((window as any).electronAPI?.openExternal) {
                (window as any).electronAPI.openExternal(url);
              } else {
                window.open(url, "_blank", "noopener,noreferrer");
              }
            }}
          >
            {t("build.organizerLink")}
          </Box>
        </Box>
      </Box>

      <Box sx={{ display: "flex", justifyContent: "center" }}>
        <Box sx={{ display: "flex", gap: 3, boxShadow: 3, borderRadius: 2, p: 2 }}>
          {/* 左カラム: ロックマン〜ブラザー */}
          <Box sx={{ flex: "0 0 auto" }}>
            <div style={hdr}>{t("build.rockman")}</div>
            <JSheet
              data={rockmanData}
              columns={[
                { type: "html", align: "left", width: 160 },
                { align: "right", width: 160 },
              ]}
              style={rockmanStyle}
              initialSelection="A1"
            />

            <div style={hdr}>{t("build.folder")}</div>
            <JSheet data={folderData} columns={COLS_2N} />

            <div style={hdr}>{t("build.whiteCard")}</div>
            <JSheet data={wcData} columns={COLS_1} style={wcStyle} />

            <div style={hdr}>{t("build.brother")}</div>
            <JSheet data={brotherData} columns={COLS_2N} style={brotherStyle} />

            {sssCount > 0 && (
              <>
                <div style={hdr}>{t("build.sss")}</div>
                <JSheet data={sssData} columns={COLS_SSS} />
              </>
            )}
          </Box>

          {/* 右カラム: ノイズドカード〜レゾン効果 */}
          <Box sx={{ flex: "0 0 auto" }}>
            <div style={hdr}>{t("build.noisedCard")}</div>
            <JSheet data={noiseData} columns={COLS_1} style={noiseStyle} />

            <div style={hdr}>{t("build.ability")}</div>
            <JSheet data={abilityData} columns={COLS_2} style={abilityStyle} />

            <div style={hdr}>{t("build.rezon")}</div>
            <JSheet data={rezonData} columns={COLS_2N} />

            <div style={hdr}>{t("build.rezonEffect")}</div>
            <JSheet data={rezonEffectData} columns={COLS_1} />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
