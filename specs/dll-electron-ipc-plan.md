# DLL ↔ Electron IPC 実装計画

## 概要
melonDS内のversion.dll（メモリ監視）とElectronアプリ間のリアルタイム通信を実装する。

## 設計原則
1. **差分更新**: 変化した値のみ送信してトラフィック削減
2. **低遅延**: 50-100msポーリングでゲーム状態をリアルタイム反映
3. **堅牢性**: 接続切断・再接続に対応
4. **シンプル**: JSON形式で可読性とデバッグ容易性を確保

---

## 通信プロトコル仕様

### Named Pipe
- パイプ名: `\\.\pipe\ssr3_viewer`
- 方向: 双方向 (DUPLEX)
- モード: メッセージモード
- フレーミング: 各メッセージは `\n` (LF) で区切る

### メッセージ形式

#### DLL → Electron

**1. 接続確立応答**
```json
{"type":"hello","version":"1.0","addresses":36}
```

**2. フルステート (初回 & 定期的)**
```json
{
  "type": "full",
  "data": {
    "ZENY": {"v":12345,"a":"020F3394","s":4},
    "NOISE": {"v":128,"a":"020F39C0","s":1},
    "CARD01": {"v":5,"a":"020F3806","s":2}
  }
}
```
- `v`: value (値)
- `a`: address (DSアドレス、16進文字列)
- `s`: size (バイトサイズ: 1, 2, or 4)

**3. 差分更新**
```json
{
  "type": "delta",
  "data": {
    "ZENY": {"v":12400},
    "NOISE": {"v":130}
  }
}
```
- 変化した項目のみ含む
- `a`, `s` は省略 (初回fullで送信済み)

**4. エラー通知**
```json
{"type":"error","code":"MAINRAM_NOT_FOUND","msg":"MainRAM detection failed"}
```

**5. 状態通知**
```json
{"type":"status","connected":true,"gameActive":true,"mainram":"0x1A2B3C4D5E6F"}
```

#### Electron → DLL

**1. 値書き込み**
```json
{"cmd":"write","target":"ZENY","value":99999}
```

**2. フルステート要求**
```json
{"cmd":"refresh"}
```

**3. 接続確認**
```json
{"cmd":"ping"}
```
→ 応答: `{"type":"pong","ts":1704067200000}`

---

## 実装タスク

### Phase 1: DLL側 Named Pipe Server

#### Task 1.1: Pipe Server基盤
- [ ] `PipeServer` クラス作成
- [ ] 別スレッドでパイプ待機
- [ ] 接続/切断ハンドリング
- [ ] メッセージ送受信関数

```cpp
// pipe_server.h
class PipeServer {
public:
    bool Start(const char* pipeName);
    void Stop();
    bool Send(const char* json);
    bool IsConnected();

    // コールバック
    std::function<void(const char*)> OnMessage;
    std::function<void()> OnConnect;
    std::function<void()> OnDisconnect;

private:
    HANDLE m_hPipe;
    std::thread m_thread;
    std::atomic<bool> m_running;
};
```

#### Task 1.2: 差分検知ロジック
- [ ] 前回値の保持
- [ ] 変化検知ループ (50ms)
- [ ] JSON生成

```cpp
// delta_tracker.h
struct TrackedValue {
    const char* name;
    uint32_t dsAddress;
    uint8_t size;
    uint32_t lastValue;
    bool changed;
};

class DeltaTracker {
public:
    void RegisterAddress(const char* name, uint32_t addr, uint8_t size);
    void Update(uint8_t* mainRAM);  // 全アドレスを読み取り、変化を検知
    std::string GetFullStateJson();
    std::string GetDeltaJson();     // 変化があれば差分JSON、なければ空
    void ResetChangeFlags();

private:
    std::vector<TrackedValue> m_values;
    uint32_t m_seq = 0;
};
```

#### Task 1.3: コマンド処理
- [ ] JSON パース (軽量実装 or cJSON)
- [ ] write コマンド実装
- [ ] refresh コマンド実装

