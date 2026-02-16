# メモリ監視システム仕様書

## 1. 概要

melonDS内で動作するDLL（version.dll）とElectronアプリ間でリアルタイムにゲームメモリを監視・編集するシステム。

### 1.1 システム構成

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Electron App                                 │
│                                                                     │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────────────────┐   │
│  │  React UI   │ ← │  Zustand    │ ← │  PipeClient (main.ts)   │   │
│  │  Renderer   │   │  Store      │   │                         │   │
│  └─────────────┘   └─────────────┘   └───────────┬─────────────┘   │
│                                                   │                 │
└───────────────────────────────────────────────────│─────────────────┘
                                                    │ Named Pipe
                                                    │ \\.\pipe\ssr3_viewer
┌───────────────────────────────────────────────────│─────────────────┐
│                     melonDS Process               │                 │
│                                                   │                 │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    version.dll                               │   │
│  │                                                              │   │
│  │  ┌─────────────┐   ┌─────────────┐   ┌─────────────────┐    │   │
│  │  │ MemoryReader│ → │ DeltaTracker│ → │   PipeServer    │ ←──┼───┘
│  │  │  (50ms)     │   │             │   │                 │    │
│  │  └──────┬──────┘   └─────────────┘   └─────────────────┘    │
│  │         │                                                    │
│  │         ↓                                                    │
│  │  ┌─────────────┐                                             │
│  │  │  MainRAM    │  NDS メモリ空間 0x02000000-0x02400000       │
│  │  └─────────────┘                                             │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 起動順序

```text
1. melonDS起動 → version.dll ロード → Pipe Server 作成 → 接続待機
2. Electronアプリ起動 → Pipe Client 接続 → hello 受信
3. MainRAM検出完了 → full送信 → UI表示開始
```

**前提:** melonDSが先に起動し、Electronアプリが後から接続する。

### 1.3 状態遷移

```text
[DLL起動] → [Pipe待機] → [接続済み] → [MainRAM検出] → [監視中]
                              │              ↑            │
                              │              └────────────┘
                              │               (MainRAM消失時)
                              ↓
                         status送信
                     (ready: false)
```

| 状態 | Pipe接続 | MainRAM | Electron側表示 |
|------|----------|---------|----------------|
| Pipe待機 | × | - | 「接続待機中...」 |
| 接続済み/未検出 | ○ | × | 「ゲーム未起動」 |
| 監視中 | ○ | ○ | メモリ値表示 |

**MainRAMが後から見つかるケース:**
1. Electronアプリ先に起動・接続
2. status `{"ready":false}` を受信 → 「ゲーム未起動」表示
3. ユーザーがmelonDSでROM起動
4. DLLがMainRAM検出 → status `{"ready":true}` 送信
5. 続けて full 送信 → UI表示開始

### 1.4 要件

| 項目 | 要件 |
|------|------|
| 通信方式 | Named Pipe (双方向) |
| 更新間隔 | 50ms (20Hz) |
| 送信方式 | 差分更新 (変化した値のみ) |
| データ形式 | JSON (改行区切り) |
| 監視対象 | 36アドレス (ZENY, NOISE, CARD01-30, etc.) |
| 起動順序 | melonDS先、Electronアプリ後 |
| 複数インスタンス | 2つ目以降は監視無効 (DLLプロキシ機能は維持) |

---

## 2. 通信プロトコル

### 2.1 Named Pipe

| 項目 | 値 |
|------|-----|
| パイプ名 | `\\.\pipe\ssr3_viewer` |
| 方向 | PIPE_ACCESS_DUPLEX |
| モード | PIPE_TYPE_MESSAGE \| PIPE_READMODE_MESSAGE |
| フレーミング | 各JSONメッセージは `\n` (LF) で終端 |

### 2.2 メッセージ形式

#### 2.2.1 DLL → Electron

**接続確立**

```json
{"type":"hello","version":"1.0","count":36}
```

| フィールド | 型 | 説明 |
|-----------|-----|------|
| type | string | `"hello"` 固定 |
| version | string | プロトコルバージョン |
| count | number | 監視アドレス数 |

