# MMFS3 Viewer

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
