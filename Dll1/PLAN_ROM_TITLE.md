# ROM タイトル取得 実装計画

## 目的

melonDSでロード中のゲームタイトルを取得・表示する。

---

## 実装ステップ

### Step 1: 定数追加

`dllmain.cpp` に以下の定数を追加:

```cpp
// ========================================
// NDSヘッダー・バナー関連
// ========================================
constexpr uint32_t NDS_HEADER_GAME_TITLE    = 0x000;    // 12バイト ASCII
constexpr uint32_t NDS_HEADER_GAME_CODE     = 0x00C;    // 4バイト ASCII
constexpr uint32_t NDS_HEADER_BANNER_OFFSET = 0x068;    // 4バイト
constexpr uint32_t NDS_HEADER_ARM9_OFFSET   = 0x020;    // 4バイト（検証用）

constexpr uint32_t NDS_BANNER_TITLE_JP      = 0x240;    // 256バイト UTF-16LE
constexpr uint32_t NDS_BANNER_TITLE_EN      = 0x340;    // 256バイト UTF-16LE
```

### Step 2: ROM検出関数

`FindROMByHeaderPattern()` を実装:

```cpp
// ROMデータを検出（NDSヘッダーパターンで識別）
static uint8_t* g_romData = nullptr;

uint8_t* FindROMByHeaderPattern() {
    // ヒープ領域をスキャン
    // 検証条件:
    //   1. GameTitle[12]が印刷可能ASCII
    //   2. ARM9Offset が 0x4000〜0x10000000 の範囲
    //   3. メモリ領域が十分なサイズ（最低1MB以上）
}
```

### Step 3: タイトル取得関数

```cpp
struct ROMTitleInfo {
    char gameTitle[13];          // NULL終端付き
    char gameCode[5];            // NULL終端付き
    wchar_t japaneseTitle[129];  // NULL終端付き
    wchar_t englishTitle[129];   // NULL終端付き
};

bool GetROMTitleInfo(ROMTitleInfo* outInfo);
```

### Step 4: CheatThreadFunc更新

MainRAM検出成功後にタイトル情報を表示:

```cpp
// タイトル情報取得
g_romData = FindROMByHeaderPattern();
if (g_romData) {
    ROMTitleInfo titleInfo;
    if (GetROMTitleInfo(&titleInfo)) {
        printf("[melonDS Cheat] ==============================\n");
        printf("[melonDS Cheat] Game Title: %s\n", titleInfo.gameTitle);
        printf("[melonDS Cheat] Game Code:  %s\n", titleInfo.gameCode);
        wprintf(L"[melonDS Cheat] 日本語タイトル: %s\n", titleInfo.japaneseTitle);
        printf("[melonDS Cheat] ==============================\n");
    }
}
```

---

## 検出パターン詳細

### NDSヘッダー検証ロジック

```cpp
bool ValidateNDSHeader(uint8_t* candidate) {
    // 1. GameTitle[12]が印刷可能ASCII (0x20-0x7E または 0x00)
    for (int i = 0; i < 12; i++) {
        char c = candidate[i];
        if (c != 0 && (c < 0x20 || c > 0x7E)) {
            return false;
        }
    }

    // 2. GameCode[4]が英数字
    for (int i = 0; i < 4; i++) {
        char c = candidate[0x0C + i];
        bool valid = (c >= 'A' && c <= 'Z') ||
                     (c >= '0' && c <= '9');
        if (!valid) return false;
    }

    // 3. ARM9Offsetの妥当性
    uint32_t arm9Offset = *reinterpret_cast<uint32_t*>(candidate + 0x020);
    if (arm9Offset < 0x4000 || arm9Offset > 0x10000000) {
        return false;
    }

    return true;
}
```

---

## 期待される出力例

```
[melonDS Cheat] ==============================
[melonDS Cheat] Game Title: ROCKMAN ZX A
[melonDS Cheat] Game Code:  YZWJ
[melonDS Cheat] 日本語タイトル: ロックマン ゼロ
コレクション
[melonDS Cheat] ==============================
```

---

## 将来の拡張

1. **GameCode別チート切り替え**
   - GameCodeに基づいてアドレス定義を自動選択
   - 例: `YZWJ` → ロックマンゼロコレクション用アドレス

2. **設定ファイル対応**
   - GameCodeごとのチート設定をINI/JSONで管理

---

## ファイル変更一覧

| ファイル | 変更内容 |
|---------|---------|
| `Dll1/dllmain.cpp` | ROM検出・タイトル取得機能追加 |

---

## 注意事項

- BannerOffset が 0 の場合はバナーなし（Homebrew等）
- バナータイトルは UTF-16LE、改行を含む可能性あり
- wprintf使用時はロケール設定が必要な場合あり

