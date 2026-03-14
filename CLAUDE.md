# プロジェクト概要

## システム概要

流星のロックマン3というゲームのメモリを監視し読み書きするアプリです。
melonDSというnintendo DSエミュレータをハックします。
フロントエンドはデスクトップ版とweb版があります。
デスクトップ版はゲームの状況に応じた画面表示を行い、
web版はカードの一覧を表示するのみで、DSとの連携は行いません

## 流星のロックマン3について

バージョンが２つあります。

- ブラックエース(BA)
- レッドジョーカー(RJ)

ファイナライズ(=変身)するとカードのフォルダ(デッキ)が変化します。変身にはLVがあり、ファイナライズLV毎にフォルダは異なります。

このアプリはバージョン/LVごとのフォルダのビューアです

## ディレクトリ構造

```plain
ssr3_viewer/
├── .claude/
├── .git/
├── .gitignore
├── apps/ # フロントエンドアプリ
│   ├── desktop/ # Electron製デスクトップアプリ
│   │   ├── node_modules/
│   │   └── src/
│   │       └── renderer/
│   │           └── src/
│   └── web/ # React製Webアプリ
│       ├── node_modules/
│       └── src/
├── Dll1/ # melonDS.exeをハックするDLLプログラム
│   ├── .vs/
│   ├── deps/
│   │   └── minhook/
│   │       ├── build/
│   │       ├── cmake/
│   │       ├── dll_resources/
│   │       ├── include/
│   │       └── src/
│   ├── Dll1/
│   │   └── x64/Release/
│   └── x64/Release/
├── melonDS-master/ # DSエミュレータmelonDS.exeのソースコード(git管理外)
├── node_modules/
├── packages/
│   └── ui/
│       ├── node_modules/
│       └── src/
│           ├── components/
│           ├── hooks/
│           ├── layouts/
│           └── pages/
├── specs/ # 指示書・仕様書のマークダウン群
├── umamusume-localify-develop/ # umamusume-localifyというDLLプロキシを駆使したメモリ監視ツールのソースコード(git管理外)
├── config.json
├── package.json
├── readme.md
├── tsconfig.base.json
├── type_images.json
└── yarn.lock
```

## Dll1

microsoft visual stuio2022のプロジェクト。
DLL注入用のDLLのプログラムをここに書く

## melonDS-master

nintendo DSのエミュレーターのソースコード。
ゲーム内部のメモリ値を操作する、Action Replay codesの実装もされている。

## umamusume-localify-develop

DLLプロキシを使いumamusumeというゲーム内部のアドレス値を読み取るツール。

## ファイナライズ関連アドレスの値遷移

### 主要アドレスと値の意味

| アドレスキー | 値の形式 | 意味 |
| --- | --- | --- |
| NOISE_RATE_1 | 0-9999+ (16進) | ノイズ率の生値。実ノイズ率 = `Math.trunc(値 / 10)`（末尾1桁はゴミ） |
| NOISE_RATE_2 | 同上 | NOISE_RATE_1と一致時に確定値とみなす |
| COMFIRM_LV_1 | 0-12 | ファイナライズ確認レベル。バトル開始の瞬間のみ0、バトル中は様々な値に変化 |
| COMFIRM_LV_2 | 0-12 | COMFIRM_LV_1と一致(1-12)＝ファイナライズ確認ダイアログ表示中 |
| F_Turn_Remaining | 0以上 | ファイナライズ残りターン数。>0＝変身中、0になったら解除 |

### 値同士の関連

- **ノイズ率 → フォルダレベル**: `getNoiseLevel(noiseRate, accessLvSum)` で算出
  - noiseRateのベーステーブル: LV1=200-249, LV2=250-299, LV3=300-349, LV4=350-399, LV5=400-499, LV6=500-599, LV7=600-699, LV8=700-799, LV9=800-899, LV10=900-998, LV11=999, LV12=1000+
  - accessLvSum（レゾンのaccessLv合計）がベースレベルに加算され、上限12でキャップ
- **COMFIRM_LV_1 === COMFIRM_LV_2 (1-12)**: ファイナライズ確認ダイアログが開いている。この値がファイナライズ時のレベルになる
- **COMFIRM_LV_1, COMFIRM_LV_2 が両方0**: バトル開始の瞬間のみ発生するイベント。バトル中は0以外の様々な値に変化し続ける
- **F_Turn_Remaining > 0**: ファイナライズ（変身）が実行中。この間カウントダウンし、0になったら変身解除

### ゲーム内の状態遷移

```plain
フィールド（バトル外）
  COMFIRM_LV_1/2: 前回バトルの残留値（不定、不一致）
  F_Turn_Remaining: 0
  NOISE_RATE: 現在のノイズ率（フィールドでも変動する）

    ↓ バトル開始

バトル開始の瞬間
  COMFIRM_LV_1: 0, COMFIRM_LV_2: 0  ← この瞬間のみ両方0になる
  F_Turn_Remaining: 0

    ↓ バトル進行

バトル中（ファイナライズ前）
  COMFIRM_LV_1/2: 様々な値に変化（不一致が基本）
  F_Turn_Remaining: 0
  NOISE_RATE: リアルタイムに変動（戦闘行動で上下する）

    ↓ プレイヤーがファイナライズ選択

ファイナライズ確認ダイアログ表示中
  COMFIRM_LV_1 === COMFIRM_LV_2（1-12で一致）← レベル確定の瞬間
  F_Turn_Remaining: まだ0

    ↓ ファイナライズ実行

ファイナライズ中（変身状態）
  F_Turn_Remaining: > 0 → ターン毎にカウントダウン
  COMFIRM_LV_1/2: 確定レベル値を保持
  NOISE_RATE: 変身中も変動しうる

    ↓ ターン消化完了

ファイナライズ解除（変身解除）
  F_Turn_Remaining: 0 になる ← これが解除の判定条件
  バトルは継続する（バトル終了とは別）
```