### Phase 2: Electron側 Pipe Client

#### Task 2.1: Node.js Pipe Client
- [ ] `net` モジュールでpipe接続
- [ ] 再接続ロジック
- [ ] メッセージパース

```typescript
// src/main/pipeClient.ts
import * as net from 'net';
import { EventEmitter } from 'events';

export class PipeClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private buffer = '';

  connect(pipeName: string): void;
  disconnect(): void;
  send(cmd: object): void;

  // Events: 'data', 'connected', 'disconnected', 'error'
}
```

#### Task 2.2: IPC Bridge (Main ↔ Renderer)
- [ ] preload.ts でAPI公開
- [ ] contextBridge経由の安全な通信

```typescript
// src/preload.ts
contextBridge.exposeInMainWorld('gameAPI', {
  onGameData: (callback: (data: GameState) => void) => {
    ipcRenderer.on('game-data', (_, data) => callback(data));
  },
  writeValue: (target: string, value: number) => {
    ipcRenderer.send('game-write', { target, value });
  },
  requestRefresh: () => {
    ipcRenderer.send('game-refresh');
  }
});
```

#### Task 2.3: React状態管理
- [ ] GameState型定義
- [ ] Context または Zustand でグローバル状態
- [ ] 差分マージロジック

```typescript
// src/renderer/src/stores/gameStore.ts
interface GameValue {
  value: number;
  address: string;
  size: number;
  lastUpdated: number;
}

interface GameState {
  connected: boolean;
  values: Record<string, GameValue>;  // "ZENY" -> GameValue
}
```

### Phase 3: UI実装

#### Task 3.1: 監視値一覧コンポーネント
- [ ] テーブル形式で全値表示
- [ ] 変化時のハイライトアニメーション
- [ ] 値編集UI

#### Task 3.2: 接続状態表示
- [ ] 接続/切断インジケーター
- [ ] MainRAMアドレス表示
- [ ] エラー表示

---

## ファイル構成 (予定)

```
Dll1/Dll1/
├── dllmain.cpp          # 既存 (修正)
├── pipe_server.cpp      # 新規: Named Pipe Server
├── pipe_server.h
├── delta_tracker.cpp    # 新規: 差分検知
├── delta_tracker.h
└── json_util.h          # 新規: 簡易JSONビルダー

apps/desktop/
├── src/
│   ├── main.ts          # 修正: PipeClient統合
│   ├── preload.ts       # 修正: gameAPI追加
│   ├── pipeClient.ts    # 新規: Pipe通信
│   └── renderer/src/
│       ├── stores/
│       │   └── gameStore.ts    # 新規: 状態管理
│       ├── components/
│       │   └── GameMonitor.tsx # 新規: 監視UI
│       └── App.tsx             # 修正
```

---

## 実装順序

```
Week 1: DLL側
  Day 1-2: PipeServer基盤
  Day 3-4: DeltaTracker実装
  Day 5: コマンド処理 & テスト

Week 2: Electron側
  Day 1-2: PipeClient実装
  Day 3: IPC Bridge
  Day 4-5: React状態管理 & UI

Week 3: 統合テスト & 改善
```

---

## 考慮事項

### パフォーマンス
- ポーリング間隔: 50ms (20 FPS相当)
- 36アドレス × 4バイト = 144バイト/回の読み取り
- 差分送信により通常は数十バイト/回のJSON

### エラーハンドリング
- melonDS終了時: DLL側でpipe切断 → Electron側で再接続待機
- MainRAM未検出: status メッセージで通知
- 不正コマンド: error メッセージで応答

### セキュリティ
- Named Pipeはローカル通信のみ
- contextBridge経由でRenderer隔離維持

---

## 次のアクション
1. [ ] DLL側 PipeServer 実装開始
2. [ ] 簡易JSONビルダー作成
3. [ ] DeltaTracker実装
