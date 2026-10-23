# Named Pipe 通信プロトコル仕様書

## 概要

DLL（melonDS内部に注入）とElectronデスクトップアプリ間のリアルタイム通信プロトコル。
Named Pipe を使用し、LF区切りのJSONメッセージを双方向にやり取りする。

## パイプ設定

| 項目 | 値 |
|------|-----|
| パイプ名 | `\\.\pipe\ssr3_viewer` |
| 出力バッファ | 8192 bytes |
| 入力バッファ | 4096 bytes |
| モード | `PIPE_TYPE_BYTE \| PIPE_READMODE_BYTE` |
| アクセス | `PIPE_ACCESS_DUPLEX \| FILE_FLAG_OVERLAPPED` |
| 最大インスタンス数 | 1（単一クライアント） |
| メッセージ区切り | LF (`\n`) |

## メッセージフォーマット

全メッセージ共通: **JSON + LF (`\n`)** で1メッセージ。

---

## コマンド（Electron → DLL）

### ping

DLLの生存確認。

```json
{"cmd":"ping"}
```

**レスポンス**: `pong` メッセージ

---

### refresh

現在の状態とフルステートの再送を要求する。

```json
{"cmd":"refresh"}
```

**レスポンス**:
1. `status` メッセージ（常に即時送信）
2. `full` メッセージ（版が判定済みの場合、DLL メインスレッドの次の tick で送信）

---

### write

ゲームメモリに値を書き込む。

```json
{"cmd":"write","target":"ZENY","value":99999}
```

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `cmd` | string | `"write"` |
| `target` | string | アドレス識別名（例: `"ZENY"`, `"NOISE"`, `"CARD01"`） |
| `value` | uint32 | 書き込む値 |

**レスポンス**:
- 成功時: レスポンスなし（サイレント）
- 失敗時: `error` メッセージ（`WRITE_FAILED` or `UNKNOWN_TARGET`）

---

### rescan

MainRAM の再スキャンを要求する（手動フォールバック）。
DLL はクライアント接続中かつ未検出の間、500ms 間隔で自動的にスキャンするので、通常はフロントエンドから送る必要はない。

```json
{"cmd":"rescan"}
```

**レスポンス**: `status` メッセージ（現在の状態を即時返す）。
スキャン自体はメインスレッドが次の tick で行い、検出できればもう一度 `status` を送る。

---

## コマンドパーサー

DLL側の `ParseCommand` が受理するJSON構造:

```cpp
struct JsonCommand {
    char cmd[32];       // コマンド名（必須）
    char target[32];    // 対象アドレス名（オプション）
    uint32_t value;     // 書き込み値（オプション、10進数）
    bool valid;         // パース成功フラグ
};
```

- `cmd` フィールドが存在しない場合、`valid=false` となりコマンドは破棄される

---

## メッセージ（DLL → Electron）

### hello

クライアント接続時に最初に送信される。

```json
{"type":"hello","version":"1.0","addresses":147}
```

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `type` | string | `"hello"` |
| `version` | string | プロトコルバージョン（現在 `"1.0"`） |
| `addresses` | uint32 | 登録済みアドレス数 |

---

### status

ゲーム接続状態と、ロード中 ROM の判定結果の通知。

```json
{"type":"status","connected":true,"gameActive":true,"mainram":"0x1A2B3C4D",
 "romLoaded":true,"romCode":"CRRJ","romVersion":"RJ",
 "romFile":"ビググレ種.nds","romPath":"C:\\Users\\...\\save\\ビググレ種.nds"}
```

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `type` | string | `"status"` |
| `connected` | boolean | パイプ接続状態（常に `true`） |
| `gameActive` | boolean | MainRAM検出済みかどうか |
| `mainram` | string（省略可能） | MainRAMポインタの16進表記。`gameActive=true` の場合のみ |
| `romLoaded` | boolean | ROM ヘッダミラー (DS 0x027FFE00) が全ゼロでない（何らかの ROM がブート済み） |
| `romCode` | string | ヘッダのゲームコード 4 文字（`"CRRJ"` / `"CRBJ"` など）。未ロード時 `""` |
| `romVersion` | string | 判定した版。`"RJ"`（CRRJ）/ `"BA"`（CRBJ）/ `""`（流星3 以外・未ロード） |
| `romFile` | string | ROM ファイル名。未確定時 `""` |
| `romPath` | string | ROM のフルパス。未確定時 `""`。アーカイブ内 ROM は `"a.zip|b.nds"` |

