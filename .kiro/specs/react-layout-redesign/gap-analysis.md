# ギャップ分析レポート: react-layout-redesign

## 1. 現状調査

### 1.1 主要ファイル・モジュール構造

| ディレクトリ | 役割 |
|-------------|------|
| `packages/ui/src/layouts/` | レイアウトコンポーネント（AppLayout, TwoPaneLayout） |
| `packages/ui/src/components/` | UIコンポーネント（Sidebar, CardGrid, FolderView, LanguageSwitcher） |
| `packages/ui/src/pages/` | ページコンポーネント（Home, WebHome, FolderDetail, Settings） |
| `packages/ui/src/types/` | TypeScript 型定義（Card, FinalizationData, VERSION_COLORS） |

### 1.2 現行レイアウト構成

```
┌──────────────────────────────────────────────────┐
│ AppBar (高さ40px) - グラデーション背景            │
│   Meteor Server Folder Viewer | LanguageSwitcher │
├──────────────────────────────────────────────────┤
│ Sidebar (310px固定)     │ Main Content           │
│ ┌────────────────────┐  │                        │
│ │ カード検索         │  │ <Outlet />             │
│ │ 属性フィルタ×8     │  │                        │
│ ├────────────────────┤  │                        │
│ │ [BA Chip][RJ Chip] │  │                        │
│ │ [BA Lv1] [RJ Lv1]  │  │                        │
│ │ [BA Lv2] [RJ Lv2]  │  │                        │
│ │ ...                │  │                        │
│ └────────────────────┘  │                        │
└──────────────────────────────────────────────────┘
```

### 1.3 既存コンポーネント分析

#### TwoPaneLayout.tsx (41行)
- **機能**: AppBar + 左右2ペイン構成
- **依存**: Sidebar, LanguageSwitcher, VERSION_COLORS
- **課題**: AppBar が縦スペースを占有（要件1で廃止対象）

#### Sidebar.tsx (300行)
- **機能**: 検索・フィルタ・レベルボタン一体型
- **課題点**:
  - BA/RJ が2列配置（要件2: 単一列化が必要）
  - バージョン切替UIなし（要件3: タブ/トグル追加が必要）
  - クリアボタンなし（要件4で必要）
- **再利用可能な資産**:
  - `getUniqueCards()` - カード検索ロジック
  - `getHitCount()` - フィルタヒット数計算
  - `handleTypeSelect()` - 属性フィルタ切替

#### VERSION_COLORS (card.ts)
```typescript
export const VERSION_COLORS: Record<Version, string> = {
  BA: 'rgb(49, 74, 90)',  // 青系
  RJ: 'rgb(181, 33, 57)', // 赤系
};
```
- **状態**: 要件6の期待値と完全一致 ✓

---

## 2. 要件実現性分析

### 要件-資産マッピング

| 要件 | 必要な変更 | 既存資産 | ギャップ |
|------|-----------|----------|----------|
| **Req1: ヘッダーレス** | AppBar 廃止、ナビ統合 | TwoPaneLayout | Missing: 左ペイン内ナビ配置 |
| **Req2: 情報構造改善** | セクション分離、単一列化 | Sidebar | Missing: バージョンセクション分離ロジック |
| **Req3: バージョン切替** | タブ/トグルUI追加 | なし | Missing: VersionToggle コンポーネント |
| **Req4: 検索・フィルタ最適化** | クリアボタン追加 | Sidebar 検索/フィルタ | Missing: クリアボタン、アクティブ状態表示 |
| **Req5: レスポンシブ** | 幅制約追加 | Sidebar (width: 310px) | 部分対応: min/max 未設定 |
| **Req6: カラーテーマ** | テーマ適用拡大 | VERSION_COLORS | 既存 ✓ |

### 技術的複雑性

| 項目 | 評価 | 理由 |
|------|------|------|
| UI変更 | 中 | 既存コンポーネントの構造変更 |
| 状態管理 | 低 | 既存の useState パターンで対応可能 |
| ルーティング | 低 | 既存ルート構成を維持 |
| 外部依存 | なし | MUI 既存機能で実現可能 |

---

## 3. 実装アプローチオプション

### Option A: 既存コンポーネント拡張

**概要**: TwoPaneLayout と Sidebar を直接修正

**変更対象**:
- `TwoPaneLayout.tsx`: AppBar 削除、LanguageSwitcher を Sidebar に移動
- `Sidebar.tsx`: バージョン切替UI追加、レベルボタン配置変更

**トレードオフ**:
- ✅ ファイル数増加なし
- ✅ 既存のロジック（検索・フィルタ）をそのまま活用
- ❌ Sidebar が複雑化（現在300行 → 推定400行超）
- ❌ 単一責任原則の違反リスク

### Option B: 新規コンポーネント作成

**概要**: 新しいレイアウト/コンポーネント体系を構築

**新規作成**:
- `HeaderlessLayout.tsx` - 新レイアウト
- `VersionToggle.tsx` - BA/RJ 切替コンポーネント
- `VersionSection.tsx` - バージョン別レベルリスト
- `SearchFilterBar.tsx` - 検索・フィルタ専用コンポーネント

**トレードオフ**:
- ✅ 責任の明確な分離
- ✅ テスト容易性向上
- ✅ 将来の拡張性
- ❌ 新規ファイル4つ追加
- ❌ 既存ロジックの移植が必要

### Option C: ハイブリッドアプローチ（推奨）

**概要**: TwoPaneLayout を修正しつつ、Sidebar の内部を分割

**変更/作成**:
- `TwoPaneLayout.tsx` → **修正**: AppBar 削除
- `Sidebar.tsx` → **リファクタリング**: 内部構造を子コンポーネントに分割
- 新規 `VersionToggle.tsx`: タブ/トグルUI
- 新規 `LevelList.tsx`: レベルボタン群（単一列）

**フェーズ分割**:
1. Phase 1: AppBar 廃止 + LanguageSwitcher 移動
2. Phase 2: VersionToggle 追加 + LevelList 分離
3. Phase 3: クリアボタン・レスポンシブ対応

**トレードオフ**:
- ✅ 段階的な移行でリスク軽減
- ✅ 適度なコンポーネント分割
- ✅ 既存ルーティング・データフローを維持
- ❌ Option A より工数増

---

## 4. 工数・リスク評価

| 項目 | 評価 | 根拠 |
|------|------|------|
| **工数** | **M (3-7日)** | 既存パターン内の変更、新規コンポーネント2-3個 |
| **リスク** | **Low** | MUI 既存機能、既存ルーティング維持、テーマカラー定義済み |

### リスク要因
- 既存 Sidebar の状態管理ロジックが密結合 → 分割時に注意
- 2列→1列変更でレベルボタンの縦スクロール量増加 → UX確認推奨

---

## 5. 設計フェーズへの推奨事項

### 推奨アプローチ
**Option C（ハイブリッド）** を推奨

### 主要設計決定事項
1. **バージョン切替UI**: タブ vs トグル → ユーザー確認推奨
2. **レベルリストの表示方式**: スクロール可能リスト vs 折りたたみ

### 調査継続項目
- (なし - 外部依存や未知技術なし)

### 制約条件
- 変更は `packages/ui/` 内に限定（要件書記載）
- 既存ルーティング（`/meteor-server/:version/:level`）維持

---

## 6. 結論

既存コードベースはレイアウト刷新に対応可能な構造を持っています。VERSION_COLORS など必要な資産は既に定義済みであり、主な作業は Sidebar の構造変更と AppBar の廃止です。

ハイブリッドアプローチにより、既存機能を維持しながら段階的にUIを刷新できます。
