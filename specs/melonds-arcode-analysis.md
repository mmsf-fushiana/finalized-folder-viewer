# melonDS Action Replay コード実装分析

## 概要

melonDSはNintendo DSエミュレーターであり、Action Replay（AR）コード/チートコードの実行機能を実装している。
本ドキュメントはその実装を分析し、DLL注入によるメモリ操作ツール開発への応用知見をまとめる。

---

## ファイル構成

| ファイル | 役割 |
|---------|------|
| `src/ARCodeFile.h` / `.cpp` | チートファイルの読み込み・保存処理 |
| `src/AREngine.h` / `.cpp` | **ARコード実行エンジン（核心部分）** |
| `src/ARM.cpp` | 実行タイミングの制御（VBlank割り込みハンドラ） |
| `src/NDS.h` | エミュレータ本体への統合 |

---

## データ構造

### ARCode構造体

```cpp
struct ARCode
{
    std::string Name;           // コード名
    bool Enabled;               // 有効/無効フラグ
    std::vector<u32> Code;      // コード命令のベクタ（各要素32ビット）
};
```

### AREngine クラス

```cpp
class AREngine
{
public:
    AREngine(melonDS::NDS& nds);
    std::vector<ARCode> Cheats;     // 現在有効なチート

private:
    void RunCheats();               // すべてのチートを実行
    void RunCheat(const ARCode& arcode);  // 単一チートを実行
    melonDS::NDS& NDS;              // エミュレータへのリファレンス
};
```

---

## 実行フロー

```
[エミュレーション実行ループ]
           ↓
    [フレーム実行]
           ↓
  [VBlank割り込み発生]
           ↓
   [ARM7 IRQ ハンドラ]
           ↓
 [AREngine::RunCheats()]
           ↓
  [各チートを順番に実行]
           ↓
[RunCheat() で命令を解釈・実行]
```

### 実行タイミング（ARM.cpp より）

```cpp
void ARM::IRQ()
{
    // ARM7のVBlank割り込み時にチート実行
    if (Num == 1)  // ARM7のみ
    {
        if ((NDS.IF[1] & NDS.IE[1]) & (1<<IRQ_VBlank))
            NDS.AREngine.RunCheats();
    }
}
```

**ポイント**: 毎フレームのVBlank（約60fps）で自動実行される

---

## ARコードフォーマット

### 命令構造

各命令は **8バイト（32bit × 2）** のペア：

```
XXXXXXXX YYYYYYYY
   ↓         ↓
   a         b
```

- `a >> 24` = **オペコード**（命令の種類）
- `a & 0x0FFFFFFF` = **アドレス**
- `b` = **データ/パラメータ**

### ファイル形式

```
CAT カテゴリ名

CODE 1 コード名
XXXXXXXX YYYYYYYY
AAAAAAAA BBBBBBBB

CODE 0 無効なコード
CCCCCCCC DDDDDDDD
```

- `#` で始まる行はコメント
- `CAT` - カテゴリの開始
- `CODE 1/0` - コード定義（1=有効, 0=無効）

---

## 内部レジスタ

```cpp
u32 offset = 0;      // ベースアドレスのオフセット
u32 datareg = 0;     // 計算用データレジスタ
u32 cond = 1;        // 条件フラグ (1=真, 0=偽)
u32 condstack = 0;   // ネストした条件を保存するスタック
u32 loopcount = 0;   // ループカウンタ
u32 loopstart;       // ループ開始位置
u32 c5count = 0;     // C5オペコード用カウンタ
```

---

## オペコード一覧

### メモリ書き込み

| オペコード | 機能 | 実装 |
|-----------|------|------|
| `0x0n` | 32bit書き込み | `[addr+offset] = b` |
| `0x1n` | 16bit書き込み | `[addr+offset] = b & 0xFFFF` |
| `0x2n` | 8bit書き込み | `[addr+offset] = b & 0xFF` |

```cpp
case16(0x00):
    NDS.ARM7Write32((a & 0x0FFFFFFF) + offset, b);
    break;
```

### 条件分岐（32bit比較）

| オペコード | 条件 |
|-----------|------|
| `0x3n` | `b > [addr]` |
| `0x4n` | `b < [addr]` |
| `0x5n` | `b == [addr]` |
| `0x6n` | `b != [addr]` |

### 条件分岐（16bitマスク付き比較）

| オペコード | 条件 |
|-----------|------|
| `0x7n` | `(b & 0xFFFF) > ((~(b >> 16)) & [addr])` |
| `0x8n` | `(b & 0xFFFF) < ((~(b >> 16)) & [addr])` |
| `0x9n` | `(b & 0xFFFF) == ((~(b >> 16)) & [addr])` |
| `0xAn` | `(b & 0xFFFF) != ((~(b >> 16)) & [addr])` |

```cpp
case16(0x50):  // IF b == [addr]
    condstack <<= 1;
    condstack |= cond;
    cond = (b == NDS.ARM7Read32((a & 0x0FFFFFFF) + offset)) ? 1 : 0;
    break;
```

### オフセット操作

| オペコード | 機能 |
|-----------|------|
| `0xB0` | `offset = [addr + offset]` （ポインタ追跡） |
| `0xD3` | `offset = b` |
| `0xDC` | `offset += b` |
| `0xC6` | `[b] = offset` |