**ROM 判定の仕組み**:
- 版はヘッダミラーのゲームコードだけで決まり、DLL が対応する版のアドレス表を自動で登録・入れ替える。
  melonDS の Reset でヘッダが一瞬ゼロになっても、300ms 続かなければ `romLoaded` は落とさない。
- ファイル名は melonDS がブート直後に書き換える設定ファイル
  （1.x: `melonDS.toml` の `RecentROM` 先頭、0.9.x: `melonDS.ini` の `RecentROM_0`）から取る。
  設定ファイルは melonDS.exe と同じフォルダ（`portable` サブフォルダがあればそちら）にある。
- 設定ファイルはヘッダより後に書かれるため、`romFile` / `romPath` は
  **そのファイルの先頭 16 バイトがヘッダミラーと一致した時だけ** 載せる。
  切り替え直後は `romVersion` だけ先に変わり、ファイル名は少し遅れて届く。アーカイブ内 ROM は照合せず採用する。
- 設定ファイルが読めない・書き込み途中の間は前回のファイル名を維持する。Recent を Clear した直後は `""` になる。

**送信タイミング**:
- クライアント接続時（`hello` の直後）
- `refresh` / `rescan` コマンド受信時
- MainRAM を検出した時
- ROM 状態（`romLoaded` / `romCode` / `romVersion` / `romFile` / `romPath`）のいずれかが変化した時

---

### full

全アドレスの現在値を含む完全なステートスナップショット。

```json
{
  "type":"full",
  "data":{
    "ZENY":{"v":"000186A0","a":"020F3394","s":4},
    "NOISE":{"v":"01","a":"020F39C0","s":1},
    "CARD01":{"v":"1234","a":"120F3806","s":2}
  }
}
```

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `type` | string | `"full"` |
| `data` | object | アドレス名 → 値オブジェクトのマップ |

**値オブジェクト**:

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `v` | string | 16進値（ビッグエンディアン、サイズ依存の桁数） |
| `a` | string | DSメモリアドレス（8桁16進、例: `"020F3394"`） |
| `s` | uint8 | バイトサイズ（1, 2, or 4） |

**値の桁数ルール**:
| サイズ | 桁数 | 例 |
|--------|------|-----|
| 1 byte | 2桁 | `"FF"` |
| 2 bytes | 4桁 | `"FFFF"` |
| 4 bytes | 8桁 | `"FFFFFFFF"` |

**送信タイミング**（いずれも DLL メインスレッドから、版が判定済みの場合のみ）:
- 版が判定・切り替わった直後（アドレス表の入れ替え後）
- 同じ版のまま別の ROM ファイルに切り替わった直後
- `refresh` コマンド受信後の次の tick
- クライアント接続後の次の tick
- メインポーリングループで30秒ごと

---

### delta

前回送信からの変更差分のみを含むメッセージ。

```json
{
  "type":"delta",
  "data":{
    "ZENY":{"v":"000186A0"},
    "CARD01":{"v":"1234"}
  }
}
```

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `type` | string | `"delta"` |
| `data` | object | 変更されたアドレス名 → 値のマップ |

**差分値オブジェクト**:
| フィールド | 型 | 説明 |
|-----------|-----|------|
| `v` | string | 16進値（`full` と同じフォーマット） |

- `a`（アドレス）と `s`（サイズ）は含まれない（クライアントは `full` から既知）
- 変更が0件の場合は送信されない

**送信タイミング**:
- メインポーリングループ（50ms間隔）で変更を検出した場合

---

### error

エラー通知。

```json
{"type":"error","code":"WRITE_FAILED","msg":"Memory write failed"}
```

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `type` | string | `"error"` |
| `code` | string | エラーコード |
| `msg` | string | 人間可読なエラーメッセージ |

**エラーコード一覧**:

