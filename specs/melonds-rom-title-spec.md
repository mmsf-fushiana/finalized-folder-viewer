# melonDS ROM タイトル取得仕様書

## 概要

本文書は、melonDSエミュレータにDLLインジェクションを行い、ロードされたDSソフトのタイトル情報を取得するための技術仕様をまとめたものである。

---

## 1. NDSカートリッジのタイトル情報

DSソフトには2種類のタイトル情報が存在する。

### 1.1 NDSHeader - 内部タイトル（12バイト）

ROMの先頭に配置されるヘッダー構造体。

**ソースコード位置:** `melonDS-master/src/NDS_Header.h:45-220`

```cpp
struct NDSHeader
{
    char GameTitle[12];    // オフセット 0x000: ゲームタイトル（ASCII、12文字）
    char GameCode[4];      // オフセット 0x00C: ゲームコード（例: "ASME"）
    char MakerCode[2];     // オフセット 0x010: メーカーコード（例: "01" = Nintendo）
    u8 UnitCode;           // オフセット 0x012: ユニットコード
    // ... 以下省略
};
```

**特徴:**
- 固定12バイトのASCII文字列
- 終端NULLなし（全12バイト使用可能）
- 主にシステム識別用
- 例: `"ROCKMAN ZX A"`, `"POKEMON D   "`

### 1.2 NDSBanner - 表示用タイトル（各言語128文字）

ROMのバナー領域に配置される構造体。ゲーム選択画面等で表示されるタイトル。

**ソースコード位置:** `melonDS-master/src/NDS_Header.h:224-246`

```cpp
struct NDSBanner
{
    u16 Version;                    // オフセット 0x000: バナーバージョン
    u16 CRC16[4];                   // オフセット 0x002: CRCチェックサム
    u8 Reserved1[22];               // オフセット 0x00A: 予約領域
    u8 Icon[512];                   // オフセット 0x020: アイコンデータ (32x32, 4bpp)
    u16 Palette[16];                // オフセット 0x220: パレット

    char16_t JapaneseTitle[128];    // オフセット 0x240: 日本語タイトル (UTF-16LE)
    char16_t EnglishTitle[128];     // オフセット 0x340: 英語タイトル
    char16_t FrenchTitle[128];      // オフセット 0x440: フランス語タイトル
    char16_t GermanTitle[128];      // オフセット 0x540: ドイツ語タイトル
    char16_t ItalianTitle[128];     // オフセット 0x640: イタリア語タイトル
    char16_t SpanishTitle[128];     // オフセット 0x740: スペイン語タイトル
    char16_t ChineseTitle[128];     // オフセット 0x840: 中国語タイトル (Version > 1)
    char16_t KoreanTitle[128];      // オフセット 0x940: 韓国語タイトル (Version > 2)
    // ...
};
```

**特徴:**
- 各言語128文字（256バイト）のUTF-16LE文字列
- NULLターミネート
- 改行（`\n`）を含む場合あり（2行構成）
- バージョンにより対応言語が異なる
  - Version 1: 日本語〜スペイン語（6言語）
  - Version 2: + 中国語
  - Version 3: + 韓国語

---

## 2. melonDS内部でのデータ保持

### 2.1 カートリッジクラス階層

**ソースコード位置:** `melonDS-master/src/NDSCart.h`

```
NDSCart::CartCommon (基底クラス)
├── NDSHeader Header;           // ヘッダー情報を保持
├── ROMListEntry ROMParams;     // ROM詳細情報
├── std::unique_ptr<u8[]> ROM;  // ROMデータ全体
└── メソッド:
    ├── GetHeader() -> NDSHeader&
    ├── Banner() -> const NDSBanner*
    └── GetROM() -> const u8*
```

### 2.2 アクセス経路

```cpp
// melonDS Qt フロントエンドでの使用例 (ROMInfoDialog.cpp:53-55)
auto rom = nds->NDSCartSlot.GetCart();      // CartCommon*を取得
const NDSHeader& header = rom->GetHeader();  // ヘッダー参照
const NDSBanner* banner = rom->Banner();     // バナーポインタ
```

**クラス関係:**
```
NDS (エミュレータ本体)
└── NDSCartSlot (カートリッジスロット)
    └── std::unique_ptr<CartCommon> Cart
        ├── NDSHeader Header
        └── Banner() -> ROM + BannerOffset
```

---

## 3. DLLインジェクションでの取得方法

### 3.1 方法A: ROMデータから直接読み取り

ROMデータはメモリ上に存在するため、パターンスキャンで特定可能。

**手順:**
1. CartCommon::ROMポインタを特定
2. NDSHeader.BannerOffset（オフセット 0x068）を読み取り
3. ROM + BannerOffset でNDSBannerにアクセス

**NDSHeader内のBannerOffset:**
```cpp
// NDS_Header.h:82
u32 BannerOffset;  // オフセット 0x068 (ヘッダー先頭から104バイト目)
```