**フルステート**

```json
{
  "type":"full",
  "data":{
    "ZENY":{"v":12345,"a":"020F3394","s":4},
    "NOISE":{"v":128,"a":"020F39C0","s":1},
    "CARD01":{"v":5,"a":"020F3806","s":2}
  }
}
```

| フィールド | 型 | 説明 |
|-----------|-----|------|
| type | string | `"full"` 固定 |
| data | object | キー=アドレス名、値=GameValue |
| data[].v | number | 現在の値 |
| data[].a | string | DSアドレス (16進数文字列) |
| data[].s | number | バイトサイズ (1, 2, 4) |

送信タイミング:
- 接続直後
- `refresh` コマンド受信時

**差分更新**

```json
{"type":"delta","data":{"ZENY":{"v":12400},"NOISE":{"v":130}}}
```

| フィールド | 型 | 説明 |
|-----------|-----|------|
| type | string | `"delta"` 固定 |
| data | object | 変化したアドレスのみ |
| data[].v | number | 新しい値 |

送信タイミング:
- 50msポーリングで変化検知時
- 変化がなければ送信しない

**ステータス**

```json
{"type":"status","ready":true,"mainram":"0x1A2B3C4D5E6F"}
```

または MainRAM未検出時:

```json
{"type":"status","ready":false}
```

| フィールド | 型 | 説明 |
|-----------|-----|------|
| type | string | `"status"` 固定 |
| ready | boolean | MainRAM検出済みか |
| mainram | string | MainRAMホストアドレス (16進、ready=true時のみ) |

送信タイミング:

- Pipe接続直後 (hello の後)
- MainRAM検出状態が変化した時

**エラー**

```json
{"type":"error","code":"MAINRAM_NOT_FOUND","msg":"MainRAM detection failed"}
```

| コード | 説明 |
|--------|------|
| MAINRAM_NOT_FOUND | MainRAM検出失敗 |
| INVALID_COMMAND | 不正なコマンド |
| WRITE_FAILED | 書き込み失敗 |

#### 2.2.2 Electron → DLL

**値書き込み**

```json
{"cmd":"write","target":"ZENY","value":99999}
```

| フィールド | 型 | 説明 |
|-----------|-----|------|
| cmd | string | `"write"` 固定 |
| target | string | アドレス名 |
| value | number | 書き込む値 |

**フルステート要求**

```json
{"cmd":"refresh"}
```

**接続確認**

```json
{"cmd":"ping"}
```

応答: `{"type":"pong"}`

---

## 3. DLL側仕様

### 3.1 監視アドレス定義

```cpp
struct GameAddress {
    const char* name;      // アドレス名 (JSON キー)
    uint32_t dsAddress;    // DSメモリアドレス
    uint8_t size;          // バイトサイズ (1, 2, 4)
};

static const GameAddress GAME_ADDRESSES[] = {
    { "ZENY",    0x020F3394, 4 },
    { "NOISE",   0x020F39C0, 1 },
    { "WARLOCK", 0x020F2CD0, 4 },
    { "CARD01",  0x020F3806, 2 },
    { "CARD02",  0x020F3808, 2 },
    // ... CARD03-CARD30
    { "REG",     0x020F3844, 2 },
    { "TAG1_2",  0x020F3842, 2 },
};
```

### 3.2 PipeServer クラス

```cpp
class PipeServer {
public:
    // 初期化・終了
    bool Start(const char* pipeName);
    void Stop();

    // 送受信
    bool Send(const char* json);
    bool Receive(char* buffer, size_t bufferSize);

    // 状態
    bool IsConnected() const;
    bool HasPendingData() const;

private:
    HANDLE m_hPipe = INVALID_HANDLE_VALUE;
    std::thread m_listenThread;
    std::atomic<bool> m_running{false};
    std::atomic<bool> m_connected{false};
    std::mutex m_sendMutex;

    void ListenThread();
};
```

### 3.3 DeltaTracker クラス

