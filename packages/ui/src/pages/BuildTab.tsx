import { useCallback, useRef, useMemo } from "react";
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

const tbl = { borderCollapse: "collapse" as const, fontSize: 13 };
const th = {
  border: "1px solid #ccc",
  padding: "2px 8px",
  background: "#f5f5f5",
  textAlign: "left" as const,
};
const td = { border: "1px solid #ccc", padding: "2px 8px" };
const tdR = { ...td, textAlign: "right" as const };
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

  const contentRef = useRef<HTMLDivElement>(null);

  const handleCopyHtml = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    const raw = el.outerHTML;
    // prettify
    let indent = 0;
    const pretty = raw
      .replace(/></g, ">\n<")
      .split("\n")
      .map((line) => {
        line = line.trim();
        if (line.startsWith("</")) indent--;
        const out = "  ".repeat(Math.max(indent, 0)) + line;
        if (line.startsWith("<") && !line.startsWith("</") && !line.endsWith("/>") && !line.includes("</"))
          indent++;
        return out;
      })
      .join("\n");
    navigator.clipboard.writeText(pretty);
  }, []);

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
              <Button
        variant="contained"
        
        startIcon={<ContentCopyIcon />}
        onClick={handleCopyHtml}
        sx={{ width: 250 }}
      >
        HTML形式でコピー
      </Button>
    <Box ref={contentRef}>
      {/* ノイズ / HP / サポートユーズ / ウォーロック装備 */}
      <div style={hdr}>ロックマン</div>
      
      <table style={tbl}>
        <tbody>
          <tr>
            <td style={td}>{myNoise ? t(myNoise.name) : '---'}</td>
            <td style={tdR}>HP: {hp.baseHp}</td>
          </tr>
          <tr>
            <td style={td}>サポート</td>
            <td style={tdR}>{supportUse ? t(supportUse) : 'デフォルト'}</td>
          </tr>
          <tr>
            <td style={td}>{warlock ? t(warlock.name) : '---'}</td>
            <td style={tdR}>
              {warlock
                ? <>アタック {warlock.attack}Lv<br />ラピッド {warlock.rapid}Lv<br />チャージ {warlock.charge}Lv</>
                : '---'}
            </td>
          </tr>
        </tbody>
      </table>

      {/* デッキ一覧 */}
      <div style={hdr}>フォルダ</div>
      <table style={tbl}>
        {/* <thead><tr><th style={th}>名称</th><th style={th}>枚数</th></tr></thead> */}
        <tbody>
          {deckSummary.map((row) => {
            const labels = cardLabels.get(row.card.name);
            return (
              <tr key={row.card.name}>
                <td style={td}>
                  {row.card.name}
                  {labels?.map((l) => (
                    <b
                      key={l}
                      style={{
                        marginLeft: 4,
                        color: l === "REG" ? "red" : "blue",
                      }}
                    >
                      {l}
                    </b>
                  ))}
                </td>
                <td style={tdR}>{row.count}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* ホワイトカード */}
      <div style={hdr}>ホワイトカード</div>
      <table style={tbl}>
        <tbody>
          {myWC.length > 0 ? (
            myWC.map((card, i) => (
              <tr key={i}>
                <td style={td}>{card?.name ?? "---"}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td style={td}>---</td>
            </tr>
          )}
        </tbody>
      </table>
      
            {/* ブラザー情報 */}
      <div style={hdr}>ブラザー</div>

      <table style={tbl}>
        {/* <thead><tr><th style={th}>ノイズ</th><th style={th}>数</th></tr></thead> */}
        <tbody>
          {broNoises.length > 0 ? (
            broNoises.map((g) => (
              <tr key={g.name}>
                <td style={td}>{t(g.name)}</td>
                <td style={tdR}>{g.count}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td style={td} colSpan={2}>
                ---
              </td>
            </tr>
          )}
          {broWCGroups.length > 0 ? (
            broWCGroups.map((g, i) => (
              <tr key={i}>
                <td style={td}>
                  {g.names.map((n, j) => (
                    <div key={j}>{n ?? "---"}</div>
                  ))}
                </td>
                <td style={tdR}>{g.count}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td style={td} colSpan={2}>
                ---
              </td>
            </tr>
          )}
          {broMegas.length > 0 ? (
            broMegas.map((g) => (
              <tr key={g.name}>
                <td style={td}>{g.name}</td>
                <td style={tdR}>{g.count}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td style={td} colSpan={2}>
                ---
              </td>
            </tr>
          )}
          {broGigas.length > 0 ? (
            broGigas.map((g) => (
              <tr key={g.name}>
                <td style={td}>{g.name}</td>
                <td style={tdR}>{g.count}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td style={td} colSpan={2}>
                ---
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* ノイズドカード */}
      <div style={hdr}>ノイズドカード</div>
      <table style={tbl}>
        <tbody>
          {noiseCards.cards.length > 0 ? (
            noiseCards.cards.map((card, i) => {
              const s = SUIT_STYLE[card.suit] ?? { icon: "?", bg: "#fff" };
              return (
                <tr key={i}>
                  <td style={{ ...td, background: s.bg }}>
                    {s.icon}
                    {card.number || " "} {t(card.name)}/{t(card.effect)}
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td style={td}>---</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* アビリティ */}
      <div style={hdr}>アビリティ</div>
      <table style={tbl}>
        {/* <thead>
          <tr>
            <th style={th}>名称</th>
            <th style={th}>容量</th>
          </tr>
        </thead> */}
        <tbody>
          {abilities.map((ab, i) => (
            <tr key={i}>
              <td style={td}>{t(ab.name)}</td>
              <td style={tdR}>{ab.capacity}</td>
            </tr>
          ))}
          <tr>
            <td style={{ ...td, fontWeight: "bold" }}>合計</td>
            <td style={{ ...tdR, fontWeight: "bold" }}>{totalCapacity}</td>
          </tr>
        </tbody>
      </table>

      {/* レゾン情報 */}
      <div style={hdr}>レゾン</div>
      <table style={tbl}>
        {/* <thead><tr><th style={th}>名称</th><th style={th}>数</th></tr></thead> */}
        <tbody>
          {rezonGroups.length > 0 ? (
            rezonGroups.map((g) => (
              <tr key={g.name}>
                <td style={td}>{t("rezon.name." + g.name)}</td>
                <td style={tdR}>{g.count}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td style={td} colSpan={2}>
                ---
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* レゾン効果（マージ済み） */}
      <div style={hdr}>レゾン効果</div>
      <table style={tbl}>
        {/* <thead><tr><th style={th}>項目</th><th style={th}>値</th></tr></thead> */}
        <tbody>
          {rezonEffect.finalizeTurn !== 0 && (
            <tr>
              <td style={td}>ファイナライズターン</td>
              <td style={tdR}>{rezonEffect.finalizeTurn}</td>
            </tr>
          )}
          {rezonEffect.accessLv !== 0 && (
            <tr>
              <td style={td}>アクセスレベル</td>
              <td style={tdR}>+{rezonEffect.accessLv}</td>
            </tr>
          )}
          {(rezonEffect.attackStar["null"] ?? 0) > 0 && (
            <tr>
              <td style={td}>ノーマルスター</td>
              <td style={tdR}>+{rezonEffect.attackStar["null"]}</td>
            </tr>
          )}
          {(rezonEffect.attackStar["fire"] ?? 0) > 0 && (
            <tr>
              <td style={td}>ファイアスター</td>
              <td style={tdR}>+{rezonEffect.attackStar["fire"]}</td>
            </tr>
          )}
          {(rezonEffect.attackStar["aqua"] ?? 0) > 0 && (
            <tr>
              <td style={td}>アクアスター</td>
              <td style={tdR}>+{rezonEffect.attackStar["aqua"]}</td>
            </tr>
          )}
          {(rezonEffect.attackStar["elec"] ?? 0) > 0 && (
            <tr>
              <td style={td}>サンダースター</td>
              <td style={tdR}>{rezonEffect.attackStar["elec"]}</td>
            </tr>
          )}
          {(rezonEffect.attackStar["wood"] ?? 0) > 0 && (
            <tr>
              <td style={td}>ウッドスター</td>
              <td style={tdR}>+{rezonEffect.attackStar["wood"]}</td>
            </tr>
          )}
          {(rezonEffect.attackStar["sword"] ?? 0) > 0 && (
            <tr>
              <td style={td}>ソードスター</td>
              <td style={tdR}>+{rezonEffect.attackStar["sword"]}</td>
            </tr>
          )}
          {(rezonEffect.attackStar["break"] ?? 0) > 0 && (
            <tr>
              <td style={td}>ブレイクスター</td>
              <td style={tdR}>+{rezonEffect.attackStar["break"]}</td>
            </tr>
          )}
          {rezonEffect.chargeShot != null && (
            <tr>
              <td style={td}>チャージショット</td>
              <td style={tdR}>
                {t("rezon.chargeShot." + rezonEffect.chargeShot)}
              </td>
            </tr>
          )}
          {rezonEffect.FBarrier != null && (
            <tr>
              <td style={td}>Fバリア</td>
              <td style={tdR}>{t("rezon.FBarrier." + rezonEffect.FBarrier)}</td>
            </tr>
          )}
          {rezonEffect.FField != null && (
            <tr>
              <td style={td}>Fフィールド</td>
              <td style={tdR}>{t("rezon.FField." + rezonEffect.FField)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </Box>


    </Box>
  );
}