**メモリレイアウト:**
```
ROM先頭 (0x000)
├── NDSHeader (0x000 - 0x1000)
│   ├── GameTitle[12]    @ 0x000
│   ├── GameCode[4]      @ 0x00C
│   ├── MakerCode[2]     @ 0x010
│   ├── ...
│   └── BannerOffset     @ 0x068
│
└── NDSBanner (BannerOffsetの位置)
    ├── Version          @ +0x000
    ├── Icon[512]        @ +0x020
    ├── JapaneseTitle    @ +0x240
    ├── EnglishTitle     @ +0x340
    └── ...
```

### 3.2 方法B: CartCommonオブジェクト経由

**手順:**
1. NDSCartSlotのCartポインタを特定
2. CartCommon::Headerメンバにアクセス
3. CartCommon::Banner()相当の計算を行う

**CartCommon内部オフセット（推定、要検証）:**
```cpp
class CartCommon {
    void* UserData;                    // +0x00
    std::unique_ptr<u8[]> ROM;         // +0x08 (x64)
    u32 ROMLength;                     // +0x10
    u32 ChipID;                        // +0x14
    bool IsDSi;                        // +0x18
    bool DSiMode;                      // +0x19
    u32 DSiBase;                       // +0x1C
    u32 CmdEncMode;                    // +0x20
    u32 DataEncMode;                   // +0x24
    NDSHeader Header;                  // +0x28 (4096バイト)
    // ...
};
```

---

## 4. 実装サンプルコード

### 4.1 ROMから直接タイトル取得

```cpp
// DSカートリッジROMからタイトルを取得する関数
struct ROMTitleInfo {
    char gameTitle[13];          // +NULL終端
    char gameCode[5];            // +NULL終端
    char16_t japaneseTitle[129]; // +NULL終端
    char16_t englishTitle[129];  // +NULL終端
};

bool GetROMTitleFromROMData(uint8_t* romData, ROMTitleInfo* outInfo) {
    if (!romData || !outInfo) return false;

    // 1. ヘッダーから基本情報を取得
    memcpy(outInfo->gameTitle, romData + 0x000, 12);
    outInfo->gameTitle[12] = '\0';

    memcpy(outInfo->gameCode, romData + 0x00C, 4);
    outInfo->gameCode[4] = '\0';

    // 2. バナーオフセットを取得
    uint32_t bannerOffset = *reinterpret_cast<uint32_t*>(romData + 0x068);
    if (bannerOffset == 0) return false;  // バナーなし

    // 3. バナーからタイトルを取得
    uint8_t* banner = romData + bannerOffset;

    // 日本語タイトル（バナー先頭から0x240バイト目）
    memcpy(outInfo->japaneseTitle, banner + 0x240, 256);
    outInfo->japaneseTitle[128] = u'\0';

    // 英語タイトル（バナー先頭から0x340バイト目）
    memcpy(outInfo->englishTitle, banner + 0x340, 256);
    outInfo->englishTitle[128] = u'\0';

    return true;
}
```

### 4.2 ROMポインタの検出パターン

```cpp
// CartCommon内のROMポインタを特定するためのパターン
// ROMデータは通常、以下の特徴を持つ:
// - 先頭12バイトがASCII文字列（ゲームタイトル）
// - オフセット0x15Cに "PASS" または特定のシグネチャ

bool ValidateROMPointer(uint8_t* candidate) {
    // NDSヘッダーの検証
    // GameTitleが印刷可能ASCII文字のみかチェック
    for (int i = 0; i < 12; i++) {
        char c = candidate[i];
        if (c != 0 && (c < 0x20 || c > 0x7E)) {
            return false;
        }
    }

    // Nintendo Logoチェック（オフセット0x0C0、156バイト）
    // 正規ROMは特定のロゴデータを含む
    // ただしHomebrewは含まない場合あり

    // ARM9ROMOffset の妥当性チェック
    uint32_t arm9Offset = *reinterpret_cast<uint32_t*>(candidate + 0x020);
    if (arm9Offset < 0x4000 || arm9Offset > 0x10000000) {
        return false;  // 不正な値
    }

    return true;
}
```

---

## 5. 重要な定数