```cpp
struct TrackedValue {
    const char* name;
    uint32_t dsAddress;
    uint8_t size;
    uint32_t currentValue;
    uint32_t lastSentValue;
    bool changed;
};

class DeltaTracker {
public:
    // 初期化
    void Initialize(const GameAddress* addresses, size_t count);

    // 更新 (毎ポーリング呼び出し)
    void Update(uint8_t* mainRAM, uint32_t mask);

    // JSON生成
    std::string BuildFullJson();
    std::string BuildDeltaJson();  // 変化なしなら空文字列

    // 変化フラグリセット
    void ClearChangeFlags();

private:
    std::vector<TrackedValue> m_values;

    uint32_t ReadValue(uint8_t* base, uint32_t offset, uint8_t size);
};
```

### 3.4 複数インスタンス対応

2つ目以降のmelonDSインスタンスでは監視機能を無効化する。
DLLプロキシ（version.dll転送）は維持し、melonDSの動作に影響を与えない。

```cpp
void MonitorThread() {
    PipeServer pipe;

    // Pipe作成試行
    if (!pipe.Start("\\\\.\\pipe\\ssr3_viewer")) {
        // 既に別インスタンスが存在 → 監視無効化、スレッド終了
        printf("[SSR3] Another instance already running. Monitoring disabled.\n");
        return;  // DLLプロキシ機能は継続
    }

    printf("[SSR3] Pipe server started. Monitoring enabled.\n");
    // ... 監視ループ継続
}
```

### 3.5 メインループ

```cpp
void MonitorThread() {
    PipeServer pipe;
    DeltaTracker tracker;
    bool wasMainRAMReady = false;  // 前回のMainRAM状態

    tracker.Initialize(GAME_ADDRESSES, ARRAY_SIZE(GAME_ADDRESSES));

    if (!pipe.Start("\\\\.\\pipe\\ssr3_viewer")) {
        printf("[SSR3] Another instance already running. Monitoring disabled.\n");
        return;
    }

    while (g_Running) {
        // Pipe接続待ち
        if (!pipe.IsConnected()) {
            Sleep(100);
            continue;
        }

        // MainRAM状態変化を検知
        bool isMainRAMReady = (g_MainRAM != nullptr);
        if (isMainRAMReady != wasMainRAMReady) {
            wasMainRAMReady = isMainRAMReady;
            if (isMainRAMReady) {
                // MainRAM検出 → status(ready:true) + full送信
                pipe.Send("{\"type\":\"status\",\"ready\":true}\n");
                pipe.Send(tracker.BuildFullJson().c_str());
            } else {
                // MainRAM消失 → status(ready:false)送信
                pipe.Send("{\"type\":\"status\",\"ready\":false}\n");
            }
        }

        // MainRAM未検出時は監視スキップ
        if (!g_MainRAM) {
            Sleep(100);
            continue;
        }

        // コマンド受信処理
        char cmdBuffer[256];
        if (pipe.Receive(cmdBuffer, sizeof(cmdBuffer))) {
            HandleCommand(cmdBuffer, pipe, tracker);
        }

        // メモリ読み取り & 差分検知
        tracker.Update(g_MainRAM, g_MainRAMMask);

        // 差分送信
        std::string delta = tracker.BuildDeltaJson();
        if (!delta.empty()) {
            pipe.Send(delta.c_str());
        }
        tracker.ClearChangeFlags();

        Sleep(50);  // 50ms間隔
    }

    pipe.Stop();
}
```

### 3.6 コマンドハンドラ

```cpp
void HandleCommand(const char* json, PipeServer& pipe, DeltaTracker& tracker) {
    // "cmd":"write" の処理
    if (strstr(json, "\"write\"")) {
        char target[32];
        uint32_t value;
        ParseWriteCommand(json, target, &value);

        for (const auto& addr : GAME_ADDRESSES) {
            if (strcmp(addr.name, target) == 0) {
                uint32_t offset = (addr.dsAddress - 0x02000000) & g_MainRAMMask;
                uint8_t* hostAddr = g_MainRAM + offset;

                switch (addr.size) {
                    case 4: SafeWriteU32(hostAddr, value); break;
                    case 2: SafeWriteU16(hostAddr, (uint16_t)value); break;
                    case 1: SafeWriteU8(hostAddr, (uint8_t)value); break;
                }
                break;
            }
        }
    }
    // "cmd":"refresh" の処理
    else if (strstr(json, "\"refresh\"")) {
        pipe.Send(tracker.BuildFullJson().c_str());
    }
    // "cmd":"ping" の処理
    else if (strstr(json, "\"ping\"")) {
        pipe.Send("{\"type\":\"pong\"}\n");
    }
}
```

