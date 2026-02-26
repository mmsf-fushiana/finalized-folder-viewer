import { useEffect, useRef } from "react";
import jspreadsheet from "jspreadsheet-ce";
import "jspreadsheet-ce/dist/jspreadsheet.css";
import "jsuites/dist/jsuites.css";
import "./JSheet.css";

export interface JSheetColumn {
  width?: number | string;
  align?: "left" | "right" | "center";
  type?: "text" | "html" | "numeric";
}

export interface JSheetProps {
  data: (string | number | null)[][];
  columns?: JSheetColumn[];
  style?: Record<string, string>;
  /** マウント時に選択するセル (例: "A1") */
  initialSelection?: string;
}

// null を空文字に変換して CellValue[][] に整形
function toSafeData(
  data: (string | number | null)[][],
): (string | number)[][] {
  return data.length > 0
    ? data.map((row) => row.map((cell) => cell ?? ""))
    : [[""]];
}

export function JSheet({ data, columns, style, initialSelection }: JSheetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const worksheetRef = useRef<jspreadsheet.WorksheetInstance | null>(null);
  const prevStyleKeysRef = useRef<string[]>([]);

  // 初期化（マウント時のみ）
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current; // クリーンアップ時は ref が null になるため先に確保

    // StrictMode では mount→cleanup→mount と2回実行される。
    // destroy が DOM を完全に除去しない場合に備え、innerHTML をクリアしてから初期化する。
    container.innerHTML = "";

    const worksheets = jspreadsheet(container as HTMLDivElement, {
      contextMenu: () => null, // SpreadsheetOptions レベル
      parseHTML: true,         // セル内 HTML を描画
      worksheets: [
        {
          data: toSafeData(data),
          columns: (columns ?? [{ align: "left" }]).map((c) => ({
            type: c.type ?? "text",
            width: c.width,
            align: c.align ?? "left",
          })),
          editable: false,
          columnSorting: false,
          columnResize: false,
          rowDrag: false,
          columnDrag: false,
          allowDeleteColumn: false,
          allowDeleteRow: false,
          allowInsertColumn: false,
          allowInsertRow: false,
          allowManualInsertRow: false,
          allowManualInsertColumn: false,
          allowRenameColumn: false,
          style: style ?? {},
        },
      ],
    });

    worksheetRef.current = worksheets[0];
    worksheetRef.current.hideIndex();
    prevStyleKeysRef.current = Object.keys(style ?? {});

    // 初期選択セル（描画完了を待ってから選択+フォーカス）
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (initialSelection) {
      const m = /^([A-Z])(\d+)$/.exec(initialSelection);
      if (m) {
        const col = m[1].charCodeAt(0) - 65;
        const row = parseInt(m[2], 10) - 1;
        timer = setTimeout(() => {
          worksheetRef.current?.updateSelectionFromCoords(col, row, col, row);
          // セルにフォーカスを当てる
          const td = container.querySelector<HTMLElement>(
            `td[data-x="${col}"][data-y="${row}"]`,
          );
          td?.focus();
        }, 100);
      }
    }

    return () => {
      clearTimeout(timer);
      jspreadsheet.destroy(
        container as jspreadsheet.JspreadsheetInstanceElement,
        true,
      );
      worksheetRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // データ・スタイル変化時の命令的更新
  useEffect(() => {
    if (!worksheetRef.current) return;

    worksheetRef.current.setData(toSafeData(data));

    // 前回スタイルをリセット
    if (prevStyleKeysRef.current.length > 0) {
      const resetObj = Object.fromEntries(
        prevStyleKeysRef.current.map((k) => [k, ""]),
      );
      worksheetRef.current.resetStyle(resetObj);
    }

    // 新スタイルを適用
    const newStyle = style ?? {};
    if (Object.keys(newStyle).length > 0) {
      worksheetRef.current.setStyle(newStyle);
    }
    prevStyleKeysRef.current = Object.keys(newStyle);
  }, [data, style]);

  return <div className="jsheet-container" ref={containerRef} />;
}