### ループ制御

| オペコード | 機能 |
|-----------|------|
| `0xC0` | ループ開始（b回繰り返す） |
| `0xD1` | NEXT（ループ継続） |
| `0xD2` | NEXT + 全状態リセット |

```cpp
case 0xC0:  // FOR 0..b
    loopstart = code;
    loopcount = b;
    loopcond = cond;
    loopcondstack = condstack;
    break;

case 0xD1:  // NEXT
    if (loopcount > 0) {
        loopcount--;
        code = loopstart;
    } else {
        cond = loopcond;
        condstack = loopcondstack;
    }
    break;
```

### 条件制御

| オペコード | 機能 |
|-----------|------|
| `0xC5` | カウンタ増加 + 条件チェック |
| `0xD0` | ENDIF（条件スタックから復元） |

```cpp
case 0xD0:  // ENDIF
    cond = condstack & 0x1;
    condstack >>= 1;
    break;
```

### データレジスタ操作

| オペコード | 機能 |
|-----------|------|
| `0xD5` | `datareg = b` |
| `0xD4` | `datareg` に対する演算（サブオペコードで指定） |

**D4サブオペコード (`a & 0xFF`):**

| 値 | 演算 |
|----|------|
| 0x00 | `datareg += b` |
| 0x01 | `datareg \|= b` |
| 0x02 | `datareg &= b` |
| 0x03 | `datareg ^= b` |
| 0x04 | `datareg <<= b` |
| 0x05 | `datareg >>= b` |
| 0x06 | `datareg = ROR(datareg, b)` |
| 0x07 | `datareg = (s32)datareg >> b` |
| 0x08 | `datareg *= b` |

### データレジスタ ⇔ メモリ

| オペコード | 機能 |
|-----------|------|
| `0xD6` | `[b+offset] = datareg` (32bit), `offset += 4` |
| `0xD7` | `[b+offset] = datareg` (16bit), `offset += 2` |
| `0xD8` | `[b+offset] = datareg` (8bit), `offset += 1` |
| `0xD9` | `datareg = [b+offset]` (32bit) |
| `0xDA` | `datareg = [b+offset]` (16bit) |
| `0xDB` | `datareg = [b+offset]` (8bit) |

### メモリコピー

| オペコード | 機能 |
|-----------|------|
| `0xEn` | コード内データ → メモリ（bバイト） |
| `0xFn` | メモリ → メモリ（bバイト） |

---

## 条件付き実行の仕組み

```cpp
// 条件フラグがfalseの場合、大部分のオペコードをスキップ
if ((op < 0xD0 && op != 0xC5) || op > 0xD2)
{
    if (!cond)
    {
        // E0オペコードは追加データをスキップする必要あり
        if ((op & 0xF0) == 0xE0)
        {
            for (u32 i = 0; i < b; i += 8)
                code += 2;
        }
        continue;
    }
}
```

---

## DLL注入への応用

### 対応関係

| melonDS | Windows API |
|---------|-------------|
| `ARM7Read8/16/32` | `ReadProcessMemory` |
| `ARM7Write8/16/32` | `WriteProcessMemory` |
| VBlank割り込み | ゲームループフック / タイマー |
| offset（ポインタ追跡） | ポインタチェーン解決 |

### 実装パターン

#### 1. 基本的なメモリ書き込み

```cpp
// melonDS
NDS.ARM7Write32(address, value);

// Windows DLL
WriteProcessMemory(hProcess, (LPVOID)address, &value, sizeof(value), NULL);
```

#### 2. ポインタチェーン（動的アドレス解決）

```cpp
// melonDS: 0xB0オペコード
offset = NDS.ARM7Read32(address + offset);

// Windows DLL
DWORD baseAddr;
ReadProcessMemory(hProcess, (LPVOID)(baseAddress + offset), &baseAddr, 4, NULL);
offset = baseAddr;
```

#### 3. 条件付き書き込み

```cpp
// melonDS: 0x50 + 0x00 + 0xD0
// IF [addr] == value THEN write

// Windows DLL
DWORD currentValue;
ReadProcessMemory(hProcess, (LPVOID)checkAddr, &currentValue, 4, NULL);
if (currentValue == expectedValue) {
    WriteProcessMemory(hProcess, (LPVOID)targetAddr, &newValue, 4, NULL);
}
```

#### 4. 実行タイミング

```cpp
// melonDSはVBlank（~60fps）で実行
// Windows DLLでは以下のいずれか:

// A. タイマーベース
SetTimer(hwnd, TIMER_ID, 16, TimerProc);  // ~60fps

// B. フック（より正確）
// ゲームのメインループやフレーム更新関数をフック
```

---

## 設計上のポイント

1. **状態マシン方式**: 命令ごとに内部レジスタを更新しながら実行
2. **条件スタック**: ネストした条件分岐をビットスタックで管理
3. **ループ機構**: 開始位置を保存し、カウントダウンで繰り返し
4. **オフセット追跡**: ベースアドレスからの相対アドレスを動的に計算

---

## 参考リンク

- GBAtek（Nintendo DSハードウェア仕様）
- melonDS公式リポジトリ
