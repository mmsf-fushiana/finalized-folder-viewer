# Research & Design Decisions: react-layout-redesign

---

## Summary
- **Feature**: react-layout-redesign
- **Discovery Scope**: Extension（既存システムの拡張）
- **Key Findings**:
  - 既存 `TwoPaneLayout` は AppBar + 2ペイン構成で、AppBar 廃止は構造変更のみで対応可能
  - `Sidebar` コンポーネント（300行）は検索・フィルタ・レベルボタンを一体化しており、分割が必要
  - `VERSION_COLORS` は要件の配色要件と完全一致、追加定義不要
  - MUI v6 のコンポーネント（Tabs, ToggleButton）で要件3のバージョン切替UIを実現可能

---

## Research Log

### MUI Tabs vs ToggleButton の選定

- **Context**: 要件3「BA/RJ をタブまたはトグルスイッチで切り替え可能にする」の実現方法を検討
- **Sources Consulted**:
  - MUI v6 Tabs ドキュメント
  - MUI v6 ToggleButton ドキュメント
  - 既存コードベースの使用パターン
- **Findings**:
  - **Tabs**: ナビゲーション用途向き、下線スタイル、複数タブに適する
  - **ToggleButton**: 二者択一に最適、コンパクト、バージョン切替に適合
  - 既存コードでは Button + Chip を使用（統一性なし）
- **Implications**: ToggleButton を採用。BA/RJ の二者択一に最適で、コンパクトな左ペイン内に収まる

### レベルリスト表示方式の検討

- **Context**: 要件2「各レベル（Lv1-12）を単一列で縦に配置する」の実装方式
- **Sources Consulted**: 現行 Sidebar.tsx のレイアウト分析
- **Findings**:
  - 現行: 2列配置（BA/RJ 並列）→ 12行で全レベル表示可能
  - 変更後: 単一列 → 12項目が縦に並ぶ、スクロール必要
  - 左ペイン高さ（検索・フィルタ除く）: 約 400-500px 使用可能
  - 各ボタン高さ約 32px × 12 = 384px → スクロール不要または軽微
- **Implications**: 固定リストで実装可能、仮想スクロールは不要

### 既存 Sidebar 状態管理の分析

- **Context**: Sidebar 分割時の状態管理設計
- **Sources Consulted**: packages/ui/src/components/Sidebar.tsx
- **Findings**:
  - `selectedType`: 属性フィルタ状態（useState）
  - `selectedCard`: カード検索結果（useState）
  - `getHitCount()`: フィルタヒット数計算ロジック
  - URL パラメータ `version`, `level` を `useParams` で取得
- **Implications**:
  - フィルタ状態は親コンポーネント（Sidebar）で管理継続
  - 新規コンポーネントへは props 経由で渡す
  - バージョン選択状態は新規 useState 追加（または URL 連動）

---

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| A: 既存コンポーネント拡張 | TwoPaneLayout + Sidebar を直接修正 | ファイル数維持、既存ロジック活用 | Sidebar が 400行超に肥大化 | 短期的には最速 |
| B: 新規コンポーネント作成 | 4つの新規コンポーネントで再構築 | 責任分離、テスト容易性 | 新規ファイル多数、既存ロジック移植 | 長期的に保守性向上 |
| **C: ハイブリッド（採用）** | TwoPaneLayout 修正 + Sidebar 内部分割 | バランスの取れた分割、段階的移行 | Option A より工数増 | 推奨アプローチ |

---

## Design Decisions

### Decision: バージョン切替UIに ToggleButtonGroup を採用

- **Context**: 要件3でBA/RJ切替UIの実装が必要
- **Alternatives Considered**:
  1. MUI Tabs - ナビゲーション向き、下線スタイル
  2. MUI ToggleButtonGroup - 二者択一に最適
  3. カスタムボタン - 独自実装が必要
- **Selected Approach**: MUI ToggleButtonGroup
- **Rationale**:
  - BA/RJ の二者択一に意味的に合致
  - コンパクトで左ペイン幅に収まる
  - VERSION_COLORS でカスタマイズ容易
- **Trade-offs**: タブスタイルより視覚的階層が弱い（許容範囲）
- **Follow-up**: 実装時にホバー・選択状態のスタイリング確認

### Decision: Sidebar 内部を子コンポーネントに分割

- **Context**: 300行の Sidebar を保守可能な単位に分割
- **Alternatives Considered**:
  1. 分割なし - 現状維持
  2. 完全分離 - SearchFilterBar, VersionToggle, LevelList を独立ファイルに
  3. 部分分離 - VersionToggle, LevelList のみ分離
- **Selected Approach**: 部分分離（VersionToggle, LevelList を新規作成）
- **Rationale**:
  - 検索・フィルタロジックは Sidebar 内に残す（密結合のため）
  - バージョン切替とレベルリストは独立性が高い
  - 2ファイル追加に留め、過度な分割を回避
- **Trade-offs**: SearchFilterBar は分離しないため Sidebar は依然 200行程度
- **Follow-up**: 将来的に SearchFilterBar 分離を検討

### Decision: バージョン選択状態をローカル状態で管理

- **Context**: 選択中バージョン（BA/RJ）の状態管理方式
- **Alternatives Considered**:
  1. URL パラメータ連動 - `/meteor-server/:version/:level` から取得
  2. ローカル useState - Sidebar 内で管理
  3. Context API - グローバル状態
- **Selected Approach**: ローカル useState + URL 同期
- **Rationale**:
  - 既存ルーティング `/meteor-server/:version/:level` を維持
  - バージョン切替時に URL を更新し、ナビゲーション状態と一致
  - Context は過剰（Sidebar 内で完結）
- **Trade-offs**: URL 変更時の状態同期ロジックが必要
- **Follow-up**: useParams + useNavigate で実装

---

## Risks & Mitigations

- **Risk 1**: Sidebar 分割時に既存フィルタロジックが破損
  → **Mitigation**: 分割前後で手動テスト実施、フィルタ・検索動作を確認

- **Risk 2**: 単一列レベルリストで縦スクロール量が増加しUX低下
  → **Mitigation**: ボタン高さを現行維持（32px）、スクロール量は許容範囲内

- **Risk 3**: VersionToggle のカラー適用が VERSION_COLORS と不整合
  → **Mitigation**: VERSION_COLORS を直接参照し、ハードコードを避ける

---

## References

- [MUI ToggleButtonGroup](https://mui.com/material-ui/react-toggle-button/) - 二者択一UIの実装参考
- [MUI Tabs](https://mui.com/material-ui/react-tabs/) - 比較検討用
- [React Router useParams](https://reactrouter.com/en/main/hooks/use-params) - URL パラメータ取得
- [React Router useNavigate](https://reactrouter.com/en/main/hooks/use-navigate) - プログラム的ナビゲーション
