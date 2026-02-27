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
