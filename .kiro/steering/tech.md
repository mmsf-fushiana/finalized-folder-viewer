# Technology Stack

## Architecture

Yarn Workspaces によるモノレポ構成。共通 UI パッケージを Web/Desktop アプリが共有するハイブリッドアプリケーション。

## Core Technologies

- **Language**: TypeScript 5.7+ (strict mode)
- **Framework**: React 19
- **Runtime**: Node.js 18+
- **Build Tool**: Vite 6
- **Package Manager**: Yarn (Workspaces)

## Key Libraries

- **UI Framework**: MUI (Material-UI) v6 + Emotion
- **Routing**: React Router v7
- **i18n**: react-i18next
- **Desktop**: Electron 34

## Native Layer (Dll1)

- **Language**: C++ (Visual Studio 2022)
- **Purpose**: melonDS.exe へのDLL注入によるメモリ監視
- **Dependencies**: MinHook (関数フック)

## Development Standards

### Type Safety
- TypeScript strict mode 有効
- `any` 型は避ける
- 型定義は `types/` ディレクトリに集約

### Code Quality
- ESModules (type: module)
- React JSX 構文

### Testing
- **Unit/Integration**: Vitest
- **E2E**: Playwright

## Development Environment

### Required Tools
- Node.js 18+
- Yarn
- Visual Studio 2022 (Dll1 ビルド用)

### Common Commands
```bash
# Dev (Web): yarn dev:web
# Dev (Desktop): yarn dev:desktop
# Build (Web): yarn build:web
# Build (Desktop): yarn build:desktop
```

## Key Technical Decisions

- **モノレポ採用理由**: Web/Desktop 間で UI コンポーネントを共有し、重複を排除
- **MUI 採用理由**: 迅速な UI 構築とダークテーマサポート
- **Electron 採用理由**: ファイルシステム・プロセス間通信によるエミュレータ連携

---
_Document standards and patterns, not every dependency_
