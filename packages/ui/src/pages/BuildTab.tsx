import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Box, Button } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import {
  useGameNumber,
  useGameValue,
  useDeckCards,
  useDeckCardSummary,
  getNoise,
  getWhiteCards,
  useNoiseCards,
  useActiveAbilities,
  useBrotherInfo,
  getRezonEntry,
  useSupportUse,
  useWarlockWeapon,
  useTagIndices,
  type RezonEntry,
} from "../stores/gameStore";
import { JSheet } from "../components/JSheet";
import { buildHtmlDocument, type HtmlSection } from "../utils/buildHtmlTable";
import { buildMarkdownDocument } from "../utils/buildMarkdownTable";

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

const hdr = { fontWeight: "bold" as const, fontSize: 14, margin: "12px 0 4px" };

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
  { type: "html" as const, align: "left" as const, width: 340 },
  { align: "right" as const, width: 80 },
];
const COLS_1 = [{ type: "html" as const, align: "left" as const, width: 420 }];

export function BuildTab() {
  const { t } = useTranslation();
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
  const myRezonGv = useGameValue("MY_REZON");
  const supportUse = useSupportUse();
  const warlock = useWarlockWeapon();
  const baseHp = useGameNumber("BASE_HP");

  // REG / TAG1 / TAG2 (すべて CARD配列の 0-based インデックス)
  const deckCards = useDeckCards();
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
      const names = wc.map((c) => c?.name ?? null);
      const key = names.join("|");
      const existing = map.get(key);
      if (existing) existing.count++;
      else map.set(key, { names, count: 1 });
    }
    return [...map.values()];
  })();

  // ブラザー: メガ/ギガ グルーピング
  const broMegas = groupNames(brothers.map((b) => b.cards[4]?.name));
  const broGigas = groupNames(brothers.map((b) => b.cards[5]?.name));

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

  // ロックマン
  const rockmanData = useMemo<string[][]>(
    () => [
      [myNoise ? t(myNoise.name) : "---", `HP: ${hp.baseHp}`],
      ["サポート", supportUse ? t(supportUse) : "デフォルト"],
      [
        warlock ? t(warlock.name) : "---",
        warlock
          ? `アタック ${warlock.attack}Lv\nラピッド ${warlock.rapid}Lv\nチャージ ${warlock.charge}Lv`
          : "---",
      ],
    ],
    [myNoise, t, hp.baseHp, supportUse, warlock],
  );

  // ロックマン: ウォーロック装備セル（B3）に pre-wrap を適用
  const rockmanStyle = useMemo<Record<string, string>>(() => {
    const s: Record<string, string> = {};
    if (warlock) s["B3"] = "white-space: pre-wrap;";
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
      return [row.card.name + labelHtml, String(row.count)];
    });
  }, [deckSummary, cardLabels]);

  // ホワイトカード（1セルに改行で結合）
  const wcData = useMemo<string[][]>(
    () => [[myWC.length > 0 ? myWC.map((card) => card?.name ?? "---").join("\n") : "---"]],
    [myWC],
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
      ["合計", String(totalCapacity)],
    ];
    const lastRow = data.length;
    return [
      data,
      {
        [`A${lastRow}`]: "font-weight: bold;",
        [`B${lastRow}`]: "font-weight: bold;",
      },
    ];
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
      rows.push([`ファイナライズターン +${rezonEffect.finalizeTurn}`]);
    if (rezonEffect.accessLv !== 0)
      rows.push([`アクセスレベル +${rezonEffect.accessLv}`]);
    if ((rezonEffect.attackStar["null"] ?? 0) > 0)
      rows.push([`ノーマルスター +${rezonEffect.attackStar["null"]}`]);
    if ((rezonEffect.attackStar["fire"] ?? 0) > 0)
      rows.push([`ファイアスター +${rezonEffect.attackStar["fire"]}`]);
    if ((rezonEffect.attackStar["aqua"] ?? 0) > 0)
      rows.push([`アクアスター +${rezonEffect.attackStar["aqua"]}`]);
    if ((rezonEffect.attackStar["elec"] ?? 0) > 0)
      rows.push([`サンダースター +${rezonEffect.attackStar["elec"]}`]);
    if ((rezonEffect.attackStar["wood"] ?? 0) > 0)
      rows.push([`ウッドスター +${rezonEffect.attackStar["wood"]}`]);
    if ((rezonEffect.attackStar["sword"] ?? 0) > 0)
      rows.push([`ソードスター +${rezonEffect.attackStar["sword"]}`]);
    if ((rezonEffect.attackStar["break"] ?? 0) > 0)
      rows.push([`ブレイクスター +${rezonEffect.attackStar["break"]}`]);
    if (rezonEffect.chargeShot != null)
      rows.push([`チャージショット ${t("rezon.chargeShot." + rezonEffect.chargeShot)}`]);
    if (rezonEffect.FBarrier != null)
      rows.push([`F${t("rezon.FBarrier." + rezonEffect.FBarrier)}`]);
    if (rezonEffect.FField != null)
      rows.push([`F${t("rezon.FField." + rezonEffect.FField)}`]);
    return rows.length > 0 ? rows : [["---"]];
  }, [rezonEffect, t]);

  // ─── コピー処理 ───────────────────────────────────────────────

  const sections = useMemo<HtmlSection[]>(
    () => [
      { title: "ロックマン", data: rockmanData, columns: [{ type: "html", align: "left", width: 240 }, { align: "right", width: 180 }], style: rockmanStyle },
      { title: "フォルダ", data: folderData, columns: COLS_2 },
      { title: "ホワイトカード", data: wcData, columns: COLS_1, style: wcStyle },
      { title: "ブラザー", data: brotherData, columns: COLS_2, style: brotherStyle },
      { title: "ノイズドカード", data: noiseData, columns: COLS_1, style: noiseStyle },
      { title: "アビリティ", data: abilityData, columns: COLS_2, style: abilityStyle },
      { title: "レゾン", data: rezonData, columns: COLS_2 },
      { title: "レゾン効果", data: rezonEffectData, columns: COLS_1 },
    ],
    [rockmanData, rockmanStyle, folderData, wcData, wcStyle, brotherData, brotherStyle, noiseData, noiseStyle, abilityData, abilityStyle, rezonData, rezonEffectData],
  );

  const handleCopyHtml = useCallback(() => {
    navigator.clipboard.writeText(buildHtmlDocument(sections));
  }, [sections]);

  const handleCopyMarkdown = useCallback(() => {
    navigator.clipboard.writeText(buildMarkdownDocument(sections));
  }, [sections]);

  return (
    <Box
      sx={{
        p: 2,
        fontFamily: "Consolas, monospace",
        display: "flex",
        flexDirection: "column",
        gap: 0.5,
      }}
    >
      <Box sx={{ display: "flex", gap: 1 }}>
        <Button
          variant="contained"
          startIcon={<ContentCopyIcon />}
          onClick={handleCopyHtml}
        >
          HTML形式でコピー
        </Button>
        {/* <Button
          variant="contained"
          startIcon={<ContentCopyIcon />}
          onClick={handleCopyMarkdown}
        >
          Markdown形式でコピー
        </Button> */}
      </Box>
      <Box sx={{ fontSize: 11, color: "#aaa", mt: 0.5 }}>
        テーブルは範囲選択してコピーが可能です。
      </Box>

      <Box>
        {/* ノイズ / HP / サポートユーズ / ウォーロック装備 */}
        <div style={hdr}>ロックマン</div>
        <JSheet
          data={rockmanData}
          columns={[
            { type: "html", align: "left", width: 240 },
            { align: "right", width: 180 },
          ]}
          style={rockmanStyle}
          initialSelection="A1"
        />

        {/* デッキ一覧 */}
        <div style={hdr}>フォルダ</div>
        <JSheet data={folderData} columns={COLS_2} />

        {/* ホワイトカード */}
        <div style={hdr}>ホワイトカード</div>
        <JSheet data={wcData} columns={COLS_1} style={wcStyle} />

        {/* ブラザー情報 */}
        <div style={hdr}>ブラザー</div>
        <JSheet data={brotherData} columns={COLS_2} style={brotherStyle} />

        {/* ノイズドカード */}
        <div style={hdr}>ノイズドカード</div>
        <JSheet data={noiseData} columns={COLS_1} style={noiseStyle} />

        {/* アビリティ */}
        <div style={hdr}>アビリティ</div>
        <JSheet data={abilityData} columns={COLS_2} style={abilityStyle} />

        {/* レゾン情報 */}
        <div style={hdr}>レゾン</div>
        <JSheet data={rezonData} columns={COLS_2} />

        {/* レゾン効果（マージ済み） */}
        <div style={hdr}>レゾン効果</div>
        <JSheet data={rezonEffectData} columns={COLS_1} />
      </Box>
    </Box>
  );
}
