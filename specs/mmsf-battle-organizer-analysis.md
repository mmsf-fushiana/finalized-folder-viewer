# MMSF Perfect Battle Organizer — データ永続化・JSON入出力 解析レポート

## サイト概要

- URL: `https://mmsf-perfect-battle-organizer.vercel.app/`
- Next.js (Turbopack) + Vercel デプロイ
- 流星のロックマン1/2/3 全8バージョン対応の対戦構築エディタ
- **サーバーサイドDBなし** — 全データを localStorage で管理

---

## 1. localStorage キー設計

### 1-1. メインストア

| キー | 用途 |
|---|---|
| `mmsf-perfect-battle-organizer/v3` | 保存済み構築(builds)とテンプレート(templates)の一括ストア |

**格納構造:**

```jsonc
{
  "builds": [ /* BuildRecord[] — 保存済み構築の配列 */ ],
  "templates": [ /* StrategyTemplate[] — 戦略テンプレート */ ]
}
```

### 1-2. エディタ下書き (自動保存)

| キーパターン | 用途 |
|---|---|
| `mmsf-perfect-battle-organizer/editor-draft/v3/new/{game}/{version}` | 新規構築の下書き |
| `mmsf-perfect-battle-organizer/editor-draft/v3/{buildId}/{game}/{version}` | 既存構築編集の下書き |

- エディタのフォーム状態が変更されるたびに `localStorage.setItem` で自動保存
- `beforeunload` イベントでも保存を実行（ブラウザ閉じ・リロード対策）
- 「保存」ボタン押下時に `localStorage.removeItem` で下書きを削除

---

## 2. 保存フロー (エディタ → メインストア)

```
エディタ入力
  ↓ (リアルタイム自動保存)
editor-draft キーに JSON.stringify して setItem
  ↓ 「保存」ボタン押下
バリデーション (エラーがあれば中断)
  ↓ パス
upsertBuild(buildData) → builds配列にマージ
  ↓
メインストアキーに { builds, templates } を JSON.stringify して setItem
  ↓
editor-draft キーを removeItem で削除
  ↓
URLを /editor?buildId={id}&game={game}&version={version} に更新
```

### 起動時復元フロー

```
エディタページ読み込み
  ↓
editor-draft キーから getItem
  ↓ 下書きあり
「未保存の編集内容を復元しました。」メッセージ表示
フォームに下書きデータを反映
  ↓ 下書きなし
新規構築 or 既存構築データをフォームに展開
```

---

## 3. JSON 書き出し (エクスポート)

### 場所

構築一覧ページ (`/builds`) の各構築カード内「書き出し」ボタン

### 実装

```javascript
// ファイル名生成
const safeName = (title.trim() || fallbackName).replace(/[\\/:*?"<>|]/g, "-");
const timestamp = `${YYYY}${MM}${DD}-${HH}${mm}${ss}`;
const filename = `${safeName}-${timestamp}.json`;

// Blob生成 & ダウンロード
const blob = new Blob(
  [JSON.stringify(buildRecord, null, 2)],   // pretty print (indent=2)
  { type: "application/json;charset=utf-8" }
);
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = filename;
a.click();
URL.revokeObjectURL(url);
```

### 出力ファイル名例

```
ブラックエース速攻-20260314-154530.json
```

---

## 4. JSON 読み込み (インポート)

### 場所

構築一覧ページ (`/builds`) の「JSON 読み込み」ボタン

### 実装

```javascript
// hidden <input type="file" accept=".json,application/json">
// ボタンクリック → input.click() でファイル選択ダイアログ

// パース & バリデーション
function parseImportData(text) {
  const parsed = JSON.parse(text);

  // 形式1: BuildRecord[] (配列)
  if (Array.isArray(parsed)) return parsed;

  // 形式2: { builds: BuildRecord[] } (メインストア形式)
  if (parsed?.builds) {
    if (Array.isArray(parsed.builds)) return parsed.builds;
    if (isBuildRecord(parsed.builds)) return [parsed.builds];
  }

  // 形式3: 単体 BuildRecord
  if (isBuildRecord(parsed)) return [parsed];

  throw Error("JSON の形式が不正です。");
}

// バリデーション関数
function isBuildRecord(obj) {
  return !!obj
    && typeof obj === "object"
    && typeof obj.id === "string"
    && typeof obj.game === "string"
    && typeof obj.version === "string";
}
```

