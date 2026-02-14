# Requirements Document

## Project Description
React フロントエンドの画面レイアウトデザインを刷新する。

## Background
- 現行フロントエンドのデザインが視覚的に洗練されていない
- 操作導線が分かりづらく、UXが低い
- 特に左ペインにおける「バージョン × Lv × BA/RJ」の情報構造が複雑で理解しづらい

## Goal
- UIレイアウトを刷新し、視認性と操作性を向上させる
- ユーザーが目的の情報に素早く到達できること

## In Scope
- フロントエンドのレイアウト構造
- 各種UIコンポーネントのデザイン
- BA / RJ に応じたカラーデザイン

## Out of Scope
- DLL の実装変更
- Electron 側の実装変更

---

## Requirements

### Requirement 1: ヘッダーレスレイアウト
**Objective:** ユーザーとして、画面の縦方向のスペースを最大限活用したい。AppBar を廃止し、コンテンツ領域を拡大することで、カード一覧の視認性を向上させる。

#### Acceptance Criteria
1. The UI shall レイアウト構成から AppBar コンポーネントを完全に除去する
2. The UI shall ナビゲーション機能（言語切替など）を左ペイン内に統合する
3. The UI shall 画面高さ 100vh を左右ペインで完全に使用する

### Requirement 2: 左ペインの情報構造改善
**Objective:** ユーザーとして、BA/RJ バージョンとレベルの関係性を直感的に把握したい。現在の 2 列ボタン配置を改善し、情報階層を明確化する。

#### Acceptance Criteria
1. The Sidebar shall バージョン（BA/RJ）ごとにセクションを分離して表示する
2. When ユーザーがバージョンを選択した時, the Sidebar shall 選択バージョンに応じたテーマカラーをセクション全体に適用する
3. The Sidebar shall 各レベル（Lv1-12）を単一列で縦に配置する
4. While フィルタが適用されている時, the Sidebar shall ヒット件数をレベルボタンに表示する

### Requirement 3: バージョン切替の直感化
**Objective:** ユーザーとして、BA と RJ の切り替えをワンアクションで行いたい。タブやトグルによる明確な切替 UI を提供する。

#### Acceptance Criteria
1. The UI shall BA/RJ をタブまたはトグルスイッチで切り替え可能にする
2. When バージョンが切り替わった時, the UI shall 左ペイン全体の配色を選択バージョンのテーマカラーに変更する
3. The UI shall 現在選択中のバージョンを視覚的に強調表示する

### Requirement 4: 検索・フィルタ領域の最適化
**Objective:** ユーザーとして、カード検索と属性フィルタを効率的に使用したい。検索 UI をコンパクトにし、属性アイコンの視認性を向上させる。

#### Acceptance Criteria
1. The Sidebar shall カード検索入力欄を常に左ペイン上部に固定表示する
2. The Sidebar shall 属性フィルタアイコンを 8 種類すべて横並びで表示する
3. When 属性アイコンがクリックされた時, the Sidebar shall 選択状態を視覚的にフィードバックする
4. When 検索またはフィルタがアクティブな時, the Sidebar shall クリアボタンを表示する

### Requirement 5: レスポンシブ対応
**Objective:** ユーザーとして、様々な画面サイズで快適に使用したい。左ペイン幅を適切に調整し、コンテンツの可読性を維持する。

#### Acceptance Criteria
1. The UI shall 左ペインの幅を最小 280px、最大 360px の範囲で固定する
2. The UI shall メインコンテンツ領域は残りのスペースを流動的に使用する
3. While ウィンドウ幅が狭い時, the UI shall 左ペインの内部要素を折り返して表示する

### Requirement 6: カラーテーマの一貫性
**Objective:** ユーザーとして、BA/RJ の識別を色で直感的に行いたい。既存の VERSION_COLORS を活用し、一貫したカラーシステムを適用する。

#### Acceptance Criteria
1. The UI shall BA 選択時に VERSION_COLORS.BA（rgb(49,74,90)）を基調とした配色を適用する
2. The UI shall RJ 選択時に VERSION_COLORS.RJ（rgb(181,33,57)）を基調とした配色を適用する
3. The UI shall 選択中のバージョンと非選択バージョンのコントラストを明確にする

---

## Non-Functional Requirements

### NFR-1: 既存機能の互換性
- UI 変更によって既存のルーティング、データ取得、フィルタリング機能が破壊されないこと

### NFR-2: パフォーマンス
- レイアウト変更によるレンダリングパフォーマンスの劣化がないこと
- 初期表示が 1 秒以内に完了すること

### NFR-3: コードベースの整合性
- 変更は `packages/ui/` 内に限定する
- 既存のコンポーネント命名規則・ファイル構造に従う