---

## 4. Electron側仕様

### 4.1 PipeClient (main process)

```typescript
// src/main/pipeClient.ts
import * as net from 'net';
import { EventEmitter } from 'events';

export interface GameValue {
  v: number;
  a?: string;
  s?: number;
}

export interface GameMessage {
  type: 'hello' | 'full' | 'delta' | 'status' | 'error' | 'pong';
  data?: Record<string, GameValue>;
  version?: string;
  count?: number;
  code?: string;
  msg?: string;
}

export class PipeClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private buffer = '';
  private reconnectTimer: NodeJS.Timeout | null = null;

  connect(): void {
    this.socket = net.connect('\\\\.\\pipe\\ssr3_viewer');

    this.socket.on('connect', () => {
      this.emit('connected');
    });

    this.socket.on('data', (chunk) => {
      this.buffer += chunk.toString();
      this.processBuffer();
    });

    this.socket.on('close', () => {
      this.emit('disconnected');
      this.scheduleReconnect();
    });

    this.socket.on('error', (err) => {
      this.emit('error', err);
    });
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const msg: GameMessage = JSON.parse(line);
          this.emit('message', msg);
        } catch (e) {
          console.error('JSON parse error:', e);
        }
      }
    }
  }

  send(cmd: object): void {
    if (this.socket && !this.socket.destroyed) {
      this.socket.write(JSON.stringify(cmd) + '\n');
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.socket?.destroy();
    this.socket = null;
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => this.connect(), 2000);
  }
}
```

### 4.2 IPC Bridge

```typescript
// src/main.ts
import { app, BrowserWindow, ipcMain } from 'electron';
import { PipeClient, GameMessage } from './pipeClient';

let mainWindow: BrowserWindow;
let pipeClient: PipeClient;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Pipe Client初期化
  pipeClient = new PipeClient();

  pipeClient.on('connected', () => {
    mainWindow.webContents.send('game-connected');
  });

  pipeClient.on('disconnected', () => {
    mainWindow.webContents.send('game-disconnected');
  });

  pipeClient.on('message', (msg: GameMessage) => {
    mainWindow.webContents.send('game-message', msg);
  });

  pipeClient.connect();
}

// IPC handlers
ipcMain.on('game-write', (_, { target, value }) => {
  pipeClient.send({ cmd: 'write', target, value });
});

ipcMain.on('game-refresh', () => {
  pipeClient.send({ cmd: 'refresh' });
});

ipcMain.on('game-ping', () => {
  pipeClient.send({ cmd: 'ping' });
});
```

### 4.3 Preload Script

```typescript
// src/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

export interface GameAPI {
  onConnected: (callback: () => void) => void;
  onDisconnected: (callback: () => void) => void;
  onMessage: (callback: (msg: GameMessage) => void) => void;
  writeValue: (target: string, value: number) => void;
  refresh: () => void;
  ping: () => void;
}

contextBridge.exposeInMainWorld('gameAPI', {
  onConnected: (callback) => {
    ipcRenderer.on('game-connected', callback);
  },
  onDisconnected: (callback) => {
    ipcRenderer.on('game-disconnected', callback);
  },
  onMessage: (callback) => {
    ipcRenderer.on('game-message', (_, msg) => callback(msg));
  },
  writeValue: (target, value) => {
    ipcRenderer.send('game-write', { target, value });
  },
  refresh: () => {
    ipcRenderer.send('game-refresh');
  },
  ping: () => {
    ipcRenderer.send('game-ping');
  },
} as GameAPI);
```

### 4.4 Zustand Store