| コード | 発生条件 |
|--------|---------|
| `WRITE_FAILED` | メモリ書き込みに失敗 |
| `UNKNOWN_TARGET` | 指定されたアドレス名が未登録 |
| `UNKNOWN_CMD` | 不明なコマンド名 |

---

### pong

`ping` コマンドへの応答。

```json
{"type":"pong","ts":1234567890000}
```

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `type` | string | `"pong"` |
| `ts` | int64 | Unixタイムスタンプ（ミリ秒） |

---

## 通信シーケンス

### 正常フロー

```
Electron                          DLL (in melonDS)
   │                                  │
   │  ── 接続(Named Pipe) ──────────>  │
   │                                  │
   │  <──── hello ──────────────────  │  接続直後
   │  <──── status{gameActive,rom*}   │  現在の検出状態
   │                                  │
   │                                  │  (接続中・未検出の間 500ms毎にヒープスキャン)
   │  <──── status{gameActive:true}   │  MainRAM検出
   │                                  │
   │                                  │  ユーザーが melonDS で ROM を読み込む
   │  <──── status{romVersion:"BA"}   │  ヘッダから版を判定 → アドレス表を登録
   │  <──── full ──────────────────  │  全アドレスの初期値
   │  <──── status{romFile:"x.nds"}   │  設定ファイルからファイル名を確認
   │                                  │
   │  <──── delta ─────────────────  │  50ms毎（変更あり時）
   │  <──── full ──────────────────  │  30秒毎の定期フル送信
   │                                  │
   │                                  │  ユーザーが別版の ROM に切り替える
   │  <──── status{romVersion:"RJ"}   │  アドレス表を入れ替え
   │  <──── full ──────────────────  │
   │  <──── status{romFile:"y.nds"}   │
   │                                  │
   │  ── write{ZENY, 99999} ──────>  │  値書き込み
   │                                  │
   │  ── ping ────────────────────>  │  生存確認
   │  <──── pong ──────────────────  │
```

### 再接続フロー

```
Electron                          DLL
   │                                  │
   │  ×× 切断 ××                      │
   │                                  │
   │  (100ms後に自動再接続)            │
   │  ── TCP接続(Named Pipe) ──────>  │
   │                                  │
   │  <──── hello ──────────────────  │
   │  <──── status ────────────────  │  最新の検出状態
   │  <──── full ──────────────────  │  版が判定済みなら次の tick
```

---

## ポーリングタイミング

| 対象 | 間隔 | 実行側 |
|------|------|--------|
| パイプ再接続 | 100ms | Electron (PipeClient) |
| MainRAM 自動検出 | 500ms | DLL (メインポーリングループ) ※ クライアント接続中かつ未検出の間のみ |
| ROM 状態監視（ヘッダミラー） | 50ms | DLL (メインポーリングループ) |
| ROM 状態監視（設定ファイル） | 100ms（ファイル名未確定時）/ 500ms（確定後） | DLL (メインポーリングループ) |
| メモリ読み取り（delta検出） | 50ms | DLL (メインポーリングループ) |
| フルステート再送信 | 30秒 | DLL (メインポーリングループ内) |

---

## Electron IPC マッピング

フロントエンド(Renderer) → Preload → Main → DLL の対応:

| Renderer API | IPC チャネル | PipeClient メソッド | DLL コマンド |
|-------------|-------------|-------------------|-------------|
| `gameAPI.ping()` | `game-ping` | `ping()` | `{"cmd":"ping"}` |
| `gameAPI.requestRefresh()` | `game-refresh` | `requestRefresh()` | `{"cmd":"refresh"}` |
| `gameAPI.writeValue(t, v)` | `game-write` | `writeValue(t, v)` | `{"cmd":"write","target":"...","value":...}` |
| `gameAPI.rescan()` | `game-rescan` | `rescan()` | `{"cmd":"rescan"}` |
| `gameAPI.getPipeStatus()` | `get-pipe-status` | ― | ―（Main側で管理） |

DLL → Main → Preload → Renderer の対応:

| DLL メッセージ | IPC チャネル | Renderer イベント |
|---------------|-------------|-----------------|
| 全メッセージ型 | `game-message` | `gameAPI.onMessage(callback)` |
| ―（接続/切断） | `pipe-status` | `gameAPI.onPipeStatus(callback)` |
