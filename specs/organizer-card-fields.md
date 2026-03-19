# Organizer カードフィールド仕様

MMSF Perfect Battle Organizer (`commonSections.cards[]`) の各フィールドの意味と挙動。

ソース: https://mmsf-perfect-battle-organizer.vercel.app/editor?game=mmsf3&version=red-joker
調査対象チャンク: `d23b3c3c9b308508.js`

## フィールド一覧

| フィールド | 型 | デフォルト | 説明 |
|---|---|---|---|
| `id` | string | `createId()` | カードエントリの一意ID（UUID的なもの） |
| `name` | string | `""` | カード名（全角表記。例: `"キャノン"`, `"リカバリー３００"`) |
| `quantity` | number | `1` | 同名カードの投入枚数。UI上はスピンボタンで増減。最小1（`Math.max(1, Math.trunc(quantity))`で正規化される） |
| `isRegular` | boolean | `false` | REGカード指定。フォルダ内で1枚だけ指定可能。UIのREGボタンで切替。REG指定カードは対戦開始時に必ず手札に入る |
| `notes` | string | `""` | カードに対する自由記述メモ。現在のエディタUIにはカード単位のメモ入力欄は表示されていないが、JSONデータとしては保持される。入手方法のソース情報（`cardSources`）とは別物 |
| `favoriteCount` | number | `0` | お気に入り（フェイバリット）指定枚数。ノイズによっては「フェイバリットカード」としてカードに★マークを付与でき、ブライノイズ時はフェイバリットカードが2枚まで設定可能。通常ノイズではisRegularが付いたカードに自動で1が設定される |

## 詳細挙動

### quantity

- 同名カードを複数枚デッキに入れる場合の枚数
- UI上のスピンボタンで調整
- 正規化: `Math.max(1, Math.trunc(quantity))` → 小数・0以下は補正される
- 「合計」カウントは全カードの `quantity` の合計で算出（上限30）

### isRegular

- フォルダ全体で1枚だけ指定可能
- UIの「REG」ボタンをトグルで切替
- REG指定済みカードがある場合、他のカードのREGボタンは `disabled` になる
- 対戦時、REG指定カードは必ず初手に含まれる（ゲーム内仕様）

### notes

- カード個別のメモ欄
- 現在のOrganizerエディタUIにはカード行にメモ入力UIは表示されていない
- JSONインポート/エクスポートで保持される内部フィールド
- `cardSources[]`（入手方法リスト）とは独立

### favoriteCount

- 「フェイバリットカード」の指定枚数
- 正規化ロジック:
  - `Math.max(0, Math.min(quantity, Math.trunc(favoriteCount)))` → quantityを超えない、0以上
  - ブライノイズ時: 最大2枚分のフェイバリットを分配（`let o = 2 * !!isBuraiNoise`）
  - ブライ以外のノイズ: isRegularカードに自動で `favoriteCount: 1` が設定。REGがなければ `favoriteCount: 0`
- ブライノイズ時の特殊挙動:
  - REG指定がなくても `rawFavoriteCount > 0` のカードが暗黙のREG候補になる
  - フェイバリット枠2枚を各カードの `favoriteCount` に基づいて分配
  - REG指定カードの枚数からREG分1枚を引いた残りにフェイバリットを割当

## 当アプリ (ssr3_viewer) でのエクスポート時の扱い

現在の `buildOrganizerJson.ts` での設定:

```typescript
{
  id: uuid(),
  name: mapCardName(c.name),   // 全角変換
  quantity: c.count,            // デッキ内の枚数
  isRegular: c.isRegular,      // REG指定
  notes: '',                    // 未使用（空文字固定）
  favoriteCount: 0,             // 未使用（0固定）
}
```

- `notes`: 当アプリではカードメモ機能がないため空文字で出力
- `favoriteCount`: 当アプリではフェイバリット指定機能がないため0で出力。Organizer側でインポート時にノイズに応じて自動正規化される
