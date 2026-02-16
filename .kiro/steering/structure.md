# Project Structure

## Organization Philosophy

**Yarn Workspaces モノレポ** + **役割別パッケージ分離**

- `apps/`: プラットフォーム固有のアプリケーション
- `packages/`: 共有コード（UI コンポーネント、型定義、データ）
- `Dll1/`: ネイティブ層（C++ DLL）

## Directory Patterns

### Apps (`/apps/`)
**Purpose**: プラットフォーム固有のエントリポイント
**Pattern**: 各アプリは最小限のブートストラップのみ、ロジックは packages へ委譲

- `apps/web/`: Vite + React の Web アプリ
- `apps/desktop/`: Electron + Vite のデスクトップアプリ

### Shared UI (`/packages/ui/`)
**Purpose**: Web/Desktop 共通の React コンポーネント・ページ・フック
**Pattern**: バレルエクスポート経由で公開

```
packages/ui/src/
├── components/   # 再利用可能な UI コンポーネント
├── layouts/      # ページレイアウト (AppLayout, TwoPaneLayout)
├── pages/        # ルート対応ページコンポーネント
├── hooks/        # カスタム React Hooks
├── types/        # TypeScript 型定義
├── data/         # 静的データ・定数
└── i18n/         # 国際化設定
```

### Native Layer (`/Dll1/`)
**Purpose**: melonDS へのメモリアクセス用 DLL
**Pattern**: Visual Studio 2022 プロジェクト、MinHook 依存

## Naming Conventions

- **Files**: PascalCase.tsx (コンポーネント), camelCase.ts (ユーティリティ)
- **Components**: PascalCase (例: CardGrid, FolderView)
- **Hooks**: use プレフィックス + PascalCase (例: useCards)
- **Types**: PascalCase (例: Card, FinalizationData)

## Import Organization

```typescript
// パッケージからのインポート
import { CardGrid, theme } from '@ssr3-viewer/ui';
import { routes } from '@ssr3-viewer/ui/routes';

// 相対インポート（同一パッケージ内）
import { Card } from './types';
import { Sidebar } from '../components';
```

**Path Aliases**:
- `@ssr3-viewer/ui`: 共有 UI パッケージ
- サブパス: `/routes`, `/theme`, `/components`, `/layouts`, `/pages`, `/hooks`

## Code Organization Principles

- **共通ロジックは packages へ**: プラットフォーム固有コード以外は ui パッケージに配置
- **バレルエクスポート**: 各ディレクトリの `index.ts` から公開
- **型とデータの分離**: `types/` に型定義、`data/` に静的データ

---
_Document patterns, not file trees. New files following patterns shouldn't require updates_
