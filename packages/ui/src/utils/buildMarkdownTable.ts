import type { HtmlSection } from "./buildHtmlTable";

/** <b>text</b> → **text** に変換し、残りのHTMLタグは除去 */
function htmlToMarkdown(text: string): string {
  return text
    .replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**")
    .replace(/<[^>]+>/g, "");
}

/** Markdown テーブルのセル内で特殊文字をエスケープ */
function escPipe(text: string): string {
  return text.replace(/\|/g, "\\|");
}

/** align 値から区切り行のセルを生成 */
function separator(align?: "left" | "right" | "center"): string {
  switch (align) {
    case "right":
      return "---:";
    case "center":
      return ":---:";
    default:
      return ":---";
  }
}

/** 1セクションを Markdown テーブル文字列に変換 */
function sectionToMarkdown(sec: HtmlSection): string {
  const cols = sec.columns ?? [{ align: "left" }];
  const lines: string[] = [];

  // 区切り行
  const sep = "| " + cols.map((c) => separator(c.align)).join(" | ") + " |";

  for (let r = 0; r < sec.data.length; r++) {
    const row = sec.data[r];
    const cells = cols.map((col, c) => {
      const raw = row[c] ?? "";
      let text = String(raw);

      // セル内改行を <br> に
      text = text.replace(/\n/g, "<br>");

      // html 列は markdown 変換、それ以外はパイプだけエスケープ
      text = col.type === "html" ? escPipe(htmlToMarkdown(text)) : escPipe(text);

      // font-weight: bold スタイルがあれば太字化
      const cellKey = `${String.fromCharCode(65 + c)}${r + 1}`;
      const cellCss = sec.style?.[cellKey];
      if (cellCss && /font-weight\s*:\s*bold/i.test(cellCss)) {
        text = `**${text}**`;
      }

      return text;
    });

    lines.push("| " + cells.join(" | ") + " |");

    // 1行目の直後に区切り行を挿入
    if (r === 0) lines.push(sep);
  }

  return lines.join("\n");
}

/**
 * 複数セクションからフォーマット済み Markdown 文字列を生成する。
 * クリップボードにプレーンテキストとしてコピーする用途を想定。
 */
export function buildMarkdownDocument(sections: HtmlSection[]): string {
  const lines: string[] = [];

  for (const sec of sections) {
    lines.push(`### ${sec.title}`);
    lines.push(sectionToMarkdown(sec));
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
