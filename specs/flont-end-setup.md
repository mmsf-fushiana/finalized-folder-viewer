# フロントエンド設計 指示書（最初に必ず読むこと）

## 1. フロントエンドのアプリの実装

本プロジェクトは **単一リポジトリ（シングルリポジトリ）** で構成されるアプリケーションです。

以下の2つを提供します：

- **Webアプリケーション**
  - 静的ホスティング前提
  - GitHub Pages 等で公開
- **デスクトップアプリケーション**
  - Electron を使用

両者は以下を **可能な限り共有** します：

- UI（React）
- ルーティング定義
- ビジネスロジック
- 開発者が定義した定数設定

---

## 2. 使用技術（固定）

以下は **必須** です。変更や代替案を提案してはいけません。

- 言語: **TypeScript**
- UI: **React**
- UIコンポーネント: **MUI (Material-UI)**
- ルーティング: **React Router**
- デスクトップ: **Electron**
- Webビルド: **Vite**
- パッケージマネージャ: **yarn** (workspaces)
- リポジトリ構成: **シングルリポジトリ**
- 開発者定義設定ファイル: **JSON形式**

以下は禁止です：

- Vue / Svelte / Next.js 等の別フレームワーク
- Chakra UI / Ant Design 等の別UIライブラリ
- バックエンド導入
- クラウド同期前提の設計

---

## 3. 使用ライブラリ

### 3.1 React Router

- パッケージ: `react-router-dom`
- 用途: クライアントサイドルーティング
- 使用方針:
  - Web版: `HashRouter`（GitHub Pages対応）
  - Desktop版: `HashRouter`（ファイルプロトコル対応）
  - ルート定義は `packages/ui/src/routes.tsx` に集約
  - `createHashRouter` を使用したData Router形式

### 3.2 MUI (Material-UI)

- パッケージ:
  - `@mui/material` - コアコンポーネント
  - `@mui/icons-material` - アイコン
  - `@emotion/react` / `@emotion/styled` - スタイリングエンジン（必須peer dependency）
- 用途: UIコンポーネントライブラリ
- 使用方針:
  - テーマは `packages/ui/src/theme.ts` に定義
  - `ThemeProvider` は各アプリのルート（`App.tsx`）で設定
  - カスタムコンポーネントは MUI コンポーネントを拡張して作成
  - `sx` prop によるスタイリングを基本とする
  - CSS-in-JS の直接記述は最小限に抑える

### 3.3 ライブラリバージョン管理

- yarn workspaces でバージョンを統一管理
- メジャーバージョンアップは慎重に検討
- `packages/ui` の `peerDependencies` で React / MUI のバージョンを指定

---

## 4. ルーティング方針

- アプリは **多画面（複数ページ）** 構成
- **React Router を必ず使用**
- Web版・デスクトップ版で **同じルーティング定義を共有** できる設計にする
- GitHub Pages（静的ホスティング）で **確実に動作する** ルーティング方式を前提とする

---

## 5. 設定ファイル方針

### 5.1 開発者定義の定数設定（共通）

以下の条件を満たす **共通設定ファイルを1つ** 設けてください。

- ファイル名: `config.json`
- 置き場所: **リポジトリルート直下**
- 形式: 純粋な JSON
- 用途:
  - アプリ名
  - 機能フラグ
  - 制限値（上限件数など）
  - UIに関わる定数
  - ルートや画面のメタ情報

制約：
- 実行時に書き換えない
- ユーザーが変更しない
- HTTP fetch で読み込まない
- ビルド時に import して使用する
- Web / Desktop 両方から同じ内容を参照する

以下は禁止：
- ユーザー設定を含めること
- APIキーや秘密情報を含めること
- OS依存パスを含めること

---

### 5.2 ユーザー固有設定（共通化しない）

ユーザー操作で変更される設定は **共通化しない**。

- Web版:
  - localStorage または IndexedDB
- Desktop版:
  - Electron の userData 配下

Web と Desktop のユーザー設定を
**自動的に同期・共有しようとしてはいけません**。

---

## 6. リポジトリ構成

```
repo/
├─ config.json                 # 共通設定ファイル
├─ package.json                # ルート（yarn workspaces設定）
├─ tsconfig.base.json          # TypeScript共通設定
├─ apps/
│  ├─ web/
│  │  ├─ index.html
│  │  ├─ package.json
│  │  ├─ tsconfig.json
│  │  ├─ vite.config.ts
│  │  └─ src/
│  │     ├─ main.tsx
│  │     ├─ App.tsx
│  │     ├─ config.ts
│  │     └─ userSettings.ts
│  └─ desktop/
│     ├─ package.json
│     ├─ tsconfig.json
│     ├─ tsconfig.main.json
│     ├─ vite.config.ts
│     └─ src/
│        ├─ main.ts            # Electronメインプロセス
│        ├─ preload.ts
│        └─ renderer/
│           ├─ index.html
│           └─ src/
│              ├─ main.tsx
│              ├─ App.tsx
│              ├─ config.ts
│              └─ userSettings.ts
└─ packages/
   └─ ui/
      ├─ package.json
      ├─ tsconfig.json
      └─ src/
         ├─ index.ts
         ├─ routes.tsx
         ├─ theme.ts           # MUI テーマ定義
         ├─ hooks/
         │  └─ index.ts
         ├─ components/        # MUI 拡張コンポーネント
         │  └─ index.ts
         ├─ layouts/
         │  ├─ index.ts
         │  └─ AppLayout.tsx
         └─ pages/
            ├─ index.ts
            ├─ Home.tsx
            └─ Settings.tsx
```

---

## 7. コマンド

リポジトリルートから実行：

```bash
# 依存パッケージインストール
yarn install

# Web版開発サーバー起動
yarn start
# または
yarn dev:web

# Desktop版開発
yarn dev:desktop

# Web版ビルド
yarn build:web

# Desktop版ビルド
yarn build:desktop
```

---

## 8. 設計思想（重要）

以下の原則に従ってください：

- 抽象化よりも単純さを優先
- 実行時マジックよりビルド時保証を優先
- Web / Desktop の違いが共有コードに漏れないこと
- 間違った使い方をしにくい設計にすること

---

## 9. 最後に

想定読者は **経験豊富なエンジニア** です。
チュートリアル的な説明は不要です。

あなたの出力は
**このプロジェクトのアーキテクチャ決定書の初版** になる前提で書いてください。