```cpp
// ========================================
// NDSヘッダー関連オフセット
// ========================================
constexpr uint32_t NDS_HEADER_SIZE          = 0x1000;   // 4096バイト
constexpr uint32_t NDS_HEADER_GAME_TITLE    = 0x000;    // 12バイト
constexpr uint32_t NDS_HEADER_GAME_CODE     = 0x00C;    // 4バイト
constexpr uint32_t NDS_HEADER_MAKER_CODE    = 0x010;    // 2バイト
constexpr uint32_t NDS_HEADER_BANNER_OFFSET = 0x068;    // 4バイト

// ========================================
// NDSバナー関連オフセット（バナー先頭からの相対）
// ========================================
constexpr uint32_t NDS_BANNER_VERSION        = 0x000;   // 2バイト
constexpr uint32_t NDS_BANNER_ICON           = 0x020;   // 512バイト
constexpr uint32_t NDS_BANNER_PALETTE        = 0x220;   // 32バイト
constexpr uint32_t NDS_BANNER_TITLE_JP       = 0x240;   // 256バイト (UTF-16LE)
constexpr uint32_t NDS_BANNER_TITLE_EN       = 0x340;   // 256バイト
constexpr uint32_t NDS_BANNER_TITLE_FR       = 0x440;   // 256バイト
constexpr uint32_t NDS_BANNER_TITLE_DE       = 0x540;   // 256バイト
constexpr uint32_t NDS_BANNER_TITLE_IT       = 0x640;   // 256バイト
constexpr uint32_t NDS_BANNER_TITLE_ES       = 0x740;   // 256バイト
constexpr uint32_t NDS_BANNER_TITLE_CN       = 0x840;   // 256バイト (Version > 1)
constexpr uint32_t NDS_BANNER_TITLE_KR       = 0x940;   // 256バイト (Version > 2)

constexpr uint32_t NDS_BANNER_TITLE_LENGTH   = 128;     // 文字数（char16_t単位）
constexpr uint32_t NDS_BANNER_TITLE_SIZE     = 256;     // バイト数

// ========================================
// バナーバージョン
// ========================================
constexpr uint16_t NDS_BANNER_VERSION_1      = 0x0001;  // 6言語
constexpr uint16_t NDS_BANNER_VERSION_2      = 0x0002;  // 7言語 (+中国語)
constexpr uint16_t NDS_BANNER_VERSION_3      = 0x0003;  // 8言語 (+韓国語)
constexpr uint16_t NDS_BANNER_VERSION_DSi    = 0x0103;  // DSi拡張（アニメアイコン対応）
```

---

## 6. melonDSでの使用例（参考）

**ソースコード:** `melonDS-master/src/frontend/qt_sdl/ROMInfoDialog.cpp:53-111`

```cpp
// カートリッジ取得
auto rom = emuInstance->getNDS()->NDSCartSlot.GetCart();
const NDSBanner* banner = rom->Banner();
const NDSHeader& header = rom->GetHeader();

// ヘッダーから取得（ASCII）
QString gameTitle = QString::fromLatin1(header.GameTitle, 12);
QString gameCode = QString::fromLatin1(header.GameCode, 4);
QString makerCode = QString::fromLatin1(header.MakerCode, 2);

// バナーから取得（UTF-16）
QString jpTitle = QString::fromUtf16(banner->JapaneseTitle);
QString enTitle = QString::fromUtf16(banner->EnglishTitle);
// ...以下同様
```

---

## 7. 実装上の注意点

### 7.1 NULL終端

- `GameTitle[12]`, `GameCode[4]`, `MakerCode[2]` はNULL終端**されていない**
- バナータイトルはNULL終端される（最大127文字+NULL）

### 7.2 文字エンコーディング

- ヘッダー情報: ASCII（Latin-1互換）
- バナータイトル: UTF-16LE（リトルエンディアン）

### 7.3 バナーの存在確認

```cpp
// BannerOffsetが0の場合はバナーなし（主にHomebrew）
if (header.BannerOffset == 0) {
    // バナー情報は取得不可
}
```

### 7.4 バージョンによる言語対応

```cpp
// 中国語タイトルはVersion > 1のみ
if (banner->Version > 1) {
    // ChineseTitleが有効
}

// 韓国語タイトルはVersion > 2のみ
if (banner->Version > 2) {
    // KoreanTitleが有効
}
```

---

## 8. 関連ファイル

| ファイル | 説明 |
|---------|------|
| `melonDS-master/src/NDS_Header.h` | NDSHeader, NDSBanner構造体定義 |
| `melonDS-master/src/NDSCart.h` | CartCommonクラス定義 |
| `melonDS-master/src/NDSCart.cpp` | カートリッジ実装 |
| `melonDS-master/src/frontend/qt_sdl/ROMInfoDialog.cpp` | タイトル表示の実装例 |

---

## 9. 今後の実装タスク

1. **ROMポインタの検出**
   - CartCommonオブジェクト内のROMポインタを特定
   - パターン: NDSヘッダー構造（GameTitle + GameCode + ...）

2. **タイトル取得API**
   - `GetGameTitle()` - ヘッダーのGameTitle取得
   - `GetGameCode()` - ヘッダーのGameCode取得
   - `GetDisplayTitle(Language)` - バナーの表示用タイトル取得

3. **ゲーム別チート切り替え**
   - GameCodeに基づいてチートプロファイルを選択
   - 例: `YZWJ` = ロックマンゼロコレクション（日本版）

---

## 改訂履歴

| 日付 | 内容 |
|------|------|
| 2025-12-30 | 初版作成 |