### アプリのフォルダレベル決定ロジック

通常時（ロック外）のレベル自動決定（FolderTab useEffect）:

1. **COMFIRM両方0（バトル開始）**: `getNoiseLevel(200, accessLvSum)` で最低レベルにリセット
2. **updateOnFinalizeモード（スイッチON）**: COMFIRM一致(1-12)のときだけそのレベルを採用。それ以外は更新しない
3. **リアルタイムモード（デフォルト）**: `noiseRate >= 200` なら `getNoiseLevel(noiseRate, accessLvSum)` で常時自動更新

### アプリのロック制御（gameStore内部ステート）

ロックとは、ファイナライズ実行中にフォルダレベルを固定し左右ボタンを非活性にする仕組み。

**内部フラグ**:

- `_initialized` (boolean): 初回fullメッセージ処理後にtrue。起動直後のロック防止に使用
- `_capturedNoiseRate` (number | null): COMFIRM一致(1-12)検出時にキャプチャしたノイズ率。ノイズ率が変動したら解除（null）
- `_confirmedFolderLevel` (Level | null): COMFIRM一致時の確定レベル値
- `_folderFinalized` (boolean): ロックフラグ本体

**ロックの流れ（checkFolderLock）**:

1. **リセット判定**: COMFIRM両方0（バトル開始）→ 全フラグOFF
2. **解除判定**: `_folderFinalized === true` かつ `F_Turn_Remaining === 0` → ロック解除（全フラグOFF）
3. **キャプチャ**: COMFIRM_LV_1 === COMFIRM_LV_2 (1-12) → ノイズ率と確定レベルを記録
4. **キャプチャ取消**: キャプチャ済みだがノイズ率が変動 → キャプチャ解除
5. **ロック確定**: キャプチャ中 + F_Turn_Remaining > 0 + `_initialized === true` → `_folderFinalized = true`

**ロック中の動作**:

- `effectiveLevel = confirmedLevel`（固定、左右ボタンで変わらない）
- 左右ボタンは非活性（`locked={folderFinalized}` → visibility: hidden + disabled）
- レベル自動決定のuseEffectはスキップ

### 起動時ファイナライズ中の特殊処理

アプリ起動時に既にファイナライズ中（F_Turn_Remaining > 0）の場合:

- `_initialized === false` のためロック確定ステップが発動しない → **ロックしない**
- `initialLevelSet` ref で初期レベルを一度だけ設定:
  - COMFIRM_LV_1 が 1-12 → そのレベルを表示
  - そうでなければ → `getNoiseLevel(noiseRate, accessLvSum)` でデフォルトレベル
- `initialLevelSet.current === true` の間、レベル自動決定はスキップ → **左右ボタンで自由にレベル切り替え可能**
- `F_Turn_Remaining === 0` になったら `initialLevelSet` を解除し通常モードに復帰

---

## AI-DLC and Spec-Driven Development

Kiro-style Spec Driven Development implementation on AI-DLC (AI Development Life Cycle)

## Project Context

### Paths
- Steering: `.kiro/steering/`
- Specs: `.kiro/specs/`

### Steering vs Specification

**Steering** (`.kiro/steering/`) - Guide AI with project-wide rules and context
**Specs** (`.kiro/specs/`) - Formalize development process for individual features

### Active Specifications
- Check `.kiro/specs/` for active specifications
- Use `/kiro:spec-status [feature-name]` to check progress

## Development Guidelines
- Think in English, generate responses in Japanese. All Markdown content written to project files (e.g., requirements.md, design.md, tasks.md, research.md, validation reports) MUST be written in the target language configured for this specification (see spec.json.language).

## Minimal Workflow
- Phase 0 (optional): `/kiro:steering`, `/kiro:steering-custom`
- Phase 1 (Specification):
  - `/kiro:spec-init "description"`
  - `/kiro:spec-requirements {feature}`
  - `/kiro:validate-gap {feature}` (optional: for existing codebase)
  - `/kiro:spec-design {feature} [-y]`
  - `/kiro:validate-design {feature}` (optional: design review)
  - `/kiro:spec-tasks {feature} [-y]`
- Phase 2 (Implementation): `/kiro:spec-impl {feature} [tasks]`
  - `/kiro:validate-impl {feature}` (optional: after implementation)
- Progress check: `/kiro:spec-status {feature}` (use anytime)

## Development Rules
- 3-phase approval workflow: Requirements → Design → Tasks → Implementation
- Human review required each phase; use `-y` only for intentional fast-track
- Keep steering current and verify alignment with `/kiro:spec-status`
- Follow the user's instructions precisely, and within that scope act autonomously: gather the necessary context and complete the requested work end-to-end in this run, asking questions only when essential information is missing or the instructions are critically ambiguous.

## Steering Configuration
- Load entire `.kiro/steering/` as project memory
- Default files: `product.md`, `tech.md`, `structure.md`
- Custom files are supported (managed via `/kiro:steering-custom`)
