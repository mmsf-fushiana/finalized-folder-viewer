# ssr3_viewer DLL (version.dll)

melonDS.exe に DLL プロキシとして読み込まれ、流星のロックマン3 (MMSF3) のメモリを
Named Pipe `\\.\pipe\ssr3_viewer` 経由でデスクトップアプリへ配信する。

- ロード中の ROM を自動判定する（流星3 かどうか、BA / RJ のどちらか、ROM ファイル名）
- 版に応じたアドレス表を自動で登録・入れ替える（手動のバージョン選択は不要）
- 50ms ごとに値を読み、変化分 (`delta`) と定期フル (`full`) を送る
- アプリからの `write` で値を書き換える

プロトコルの詳細は `specs/pipe-protocol-spec.md` を参照。

## ビルド方法

1. Visual Studio 2022 で `Dll1.sln` を開く
2. **x64** / **Release** を選択（Win32 構成は `version.dll` を生成しない）
3. ビルド実行 (Ctrl+Shift+B)
4. `x64\Release\version.dll` が生成される

コマンドラインの場合:

```
"C:\Program Files\Microsoft Visual Studio\2022\Community\MSBuild\Current\Bin\MSBuild.exe" Dll1.sln -p:Configuration=Release -p:Platform=x64 -t:Rebuild
```

## 使用方法

1. `version.dll` を **melonDS.exe と同じフォルダ** にコピー（melonDS 1.x / 0.9.5 どちらでも可）
2. melonDS.exe を起動し、デスクトップアプリを起動する
3. 流星のロックマン3 の ROM を読み込むと、アプリが自動で版を判定してモニター画面へ進む

## 仕組み

### DLL Hijacking
Windows は EXE と同じフォルダの DLL を優先ロードする。
`version.dll` を配置することで自動的にロードされ、本物の version.dll（System32）の機能は内部で呼び出す。

### MainRAM の検出
melonDS の NDS オブジェクトにある `[MainRAM ポインタ][MainRAMMask]` のパターンをヒープから探す。
クライアント接続中かつ未検出の間、500ms ごとに自動で再スキャンする。

### ROM の判定 (`rom_detect.h`)
- melonDS は ROM ブート時に ROM ヘッダを DS アドレス 0x027FFE00（MainRAM + 0x3FFE00）へコピーする。
  そのゲームコードが `CRRJ` なら RJ、`CRBJ` なら BA。全ゼロなら未ロード。
- ROM ファイル名は MainRAM に無いので、melonDS がブート直後に書く設定ファイル
  （1.x: `melonDS.toml` の `RecentROM` 先頭、0.9.x: `melonDS.ini` の `RecentROM_0`）から取る。
  ファイル先頭 16 バイトがヘッダと一致した時だけ採用する。
- melonDS を開いたまま ROM を切り替えても、ヘッダと設定ファイルの変化で追従する。

### スレッド構成
- メインスレッド: MainRAM 検出、ROM 判定、アドレス表の入れ替え、値の読み取りと送信
- パイプ受信スレッド: コマンド処理（`status` の生成はロック下、フルステート送信はメインスレッドに依頼）

## ファイル構成

```
Dll1/
├── Dll1.sln
├── README.md
└── Dll1/
    ├── dllmain.cpp        # エントリ、MainRAM 検出、メインループ、コマンド処理
    ├── rom_detect.h       # ROM 判定（ヘッダミラー、設定ファイル解析）
    ├── delta_tracker.*    # アドレス表と差分検知
    ├── pipe_server.*      # Named Pipe サーバ
    ├── json_util.h        # JSON 生成・簡易パーサ
    ├── framework.h / pch.* / version.def
    └── Dll1.vcxproj
```