### 受け入れ可能なJSON形式

| 形式 | 構造 | 説明 |
|---|---|---|
| 配列 | `[ BuildRecord, ... ]` | 複数構築の一括インポート |
| メインストア | `{ builds: [...] }` | localStorage の丸ごとエクスポート |
| 単体 | `{ id, game, version, ... }` | 1構築のみ |

---

## 5. BuildRecord のデータ構造 (流星3 ブラックエース)

```jsonc
{
  // === メタデータ ===
  "id": "64ce03a6-bc9b-4d0f-b82b-eb10f0392f17",  // UUID v4
  "title": "構築名",
  "game": "mmsf3",                                  // "mmsf1" | "mmsf2" | "mmsf3"
  "version": "black-ace",                           // バージョン識別子
  "strategyTemplateId": null,                        // テンプレートID (nullable)
  "createdAt": "2026-03-14T13:49:29.786Z",          // ISO 8601
  "updatedAt": "2026-03-14T13:49:29.786Z",

  // === 共通セクション (全作品共通) ===
  "commonSections": {
    "overview": "",              // 構築概要テキスト
    "tags": [],                  // string[] タグ配列
    "strategyName": "",          // 戦略名
    "strategyNote": "",          // 戦略メモ

    "cards": [                   // フォルダー (バトルカード)
      {
        "id": "uuid",
        "name": "カード名",
        "quantity": 1,           // 枚数
        "notes": "",
        "isRegular": false,      // REGカードフラグ
        "favoriteCount": 0
      }
    ],
    "cardSources": [],           // カード入手元情報
    "abilities": [               // アビリティ
      {
        "id": "uuid",
        "name": "エースＰＧＭ/0",
        "quantity": 1,
        "notes": "",
        "isRegular": false,
        "favoriteCount": 0
      }
    ],
    "abilitySources": [],        // アビリティ入手元情報
    "brothers": []               // ブラザー情報
  },

  // === 作品固有セクション ===
  "gameSpecificSections": {

    // --- 流星1 固有 ---
    "mmsf1": {
      "enhancement": "",
      "warRockWeapon": "",
      "warRockWeaponSources": [],
      "brotherBandMode": "",
      "versionFeature": "",
      "crossBrotherNotes": "",
      "notes": ""
    },

    // --- 流星2 固有 ---
    "mmsf2": {
      "starCards": [             // スターカード (3枠)
        { "id": "uuid", "name": "", "quantity": 1, ... }
      ],
      "blankCards": [            // ブランクカード (1枠)
        { "id": "uuid", "name": "", "quantity": 1, ... }
      ],
      "defaultTribeAbilityEnabled": true,
      "enhancement": "",
      "warRockWeapon": "",
      "warRockWeaponSources": [],
      "kokouNoKakera": false,
      "notes": ""
    },

    // --- 流星3 固有 ---
    "mmsf3": {
      "noise": "ノーマルロックマン",         // ノイズ名
      "warRockWeapon": "",                   // ウォーロック装備
      "warRockWeaponSources": [],
      "pgms": [],                            // PGM
      "noiseAbilities": [],                  // ノイズアビリティ
      "noiseCardIds": ["", "", "", "", ""],   // ノイズドカード (5スロット)

      "brotherRouletteSlots": [              // ブラザールーレット (6枠)
        {
          "position": "top_left",            // 位置
          "slotType": "brother",             // "brother" | "sss" | ...
          "sssLevel": "",
          "version": "",
          "noise": "",
          "rezon": "",                       // レゾンカード
          "whiteCardSetId": "",              // ホワイトカード
          "gigaCard": "",                    // ギガカード
          "megaCard": ""                     // メガカード
        }
        // ... 6枠 (top_left, top_right, mid_left, mid_right, btm_left, btm_right)
      ],

      "sssLevels": ["", "", ""],             // SSSレベル (最大3枠)
      "nfb": "",                             // NFB
      "mergeNoiseTarget": "",                // マージノイズ対象
      "whiteCardSetId": "00",               // ホワイトカードセットID
      "megaCards": [],
      "gigaCards": [],
      "teamSize": 0,
      "rezonCards": [],                      // レゾンカード
      "rivalNoise": "",
      "rouletteNotes": "",
      "notes": ""
    }
  }
}
```