```typescript
// src/renderer/stores/gameStore.ts
import { create } from 'zustand';

export interface GameValue {
  v: number;
  a: string;
  s: number;
}

interface GameStore {
  // State
  connected: boolean;
  values: Record<string, GameValue>;

  // Actions
  setConnected: (connected: boolean) => void;
  handleMessage: (msg: GameMessage) => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  connected: false,
  values: {},

  setConnected: (connected) => set({ connected }),

  handleMessage: (msg) => {
    switch (msg.type) {
      case 'full':
        set({ values: msg.data as Record<string, GameValue> });
        break;

      case 'delta':
        set((state) => {
          const updated = { ...state.values };
          for (const [key, { v }] of Object.entries(msg.data || {})) {
            if (updated[key]) {
              updated[key] = { ...updated[key], v };
            }
          }
          return { values: updated };
        });
        break;
    }
  },
}));

// セレクター: 特定の値のみ購読
export const useGameValue = (name: string): number | undefined =>
  useGameStore((state) => state.values[name]?.v);

// セレクター: 接続状態
export const useGameConnected = (): boolean =>
  useGameStore((state) => state.connected);
```

### 4.5 React Hook (初期化)

```typescript
// src/renderer/hooks/useGameConnection.ts
import { useEffect } from 'react';
import { useGameStore } from '../stores/gameStore';

export function useGameConnection() {
  const setConnected = useGameStore((s) => s.setConnected);
  const handleMessage = useGameStore((s) => s.handleMessage);

  useEffect(() => {
    window.gameAPI.onConnected(() => setConnected(true));
    window.gameAPI.onDisconnected(() => setConnected(false));
    window.gameAPI.onMessage((msg) => handleMessage(msg));

    // 初回接続確認
    window.gameAPI.ping();
  }, []);
}
```

---

## 5. ファイル構成

```
ssr3_viewer/
├── Dll1/Dll1/
│   ├── dllmain.cpp          # エントリポイント (修正)
│   ├── pipe_server.h        # 新規
│   ├── pipe_server.cpp      # 新規
│   ├── delta_tracker.h      # 新規
│   ├── delta_tracker.cpp    # 新規
│   └── json_builder.h       # 新規 (軽量JSONビルダー)
│
└── apps/desktop/
    └── src/
        ├── main.ts              # 修正: PipeClient統合
        ├── preload.ts           # 修正: gameAPI追加
        ├── pipeClient.ts        # 新規
        └── renderer/src/
            ├── stores/
            │   └── gameStore.ts     # 新規
            ├── hooks/
            │   └── useGameConnection.ts  # 新規
            ├── components/
            │   ├── GameMonitor.tsx      # 新規: 監視UI
            │   └── ValueEditor.tsx      # 新規: 編集UI
            └── App.tsx              # 修正
```

---

## 6. 実装順序

### Phase 1: DLL側 (3-4日)

1. `json_builder.h` - 軽量JSONビルダー
2. `pipe_server.cpp/h` - Named Pipe Server
3. `delta_tracker.cpp/h` - 差分検知
4. `dllmain.cpp` 統合 - MonitorThread実装

### Phase 2: Electron側 (3-4日)

1. `pipeClient.ts` - Pipe通信
2. `main.ts` - IPC統合
3. `preload.ts` - gameAPI公開
4. `gameStore.ts` - Zustand Store

### Phase 3: UI (2-3日)

1. `useGameConnection.ts` - 初期化Hook
2. `GameMonitor.tsx` - 値一覧表示
3. `ValueEditor.tsx` - 値編集UI

---

## 7. テスト計画

| テスト項目 | 内容 |
|-----------|------|
| 接続テスト | DLL起動→Electron接続→hello受信 |
| 読み取りテスト | ゲーム内操作→UI反映確認 |
| 書き込みテスト | UI操作→ゲーム内反映確認 |
| 再接続テスト | melonDS再起動→自動再接続 |
| 複数インスタンス | 2つ目のmelonDS起動→監視無効確認→1つ目は正常動作 |
| 負荷テスト | 全36アドレス同時変化時のUI応答性 |
