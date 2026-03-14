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

### setVersion

監視対象バージョンを設定する。セッション中1回のみ有効（再設定不可）。

```json
{"cmd":"setVersion","target":"BA"}
```

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `cmd` | string | `"setVersion"` |
| `target` | string | `"BA"` (Black Ace) または `"RJ"` (Red Joker) |

**動作**:
1. 対応するバージョンのアドレスマップ（約147個）を DeltaTracker に登録
2. MainRAM検出済みの場合、即座に `full` メッセージを送信
3. 2回目以降の呼び出しは無視される

---

### refresh

現在の状態とフルステートの再送を要求する。

```json
{"cmd":"refresh"}
```

**レスポンス**:
1. `status` メッセージ（常に送信）
2. `full` メッセージ（MainRAM検出済み＋バージョン選択済みの場合のみ）

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

MainRAMのヒープスキャン検出を要求する。未検出時のみスキャンを実行する。

```json
{"cmd":"rescan"}
```

**レスポンス**: `status` メッセージ（最新の検出状態を含む）

**コンテキスト**:
フロントエンドが `pipeConnected && !gameActive` の間、500ms間隔で送信する。
ROM読み込みタイミングに依存せず、いつでもMainRAMを検出可能にするためのコマンド。

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

ゲーム接続状態の通知。

```json
{"type":"status","connected":true,"gameActive":true,"mainram":"0x1A2B3C4D"}
```

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `type` | string | `"status"` |
| `connected` | boolean | パイプ接続状態（常に `true`） |
| `gameActive` | boolean | MainRAM検出済みかどうか |
| `mainram` | string（省略可能） | MainRAMポインタの16進表記。`gameActive=true` の場合のみ |

**送信タイミング**:
- クライアント接続時（`hello` の直後）
- `refresh` コマンド受信時
- `rescan` コマンド受信時

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

**送信タイミング**:
- `setVersion` コマンド受信時（MainRAM検出済みの場合）
- `refresh` コマンド受信時（バージョン選択済みの場合）
- メインポーリングループで30秒ごと
- クライアント再接続時（バージョン選択済み＋MainRAM検出済みの場合）

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
   │  ── TCP接続(Named Pipe) ──────>  │
   │                                  │
   │  <──── hello ──────────────────  │  接続直後
   │  <──── status{gameActive} ────  │  現在のMainRAM検出状態
   │                                  │
   │  ── rescan ──────────────────>  │  gameActive=false の間 500ms毎
   │  <──── status{gameActive:false}  │  未検出
   │  ── rescan ──────────────────>  │
   │  <──── status{gameActive:true}   │  ROM読み込み後に検出成功
   │                                  │
   │  ── setVersion{target:"BA"} ──>  │  ユーザーがバージョン選択
   │  <──── full ──────────────────  │  全アドレスの初期値
   │                                  │
   │  <──── delta ─────────────────  │  50ms毎（変更あり時）
   │  <──── delta ─────────────────  │
   │  <──── full ──────────────────  │  30秒毎の定期フル送信
   │  <──── delta ─────────────────  │
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
   │  <──── full ──────────────────  │  バージョン選択済みなら即時
```

---

## ポーリングタイミング

| 対象 | 間隔 | 実行側 |
|------|------|--------|
| パイプ再接続 | 100ms | Electron (PipeClient) |
| MainRAM rescan | 500ms | Frontend (DesktopHome.tsx) ※ `gameActive=false` の間のみ |
| メモリ読み取り（delta検出） | 50ms | DLL (メインポーリングループ) |
| フルステート再送信 | 30秒 | DLL (メインポーリングループ内) |
| バージョン選択待機 | 100ms | DLL (MainThreadFunc) |

---

## Electron IPC マッピング

フロントエンド(Renderer) → Preload → Main → DLL の対応:

| Renderer API | IPC チャネル | PipeClient メソッド | DLL コマンド |
|-------------|-------------|-------------------|-------------|
| `gameAPI.ping()` | `game-ping` | `ping()` | `{"cmd":"ping"}` |
| `gameAPI.setVersion(ver)` | `game-setVersion` | `setVersion(ver)` | `{"cmd":"setVersion","target":"..."}` |
| `gameAPI.requestRefresh()` | `game-refresh` | `requestRefresh()` | `{"cmd":"refresh"}` |
| `gameAPI.writeValue(t, v)` | `game-write` | `writeValue(t, v)` | `{"cmd":"write","target":"...","value":...}` |
| `gameAPI.rescan()` | `game-rescan` | `rescan()` | `{"cmd":"rescan"}` |
| `gameAPI.getPipeStatus()` | `get-pipe-status` | ― | ―（Main側で管理） |

DLL → Main → Preload → Renderer の対応:

| DLL メッセージ | IPC チャネル | Renderer イベント |
|---------------|-------------|-----------------|
| 全メッセージ型 | `game-message` | `gameAPI.onMessage(callback)` |
| ―（接続/切断） | `pipe-status` | `gameAPI.onPipeStatus(callback)` |