---

## 6. テンプレート構造

メインストアの `templates` 配列に格納。

```jsonc
{
  "id": "uuid",
  "name": "速攻テンプレ",
  "tags": ["速攻", "先攻"],
  "notes": "序盤から押し切る構築向け。",
  "defaultValues": {
    "strategyName": "速攻プラン",
    "strategyNote": "初手から主力カードを押し付け...",
    "tags": ["速攻", "対戦用"]
  },
  "createdAt": "2026-03-14T13:49:25.617Z",
  "updatedAt": "2026-03-14T13:49:25.617Z"
}
```

デフォルトテンプレート:
- **速攻テンプレ** — 序盤押し切り型
- **コントロールテンプレ** — 受け・盤面整理型

---

## 7. 構築一覧ページの機能一覧

| 操作 | 説明 |
|---|---|
| **検索** | 構築名・タグ・概要メモでフィルタ |
| **作品フィルタ** | ドロップダウンでバージョン絞り込み |
| **編集** | `/editor?buildId={id}` に遷移 |
| **複製** | `duplicateBuild(id)` — 新IDで複製 |
| **削除** | `window.confirm` 後に `deleteBuild(id)` |
| **書き出し** | BuildRecord を pretty JSON でダウンロード |
| **JSON 読み込み** | `.json` ファイルから構築をインポート |

---

## 8. BuildTab.tsx との対応関係

`BuildTab.tsx` はデスクトップアプリの構築情報ビューで、ゲームのメモリから読み取ったデータをスプレッドシート形式（JSheet）で表示し、HTML/Markdown形式でクリップボードコピーできるコンポーネント。

### 8-1. 情報セクションの対応

| BuildTab.tsx のセクション | Battle Organizer の対応箇所 |
|---|---|
| **ロックマン** (ノイズ/HP/サポートユーズ/ウォーロック装備) | ロックマンセクション (`mmsf3.noise`, `mmsf3.warRockWeapon`) |
| **フォルダ** (デッキカード一覧 + REG/TAG1/TAG2ラベル) | フォルダーセクション (`commonSections.cards[]` + `isRegular`) |
| **ホワイトカード** | `mmsf3.whiteCardSetId` |
| **ブラザー** (ノイズ/WC/メガ/ギガ をグルーピング表示) | ブラザー情報 (`mmsf3.brotherRouletteSlots[]`) |
| **ノイズドカード** (スート/ナンバー/効果付き) | ノイズドカード (`mmsf3.noiseCardIds[]`) |
| **アビリティ** (名前+容量、合計行あり) | アビリティ (`commonSections.abilities[]`) |
| **レゾン** (グルーピング) | レゾンカード (`mmsf3.rezonCards[]`, `brotherRouletteSlots[].rezon`) |
| **レゾン効果** (マージ済み: finalizeTurn/accessLv/attackStar/chargeShot/FBarrier/FField) | — (Organizer側にはマージ済み効果の表示なし) |

### 8-2. データソースの根本的な違い

| | BuildTab.tsx (ssr3_viewer) | Battle Organizer |
|---|---|---|
| **データソース** | **エミュレータのメモリ値** (gameStoreがリアルタイム監視) | **ユーザー手動入力** (フォームUI) |
| **カード情報** | メモリアドレスからデコードした完全データ (attack, types, class, name_en) | カード名のみ (name + quantity) |
| **ブラザー情報** | メモリから6枠分を直接読み取り (`useBrotherInfo(1-6)`) | ユーザーがコンボボックスで選択入力 |
| **ノイズドカード** | メモリからスート/ナンバー/効果をデコード | ユーザーがスロット5枠に手動入力 |
| **レゾン効果** | メモリ読み取り → 7レゾン分をマージ計算 | マージ済み効果の表示機能なし |
| **REG/TAG** | メモリアドレス `REG`, `TAG_1`, `TAG_2` から自動取得 | REGフラグのみ手動トグル |
| **HP** | `BASE_HP` + アビリティHP + ノイズカードHP を自動算出 | HP計算なし |

### 8-3. 出力形式の違い

