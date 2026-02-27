import type { JSheetColumn } from "../components/JSheet";

/** セクション1つ分の定義 */
export interface HtmlSection {
  title: string;
  data: (string | number | null)[][];
  columns?: JSheetColumn[];
  style?: Record<string, string>;
}

/** A1, B3 などのセルキーを行・列インデックス (0-based) に変換 */
function parseCell(key: string): { col: number; row: number } | null {
  const m = /^([A-Z])(\d+)$/.exec(key);
  if (!m) return null;
  return { col: m[1].charCodeAt(0) - 65, row: parseInt(m[2], 10) - 1 };
}

/** style 文字列中の個別プロパティを抽出 */
function pickStyle(css: string, prop: string): string | null {
  const re = new RegExp(`${prop}\\s*:\\s*([^;]+)`);
  const m = re.exec(css);
  return m ? m[1].trim() : null;
}

/** セル内容をエスケープ（ただし type=html の列はそのまま通す） */
function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** 1セクションを <table> HTML 文字列に変換 */
function sectionToHtml(sec: HtmlSection, indent: string): string {
  const cols = sec.columns ?? [{ align: "left" }];
  const lines: string[] = [];

  lines.push(`${indent}<table border="1" cellpadding="4" cellspacing="0">`);

  for (let r = 0; r < sec.data.length; r++) {
    const row = sec.data[r];
    lines.push(`${indent}  <tr>`);

    for (let c = 0; c < cols.length; c++) {
      const col = cols[c];
      const raw = row[c] ?? "";
      const isHtml = col.type === "html";
      const text = String(raw);
      // セル内改行を <br> に変換
      const content = isHtml ? text.replace(/\n/g, "<br>") : esc(text).replace(/\n/g, "<br>");

      // style 属性を組み立て
      const parts: string[] = [];
      if (col.align && col.align !== "left") parts.push(`text-align: ${col.align}`);

      // セル個別スタイル (A1 形式)
      const cellKey = `${String.fromCharCode(65 + c)}${r + 1}`;
      const cellCss = sec.style?.[cellKey];
      if (cellCss) {
        const bg = pickStyle(cellCss, "background-color");
        if (bg) parts.push(`background-color: ${bg}`);
        const color = pickStyle(cellCss, "color");
        if (color) parts.push(`color: ${color}`);
        const fw = pickStyle(cellCss, "font-weight");
        if (fw) parts.push(`font-weight: ${fw}`);
      }

      const styleAttr = parts.length > 0 ? ` style="${parts.join("; ")}"` : "";
      lines.push(`${indent}    <td${styleAttr}>${content}</td>`);
    }

    lines.push(`${indent}  </tr>`);
  }

  lines.push(`${indent}</table>`);
  return lines.join("\n");
}

/**
 * 複数セクションからフォーマット済み HTML 文字列を生成する。
 * クリップボードにプレーンテキストとしてコピーする用途を想定。
 */
export function buildHtmlDocument(sections: HtmlSection[]): string {
  const lines: string[] = [];

  for (const sec of sections) {
    lines.push(`<h3>${esc(sec.title)}</h3>`);
    lines.push(sectionToHtml(sec, ""));
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