| | BuildTab.tsx | Battle Organizer |
|---|---|---|
| **表示** | JSheet (jspreadsheet-ce) — スプレッドシート風テーブル | TailwindCSS カードUI |
| **コピー** | HTML形式でクリップボード (`buildHtmlDocument`) | — |
| **コピー (予備)** | Markdown形式 (コメントアウト中: `buildMarkdownDocument`) | — |
| **エクスポート** | — | JSON ファイルダウンロード (Blob) |
| **インポート** | — | JSON ファイル読み込み (FileReader) |
| **画像出力** | — | PNG プレビュー / PNG 出力 |

### 8-4. BuildTab.tsx の出力フォーマット詳細

#### HTML出力 (`buildHtmlDocument`)

```html
<h3>ロックマン</h3>
<table border="1" cellpadding="4" cellspacing="0">
  <tr>
    <td>ウルフ</td>
    <td style="text-align: right">HP: 1600</td>
  </tr>
  ...
</table>

<h3>フォルダー</h3>
<table border="1" cellpadding="4" cellspacing="0">
  <tr>
    <td>ソードファイター3<b style="margin-left:4px;color:red">REG</b></td>
    <td style="text-align: right">3</td>
  </tr>
  ...
</table>
```

- セクションごとに `<h3>` + `<table>` を生成
- REG/TAGラベルは `<b>` タグ (赤/青) でインライン表示
- ノイズドカードは背景色付き (`♥`, `♦`, `♠`, `♣`, `★`)
- アビリティの合計行は太字

#### Markdown出力 (`buildMarkdownDocument`)

```markdown
### ロックマン
| ウルフ | HP: 1600 |
| :--- | ---: |
| サポートユーズ | デフォルト |

### フォルダー
| ソードファイター3 **REG** | 3 |
| :--- | ---: |
...
```

### 8-5. 機能ギャップと統合の可能性

#### BuildTab.tsx にあって Organizer にないもの

| 機能 | 詳細 |
|---|---|
| **HP自動計算** | BASE_HP + アビリティHP + ノイズカードHP |
| **レゾン効果マージ表示** | 7レゾン(自分+ブラザー6)のfinalizeTurn/accessLv/attackStar等をマージ |
| **TAG1/TAG2ラベル** | デッキ内カードへのタグ付与・表示 |
| **HTML/Markdownコピー** | クリップボードにフォーマット済みテーブルをコピー |
| **ノイズドカードのスート/効果表示** | スートアイコン(♥♦♠♣★) + 色分け + 効果名 |
| **リアルタイムデータ** | エミュレータと接続中は常に最新のメモリ値を反映 |

#### Organizer にあって BuildTab.tsx にないもの

| 機能 | 詳細 |
|---|---|
| **JSON import/export** | 構築データのファイル保存・読み込み |
| **下書き自動保存** | localStorage への自動保存・復元 |
| **PNG出力** | 構築情報を画像として書き出し |
| **テンプレート** | 構築の雛形（速攻/コントロール等） |
| **カード入手方法** | 未所持カード/アビリティの入手元ガイド |
| **バリデーション** | カード総数30枚チェック、必須項目チェック |
| **検索・フィルタ** | 構築一覧での全文検索・作品フィルタ |
| **複製** | 既存構築の複製機能 |

---

## 9. 技術的な特徴まとめ

### Battle Organizer

- **完全クライアントサイド永続化**: localStorage のみ、サーバーDBなし
- **バージョニング**: キーに `/v3` を含む（スキーマ変更に対応可能）
- **下書き自動保存**: useEffect + useEffectEvent + beforeunload の3重保護
- **JSON import/export**: 3形式を受け入れ可能な柔軟なパーサー
- **PNG出力**: html2canvas 系ライブラリでプレビュー画像を生成
- **フレームワーク**: Next.js (App Router) + Turbopack
- **UI**: TailwindCSS ベース（MUIではない）、宇宙テーマのカスタムデザイン

### BuildTab.tsx (ssr3_viewer)

- **データソース**: エミュレータメモリのリアルタイム読み取り (gameStore → zustand)
- **出力**: JSheet (jspreadsheet-ce) でスプレッドシート風表示 + HTML/Markdownクリップボードコピー
- **計算ロジック**: HP算出、レゾン効果マージ、REG/TAGインデックス管理
- **UI**: MUI (Material-UI) ベース
- **永続化**: なし（メモリから都度読み取り）
