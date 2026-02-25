// dllmain.cpp : melonDS用 DLLプロキシ (version.dll)
// NDS構造体パターンスキャンによるMainRAM検出
// Named Pipe Server + DeltaTracker によるリアルタイム通信

#include "pch.h"
#include <Psapi.h>
#include <cstdio>
#include <vector>
#include <MinHook.h>
#include "pipe_server.h"
#include "delta_tracker.h"
#include "json_util.h"

#pragma comment(lib, "Psapi.lib")

// ========================================
// グローバル変数
// ========================================
static HMODULE g_originalDll = nullptr;
static std::atomic<bool> g_running{ false };
static std::thread g_mainThread;

// version.dll オリジナル関数ポインタ
static FARPROC p_GetFileVersionInfoA = nullptr;
static FARPROC p_GetFileVersionInfoW = nullptr;
static FARPROC p_GetFileVersionInfoSizeA = nullptr;
static FARPROC p_GetFileVersionInfoSizeW = nullptr;
static FARPROC p_VerQueryValueA = nullptr;
static FARPROC p_VerQueryValueW = nullptr;

// ========================================
// DSメモリアドレス定義
// ========================================
constexpr uint32_t DS_MAIN_RAM_START = 0x02000000;
constexpr uint32_t DS_MAIN_RAM_SIZE = 0x00400000;   // 4MB (NDS)
constexpr uint32_t DSI_MAIN_RAM_SIZE = 0x01000000;  // 16MB (DSi)

// MainRAMMaskの既知の値
constexpr uint32_t NDS_MAIN_RAM_MASK = 0x003FFFFF;  // 4MBマスク
constexpr uint32_t DSI_MAIN_RAM_MASK = 0x00FFFFFF;  // 16MBマスク

// ========================================
// バージョン別ゲームアドレス定義
// ========================================
struct GameAddress {
    const char* name;           // 識別名
    uint32_t dsAddress;         // DSメモリ上のアドレス
    uint8_t size;               // バイトサイズ (1, 2, or 4)
};

// RJ版 (Red Joker / レッドジョーカー) アドレスリスト
static const GameAddress RJ_ADDRESSES[] = {
    { "NOISE_RATE_1",       0x02193BA0, 2 }, // 表示上のノイズ率1
    { "NOISE_RATE_2",       0x02193BA4, 2 }, // 表示上のノイズ率2
    
    { "COMFIRM_LV_1",       0x021862A0, 2 }, // ファイナライズアクセスLv
    { "COMFIRM_LV_2",       0x021862B0, 2 }, // ファイナライズアクセス確認画面に表示されるLv
    
    { "SELECTED_SSS_VAL_1", 0x020F1E4C, 2 }, // SSS選択時サーバーアドレスの値: 1-56 (サテライトLv 1-32, メテオLv 1-24)
    { "SELECTED_SSS_VAL_2", 0x021862A0, 2 }, // SSS選択時サーバーアドレスの値: 1-56 (サテライトLv 1-32, メテオLv 1-24)
    { "SSS_CURSOR",         0x0218741F, 1 }, // SSS選択 A/B/Cのカーソル位置: 0-2
    { "CURRENT_CARD",       0x020F1E24, 1 }, // カーソル選択中のカード？
    
    { "F_Turn_Remaining",   0x021C1A14, 1 }, // 残りファイナライズターン(バトル中に0=非変身)
    
    { "MY_REZON",       0x220F39BE, 1 },
    { "REZON_L0",       0x220F3FFE, 1 },
    { "REZON_L1",       0x220F463E, 1 },
    { "REZON_L2",       0x220F4C7E, 1 },
    { "REZON_R0",       0x220F52BE, 1 },
    { "REZON_R1",       0x220F58FE, 1 },
    { "REZON_R2",       0x220F5F3E, 1 },

    // ブラザー1 (左上)
    { "BRO1_NOISE", 0x220F4000, 1 },
    { "BRO1_WC",    0x220F4001, 1 },
    { "BRO1_MEGA",  0x120F459C, 2 },
    { "BRO1_GIGA",  0x120F459E, 2 },
    // ブラザー2 (左中)
    { "BRO2_NOISE", 0x220F4640, 1 },
    { "BRO2_WC",    0x220F4641, 1 },
    { "BRO2_MEGA",  0x120F4BDC, 2 },
    { "BRO2_GIGA",  0x120F4BDE, 2 },
    // ブラザー3 (左下)
    { "BRO3_NOISE", 0x220F4C80, 1 },
    { "BRO3_WC",    0x220F4C81, 1 },
    { "BRO3_MEGA",  0x120F521C, 2 },
    { "BRO3_GIGA",  0x120F521E, 2 },
    // ブラザー4 (右上)
    { "BRO4_NOISE", 0x220F52C0, 1 },
    { "BRO4_WC",    0x220F52C1, 1 },
    { "BRO4_MEGA",  0x120F585C, 2 },
    { "BRO4_GIGA",  0x120F585E, 2 },
    // ブラザー5 (右中)
    { "BRO5_NOISE", 0x220F5900, 1 },
    { "BRO5_WC",    0x220F5901, 1 },
    { "BRO5_MEGA",  0x120F5E9C, 2 },
    { "BRO5_GIGA",  0x120F5E9E, 2 },
    // ブラザー6 (右下)
    { "BRO6_NOISE", 0x220F5F40, 1 },
    { "BRO6_WC",    0x220F5F41, 1 },
    { "BRO6_MEGA",  0x120F64DC, 2 },
    { "BRO6_GIGA",  0x120F64DE, 2 },

    // ノイズドカード
    { "NOISED_CARD_1", 0x220FA114, 2 },
    { "NOISED_CARD_2", 0x220FA116, 2 },
    { "NOISED_CARD_3", 0x220FA118, 2 },
    { "NOISED_CARD_4", 0x220FA11A, 2 },
    { "NOISED_CARD_5", 0x220FA11C, 2 },

    // アビリティ
    { "ABILITY01",  0x020F2CEE, 2 },
    { "ABILITY02",  0x020F2CF0, 2 },
    { "ABILITY03",  0x020F2CF2, 2 },
    { "ABILITY04",  0x020F2CF4, 2 },
    { "ABILITY05",  0x020F2CF6, 2 },
    { "ABILITY06",  0x020F2CF8, 2 },
    { "ABILITY07",  0x020F2CFA, 2 },
    { "ABILITY08",  0x020F2CFC, 2 },
    { "ABILITY09",  0x020F2CFE, 2 },
    { "ABILITY10",  0x020F2D00, 2 },
    { "ABILITY11",  0x020F2D02, 2 },
    { "ABILITY12",  0x020F2D04, 2 },
    { "ABILITY13",  0x020F2D06, 2 },
    { "ABILITY14",  0x020F2D08, 2 },
    { "ABILITY15",  0x020F2D0A, 2 },
    { "ABILITY16",  0x020F2D0C, 2 },
    { "ABILITY17",  0x020F2D0E, 2 },
    { "ABILITY18",  0x020F2D10, 2 },
    { "ABILITY19",  0x020F2D12, 2 },
    { "ABILITY20",  0x020F2D14, 2 },

    { "ZENY",       0x020F3394, 4 },
   
    { "BASE_HP",    0x0210C378, 2 },
    // 自ノイズ
    { "NOISE",      0x020F39C0, 1 },
    // ホワイトカードコード
    { "WHITE_CARDS",0x220F39C1, 1 },
    // ウォーロック装備
    { "WARLOCK",    0x020F2CD0, 4 },
    
    { "CARD01",     0x120F3806, 2 },
    { "CARD02",     0x120F3808, 2 },
    { "CARD03",     0x120F380A, 2 },
    { "CARD04",     0x120F380C, 2 },
    { "CARD05",     0x120F380E, 2 },
    { "CARD06",     0x120F3810, 2 },
    { "CARD07",     0x120F3812, 2 },
    { "CARD08",     0x120F3814, 2 },
    { "CARD09",     0x120F3816, 2 },
    { "CARD10",     0x120F3818, 2 },
    { "CARD11",     0x120F381A, 2 },
    { "CARD12",     0x120F381C, 2 },
    { "CARD13",     0x120F381E, 2 },
    { "CARD14",     0x120F3820, 2 },
    { "CARD15",     0x120F3822, 2 },
    { "CARD16",     0x120F3824, 2 },
    { "CARD17",     0x120F3826, 2 },
    { "CARD18",     0x120F3828, 2 },
    { "CARD19",     0x120F382A, 2 },
    { "CARD20",     0x120F382C, 2 },
    { "CARD21",     0x120F382E, 2 },
    { "CARD22",     0x120F3830, 2 },
    { "CARD23",     0x120F3832, 2 },
    { "CARD24",     0x120F3834, 2 },
    { "CARD25",     0x120F3836, 2 },
    { "CARD26",     0x120F3838, 2 },
    { "CARD27",     0x120F383A, 2 },
    { "CARD28",     0x120F383C, 2 },
    { "CARD29",     0x120F383E, 2 },
    { "CARD30",     0x120F3840, 2 },
    
    { "REG",        0x020F3844, 2 },
    { "TAG1_2",     0x020F3842, 2 },
};
static constexpr size_t RJ_ADDRESS_COUNT = sizeof(RJ_ADDRESSES) / sizeof(RJ_ADDRESSES[0]);

// BA版 (Black Ace / ブラックエース) アドレスリスト
static const GameAddress BA_ADDRESSES[] = {
    { "NOISE_RATE_1",       0x02193B60, 2 }, // 表示上のノイズ率1
    { "NOISE_RATE_2",       0x02193B64, 2 }, // 表示上のノイズ率2
    { "COMFIRM_LV_1",       0x02186260, 2 }, // ファイナライズアクセスLv
    { "COMFIRM_LV_2",       0x02186270, 2 }, // ファイナライズアクセス確認画面に表示されるLv
    { "SELECTED_SSS_VAL_1", 0x02186264, 2 }, // SSS選択時サーバーアドレスの値: 1-56 (サテライトLv 1-32, メテオLv 1-24)
    { "SELECTED_SSS_VAL_2", 0x02186260, 2 }, // SSS選択時サーバーアドレスの値: 1-56 (サテライトLv 1-32, メテオLv 1-24)
    { "SSS_CURSOR",         0x021873DF, 1 }, // SSS選択 A/B/Cのカーソル位置: 0-2
    { "CURRENT_CARD",       0x020F1E04, 1 }, // カーソル選択中のカード？
    
    { "F_Turn_Remaining",   0x021C19D4, 1 }, // 残りファイナライズターン(バトル中に0=非変身)

    { "MY_REZON",       0x220F399E, 1 },
    
    // ここから
    { "REZON_L0",       0x220F3FDE, 1 },
    { "REZON_L1",       0x220F461E, 1 },
    { "REZON_L2",       0x220F4C5E, 1 },
    { "REZON_R0",       0x220F529E, 1 },
    { "REZON_R1",       0x220F58DE, 1 },
    { "REZON_R2",       0x220F5F1E, 1 },
    // ブラザー1 (左上)
    { "BRO1_NOISE", 0x220F3FE0, 1 },
    { "BRO1_WC",    0x220F3FE1, 1 },
    { "BRO1_MEGA",  0x120F457C, 2 },
    { "BRO1_GIGA",  0x120F457E, 2 },
    // ブラザー2 (左中)
    { "BRO2_NOISE", 0x220F4620, 1 },
    { "BRO2_WC",    0x220F4621, 1 },
    { "BRO2_MEGA",  0x120F4BBC, 2 },
    { "BRO2_GIGA",  0x120F4BBE, 2 },
    // ブラザー3 (左下)
    { "BRO3_NOISE", 0x220F4C60, 1 },
    { "BRO3_WC",    0x220F4C61, 1 },
    { "BRO3_MEGA",  0x120F51FC, 2 },
    { "BRO3_GIGA",  0x120F51FE, 2 },
    // ブラザー4 (右上)
    { "BRO4_NOISE", 0x220F52A0, 1 },
    { "BRO4_WC",    0x220F52A1, 1 },
    { "BRO4_MEGA",  0x120F583C, 2 },
    { "BRO4_GIGA",  0x120F583E, 2 },
    // ブラザー5 (右中)
    { "BRO5_NOISE", 0x220F58E0, 1 },
    { "BRO5_WC",    0x220F58E1, 1 },
    { "BRO5_MEGA",  0x120F5E7C, 2 },
    { "BRO5_GIGA",  0x120F5E7E, 2 },
    // ブラザー6 (右下)
    { "BRO6_NOISE", 0x220F5F20, 1 },
    { "BRO6_WC",    0x220F5F21, 1 },
    { "BRO6_MEGA",  0x120F64BC, 2 },
    { "BRO6_GIGA",  0x120F64BE, 2 },
    // ノイズドカード
    { "NOISED_CARD_1", 0x220FA0F4, 2 },
    { "NOISED_CARD_2", 0x220FA0F6, 2 },
    { "NOISED_CARD_3", 0x220FA0F8, 2 },
    { "NOISED_CARD_4", 0x220FA0FA, 2 },
    { "NOISED_CARD_5", 0x220FA0FC, 2 },
    // アビリティ
    { "ABILITY01",  0x020F2CCE, 2 },
    { "ABILITY02",  0x020F2CD0, 2 },
    { "ABILITY03",  0x020F2CD2, 2 },
    { "ABILITY04",  0x020F2CD4, 2 },
    { "ABILITY05",  0x020F2CD6, 2 },
    { "ABILITY06",  0x020F2CD8, 2 },
    { "ABILITY07",  0x020F2CDA, 2 },
    { "ABILITY08",  0x020F2CDC, 2 },
    { "ABILITY09",  0x020F2CDE, 2 },
    { "ABILITY10",  0x020F2CE0, 2 },
    { "ABILITY11",  0x020F2CE2, 2 },
    { "ABILITY12",  0x020F2CE4, 2 },
    { "ABILITY13",  0x020F2CE6, 2 },
    { "ABILITY14",  0x020F2CE8, 2 },
    { "ABILITY15",  0x020F2CEA, 2 },
    { "ABILITY16",  0x020F2CEC, 2 },
    { "ABILITY17",  0x020F2CEE, 2 },
    { "ABILITY18",  0x020F2CF0, 2 },
    { "ABILITY19",  0x020F2CF2, 2 },
    { "ABILITY20",  0x020F2CF4, 2 },

    { "ZENY",       0x020F3374, 4 },

    { "BASE_HP",    0x0210C358, 2 },
    // 自ノイズ
    { "NOISE",      0x220F39A0, 1 },
    // ホワイトカードコード
    { "WHITE_CARDS",0x220F39A1, 1 },
    // ウォーロック装備
    { "WARLOCK",    0x020F2CB0, 4 },

    { "CARD01",     0x120F37E6, 2 },
    { "CARD02",     0x120F37E8, 2 },
    { "CARD03",     0x120F37EA, 2 },
    { "CARD04",     0x120F37EC, 2 },
    { "CARD05",     0x120F37EE, 2 },
    { "CARD06",     0x120F37F0, 2 },
    { "CARD07",     0x120F37F2, 2 },
    { "CARD08",     0x120F37F4, 2 },
    { "CARD09",     0x120F37F6, 2 },
    { "CARD10",     0x120F37F8, 2 },
    { "CARD11",     0x120F37FA, 2 },
    { "CARD12",     0x120F37FC, 2 },
    { "CARD13",     0x120F37FE, 2 },
    { "CARD14",     0x120F3800, 2 },
    { "CARD15",     0x120F3802, 2 },
    { "CARD16",     0x120F3804, 2 },
    { "CARD17",     0x120F3806, 2 },
    { "CARD18",     0x120F3808, 2 },
    { "CARD19",     0x120F380A, 2 },
    { "CARD20",     0x120F380C, 2 },
    { "CARD21",     0x120F380E, 2 },
    { "CARD22",     0x120F3810, 2 },
    { "CARD23",     0x120F3812, 2 },
    { "CARD24",     0x120F3814, 2 },
    { "CARD25",     0x120F3816, 2 },
    { "CARD26",     0x120F3818, 2 },
    { "CARD27",     0x120F381A, 2 },
    { "CARD28",     0x120F381C, 2 },
    { "CARD29",     0x120F381E, 2 },
    { "CARD30",     0x120F3820, 2 },

    { "REG",        0x020F3824, 2 },
    { "TAG1_2",     0x020F3822, 2 },

};
static constexpr size_t BA_ADDRESS_COUNT = sizeof(BA_ADDRESSES) / sizeof(BA_ADDRESSES[0]);

// melonDSのMainRAMポインタ（実行時に検出）
static uint8_t* g_mainRAM = nullptr;
static uint32_t g_mainRAMMask = 0;

// バージョン選択状態（一度選択したら変更不可・再起動のみ）
static std::atomic<bool> g_versionSelected{ false };
static char g_selectedVersion[4] = "";  // "BA" or "RJ"

// PipeServer & DeltaTracker
static PipeServer g_pipeServer;
static DeltaTracker g_deltaTracker;

// ========================================
// デバッグコンソール
// ========================================
static FILE* g_consoleOut = nullptr;
static FILE* g_consoleIn = nullptr;

void InitConsole() {
    AllocConsole();
    freopen_s(&g_consoleOut, "CONOUT$", "w", stdout);
    freopen_s(&g_consoleIn, "CONIN$", "r", stdin);
    printf("[DLL] コンソール初期化完了\n");
}

void CloseConsole() {
    if (g_consoleOut) {
        fclose(g_consoleOut);
    }
    if (g_consoleIn) {
        fclose(g_consoleIn);
    }
    FreeConsole();
}

// ========================================
// 安全なメモリ読み取り（SEH保護付き）
// ========================================

static bool SafeReadPtr(void* addr, void** outValue) {
    __try {
        *outValue = *reinterpret_cast<void**>(addr);
        return true;
    }
    __except (EXCEPTION_EXECUTE_HANDLER) {
        return false;
    }
}

static bool SafeReadU32(void* addr, uint32_t* outValue) {
    __try {
        *outValue = *reinterpret_cast<uint32_t*>(addr);
        return true;
    }
    __except (EXCEPTION_EXECUTE_HANDLER) {
        return false;
    }
}

static bool SafeReadU16(void* addr, uint16_t* outValue) {
    __try {
        *outValue = *reinterpret_cast<uint16_t*>(addr);
        return true;
    }
    __except (EXCEPTION_EXECUTE_HANDLER) {
        return false;
    }
}

static bool SafeReadU8(void* addr, uint8_t* outValue) {
    __try {
        *outValue = *reinterpret_cast<uint8_t*>(addr);
        return true;
    }
    __except (EXCEPTION_EXECUTE_HANDLER) {
        return false;
    }
}

static bool SafeWriteU32(void* addr, uint32_t value) {
    __try {
        *reinterpret_cast<uint32_t*>(addr) = value;
        return true;
    }
    __except (EXCEPTION_EXECUTE_HANDLER) {
        return false;
    }
}

static bool SafeWriteU16(void* addr, uint16_t value) {
    __try {
        *reinterpret_cast<uint16_t*>(addr) = value;
        return true;
    }
    __except (EXCEPTION_EXECUTE_HANDLER) {
        return false;
    }
}

static bool SafeWriteU8(void* addr, uint8_t value) {
    __try {
        *reinterpret_cast<uint8_t*>(addr) = value;
        return true;
    }
    __except (EXCEPTION_EXECUTE_HANDLER) {
        return false;
    }
}

// ========================================
// 汎用メモリ読み書きAPI
// ========================================

uint8_t* GetHostAddress(uint32_t dsAddress) {
    if (!g_mainRAM || !g_mainRAMMask) return nullptr;
    uint32_t offset = (dsAddress - DS_MAIN_RAM_START) & g_mainRAMMask;
    return g_mainRAM + offset;
}

// DeltaTracker用メモリ読み取りコールバック
static bool ReadMemory(uint32_t dsAddress, uint8_t size, uint32_t* outValue) {
    uint8_t* hostAddr = GetHostAddress(dsAddress);
    if (!hostAddr) return false;

    switch (size) {
    case 4: return SafeReadU32(hostAddr, outValue);
    case 2: {
        uint16_t v16 = 0;
        if (!SafeReadU16(hostAddr, &v16)) return false;
        *outValue = v16;
        return true;
    }
    case 1: {
        uint8_t v8 = 0;
        if (!SafeReadU8(hostAddr, &v8)) return false;
        *outValue = v8;
        return true;
    }
    default: return false;
    }
}

// メモリ書き込み（コマンド処理用）
static bool WriteMemory(uint32_t dsAddress, uint8_t size, uint32_t value) {
    uint8_t* hostAddr = GetHostAddress(dsAddress);
    if (!hostAddr) return false;

    switch (size) {
    case 4: return SafeWriteU32(hostAddr, value);
    case 2: return SafeWriteU16(hostAddr, (uint16_t)value);
    case 1: return SafeWriteU8(hostAddr, (uint8_t)value);
    default: return false;
    }
}

// ========================================
// MainRAM検出（ヒープパターンスキャン）
// ========================================

uint8_t* FindMainRAMByHeapScan() {
    printf("[DLL] ヒープ領域でMainRAMパターンをスキャン中...\n");

    HANDLE hProcess = GetCurrentProcess();
    MEMORY_BASIC_INFORMATION mbi;
    uint8_t* addr = nullptr;
    std::vector<std::pair<uint8_t*, size_t>> heapRegions;

    while (VirtualQueryEx(hProcess, addr, &mbi, sizeof(mbi))) {
        if (mbi.State == MEM_COMMIT &&
            mbi.Type == MEM_PRIVATE &&
            (mbi.Protect == PAGE_READWRITE || mbi.Protect == PAGE_EXECUTE_READWRITE)) {
            if (mbi.RegionSize >= 0x100000) {
                heapRegions.push_back({ static_cast<uint8_t*>(mbi.BaseAddress), mbi.RegionSize });
            }
        }
        addr = static_cast<uint8_t*>(mbi.BaseAddress) + mbi.RegionSize;
    }

    printf("[DLL] %zu個のヒープ領域をスキャン対象として発見\n", heapRegions.size());

    for (const auto& region : heapRegions) {
        uint8_t* base = region.first;
        size_t size = region.second;

        for (size_t i = 0; i < size - 16; i += 8) {
            void* mainRAMCandidate = nullptr;
            if (!SafeReadPtr(base + i, &mainRAMCandidate)) continue;
            if (!mainRAMCandidate) continue;

            uint32_t maskCandidate = 0;
            if (!SafeReadU32(base + i + 8, &maskCandidate)) continue;

            if (maskCandidate != NDS_MAIN_RAM_MASK && maskCandidate != DSI_MAIN_RAM_MASK) {
                continue;
            }

            MEMORY_BASIC_INFORMATION targetMbi;
            if (!VirtualQuery(mainRAMCandidate, &targetMbi, sizeof(targetMbi))) continue;
            if (targetMbi.State != MEM_COMMIT) continue;

            size_t expectedSize = (maskCandidate == NDS_MAIN_RAM_MASK) ? DS_MAIN_RAM_SIZE : DSI_MAIN_RAM_SIZE;
            if (targetMbi.RegionSize < expectedSize) continue;

            printf("[DLL] *** ヒープ内でNDSパターン発見! ***\n");
            printf("[DLL]   MainRAM: %p  Mask: 0x%08X\n", mainRAMCandidate, maskCandidate);

            g_mainRAMMask = maskCandidate;
            return static_cast<uint8_t*>(mainRAMCandidate);
        }
    }

    return nullptr;
}

// ========================================
// コマンド処理（Electron → DLL）
// ========================================

static void HandleCommand(const std::string& message) {
    JsonCommand cmd = ParseCommand(message.c_str());
    if (!cmd.valid) {
        printf("[DLL] 不正なコマンド: %s\n", message.c_str());
        return;
    }

    if (strcmp(cmd.cmd, "ping") == 0) {
        // pong応答
        SYSTEMTIME st;
        GetSystemTime(&st);
        FILETIME ft;
        SystemTimeToFileTime(&st, &ft);
        ULARGE_INTEGER uli;
        uli.LowPart = ft.dwLowDateTime;
        uli.HighPart = ft.dwHighDateTime;
        // Windows FILETIME → Unix timestamp (ms)
        int64_t ts = (int64_t)(uli.QuadPart / 10000ULL - 11644473600000ULL);

        JsonWriter jw;
        jw.BeginObject();
        jw.StringField("type", "pong");
        jw.IntField("ts", ts);
        jw.EndObject();
        g_pipeServer.Send(jw.GetString());

    } else if (strcmp(cmd.cmd, "setVersion") == 0) {
        // バージョン設定（一度だけ有効。再起動しないと変更不可）
        if (g_versionSelected) {
            printf("[DLL] setVersion: 既にバージョン選択済み (%s)\n", g_selectedVersion);
            return;
        }
        const GameAddress* addresses = nullptr;
        size_t count = 0;
        if (strcmp(cmd.target, "RJ") == 0) {
            addresses = RJ_ADDRESSES;
            count = RJ_ADDRESS_COUNT;
            strncpy_s(g_selectedVersion, "RJ", 3);
        } else if (strcmp(cmd.target, "BA") == 0) {
            addresses = BA_ADDRESSES;
            count = BA_ADDRESS_COUNT;
            strncpy_s(g_selectedVersion, "BA", 3);
        } else {
            printf("[DLL] setVersion: 不明なバージョン: %s\n", cmd.target);
            return;
        }
        for (size_t i = 0; i < count; i++) {
            g_deltaTracker.RegisterAddress(addresses[i].name, addresses[i].dsAddress, addresses[i].size);
        }
        g_versionSelected = true;
        printf("[DLL] バージョン設定: %s (%zu アドレス)\n", g_selectedVersion, count);

        // フルステート送信（MainRAM検出済みなら即時）
        if (g_mainRAM) {
            g_deltaTracker.Update(ReadMemory);
            g_pipeServer.Send(g_deltaTracker.BuildFullStateJson());
            g_deltaTracker.ResetChangeFlags();
        }

    } else if (strcmp(cmd.cmd, "refresh") == 0) {
        // 現在のstatus送信
        {
            JsonWriter jw;
            jw.BeginObject();
            jw.StringField("type", "status");
            jw.BoolField("connected", true);
            jw.BoolField("gameActive", g_mainRAM != nullptr);
            if (g_mainRAM) {
                jw.PtrField("mainram", g_mainRAM);
            }
            jw.EndObject();
            g_pipeServer.Send(jw.GetString());
        }
        // フルステート再送（バージョン選択済みの場合のみ）
        if (g_mainRAM && g_versionSelected) {
            g_deltaTracker.Update(ReadMemory);
            std::string fullJson = g_deltaTracker.BuildFullStateJson();
            g_pipeServer.Send(fullJson);
            g_deltaTracker.ResetChangeFlags();
        }
        printf("[DLL] refresh実行\n");

    } else if (strcmp(cmd.cmd, "write") == 0) {
        // 値書き込み
        TrackedValue* tv = g_deltaTracker.FindByName(cmd.target);
        if (tv) {
            if (WriteMemory(tv->dsAddress, tv->size, cmd.value)) {
                printf("[DLL] write: %s = %u\n", cmd.target, cmd.value);
            } else {
                JsonWriter jw;
                jw.BeginObject();
                jw.StringField("type", "error");
                jw.StringField("code", "WRITE_FAILED");
                jw.StringField("msg", "Memory write failed");
                jw.EndObject();
                g_pipeServer.Send(jw.GetString());
            }
        } else {
            JsonWriter jw;
            jw.BeginObject();
            jw.StringField("type", "error");
            jw.StringField("code", "UNKNOWN_TARGET");
            jw.StringField("msg", "Target address not found");
            jw.EndObject();
            g_pipeServer.Send(jw.GetString());
        }

    } else {
        printf("[DLL] 不明コマンド: %s\n", cmd.cmd);
        JsonWriter jw;
        jw.BeginObject();
        jw.StringField("type", "error");
        jw.StringField("code", "UNKNOWN_CMD");
        jw.StringField("msg", "Unknown command");
        jw.EndObject();
        g_pipeServer.Send(jw.GetString());
    }
}

// ========================================
// メインスレッド
// ========================================

void MainThreadFunc() {
    printf("[DLL] メインスレッド開始\n");

    // PipeServerコールバック設定
    // ※ アドレス登録は setVersion コマンド受信後に行う
    g_pipeServer.OnMessage = HandleCommand;
    g_pipeServer.OnConnect = []() {
        printf("[DLL] クライアント接続 → hello送信\n");
        g_pipeServer.Send(g_deltaTracker.BuildHelloJson());

        // MainRAM検出済みならstatus送信
        if (g_mainRAM) {
            JsonWriter jw;
            jw.BeginObject();
            jw.StringField("type", "status");
            jw.BoolField("connected", true);
            jw.BoolField("gameActive", true);
            jw.PtrField("mainram", g_mainRAM);
            jw.EndObject();
            g_pipeServer.Send(jw.GetString());

            // バージョン選択済みならフルステート送信
            if (g_versionSelected) {
                g_deltaTracker.Update(ReadMemory);
                g_pipeServer.Send(g_deltaTracker.BuildFullStateJson());
                g_deltaTracker.ResetChangeFlags();
            }
        }
    };
    g_pipeServer.OnDisconnect = []() {
        printf("[DLL] クライアント切断\n");
    };

    // PipeServer開始
    g_pipeServer.Start("\\\\.\\pipe\\ssr3_viewer");

    // ゲームロード待機
    printf("[DLL] ゲームロード待機中（15秒）...\n");
    Sleep(15000);

    // MainRAM検出
    for (int attempt = 0; attempt < 20 && !g_mainRAM && g_running; attempt++) {
        printf("[DLL] === 検出試行 %d ===\n", attempt + 1);
        g_mainRAM = FindMainRAMByHeapScan();
        if (!g_mainRAM) {
            printf("[DLL] 見つからず、3秒後に再試行...\n");

            // 接続中ならエラー通知
            if (g_pipeServer.IsConnected()) {
                JsonWriter jw;
                jw.BeginObject();
                jw.StringField("type", "status");
                jw.BoolField("connected", true);
                jw.BoolField("gameActive", false);
                jw.EndObject();
                g_pipeServer.Send(jw.GetString());
            }

            Sleep(3000);
        }
    }

    if (!g_mainRAM) {
        printf("[DLL] エラー: MainRAMが見つかりません!\n");
        if (g_pipeServer.IsConnected()) {
            JsonWriter jw;
            jw.BeginObject();
            jw.StringField("type", "error");
            jw.StringField("code", "MAINRAM_NOT_FOUND");
            jw.StringField("msg", "MainRAM detection failed");
            jw.EndObject();
            g_pipeServer.Send(jw.GetString());
        }
        // PipeServerは動かし続ける（再接続に備える）
        while (g_running) {
            Sleep(500);
        }
        g_pipeServer.Stop();
        return;
    }

    printf("[DLL] MainRAM発見: %p (mask: 0x%08X)\n", g_mainRAM, g_mainRAMMask);

    // 接続中ならstatus送信（ゲーム検出通知）
    if (g_pipeServer.IsConnected()) {
        JsonWriter jw;
        jw.BeginObject();
        jw.StringField("type", "status");
        jw.BoolField("connected", true);
        jw.BoolField("gameActive", true);
        jw.PtrField("mainram", g_mainRAM);
        jw.EndObject();
        g_pipeServer.Send(jw.GetString());
        // フルステートはバージョン選択後に setVersion ハンドラが送信する
    }

    // バージョン選択待機（フロントエンドからの setVersion コマンドを待つ）
    printf("[DLL] バージョン選択待機中...\n");
    while (g_running && !g_versionSelected) {
        Sleep(100);
    }
    if (!g_running) {
        g_pipeServer.Stop();
        return;
    }
    printf("[DLL] バージョン確定: %s\n", g_selectedVersion);

    // ========================================
    // メインポーリングループ (50ms間隔)
    // ========================================
    printf("[DLL] ポーリング開始 (50ms)\n");
    DWORD lastFullSend = GetTickCount();

    while (g_running) {
        // メモリ読み取り＆差分検知
        g_deltaTracker.Update(ReadMemory);

        if (g_pipeServer.IsConnected()) {
            // 定期的にフルステート送信 (30秒ごと)
            DWORD now = GetTickCount();
            if (now - lastFullSend >= 30000) {
                g_pipeServer.Send(g_deltaTracker.BuildFullStateJson());
                g_deltaTracker.ResetChangeFlags();
                lastFullSend = now;
            }
            // 差分があれば送信
            else if (g_deltaTracker.HasChanges()) {
                std::string deltaJson = g_deltaTracker.BuildDeltaJson();
                if (!deltaJson.empty()) {
                    g_pipeServer.Send(deltaJson);
                }
                g_deltaTracker.ResetChangeFlags();
            }
        }

        Sleep(50);
    }

    g_pipeServer.Stop();
    printf("[DLL] メインスレッド停止\n");
}

// ========================================
// version.dll プロキシ関数
// ========================================

extern "C" {
    BOOL WINAPI Proxy_GetFileVersionInfoA(LPCSTR lptstrFilename, DWORD dwHandle, DWORD dwLen, LPVOID lpData) {
        return ((BOOL(WINAPI*)(LPCSTR, DWORD, DWORD, LPVOID))p_GetFileVersionInfoA)(lptstrFilename, dwHandle, dwLen, lpData);
    }

    BOOL WINAPI Proxy_GetFileVersionInfoW(LPCWSTR lptstrFilename, DWORD dwHandle, DWORD dwLen, LPVOID lpData) {
        return ((BOOL(WINAPI*)(LPCWSTR, DWORD, DWORD, LPVOID))p_GetFileVersionInfoW)(lptstrFilename, dwHandle, dwLen, lpData);
    }

    DWORD WINAPI Proxy_GetFileVersionInfoSizeA(LPCSTR lptstrFilename, LPDWORD lpdwHandle) {
        return ((DWORD(WINAPI*)(LPCSTR, LPDWORD))p_GetFileVersionInfoSizeA)(lptstrFilename, lpdwHandle);
    }

    DWORD WINAPI Proxy_GetFileVersionInfoSizeW(LPCWSTR lptstrFilename, LPDWORD lpdwHandle) {
        return ((DWORD(WINAPI*)(LPCWSTR, LPDWORD))p_GetFileVersionInfoSizeW)(lptstrFilename, lpdwHandle);
    }

    BOOL WINAPI Proxy_VerQueryValueA(LPCVOID pBlock, LPCSTR lpSubBlock, LPVOID* lplpBuffer, PUINT puLen) {
        return ((BOOL(WINAPI*)(LPCVOID, LPCSTR, LPVOID*, PUINT))p_VerQueryValueA)(pBlock, lpSubBlock, lplpBuffer, puLen);
    }

    BOOL WINAPI Proxy_VerQueryValueW(LPCVOID pBlock, LPCWSTR lpSubBlock, LPVOID* lplpBuffer, PUINT puLen) {
        return ((BOOL(WINAPI*)(LPCVOID, LPCWSTR, LPVOID*, PUINT))p_VerQueryValueW)(pBlock, lpSubBlock, lplpBuffer, puLen);
    }
}

// ========================================
// version.dll プロキシ初期化
// ========================================

bool InitVersionProxy() {
    wchar_t systemPath[MAX_PATH];
    GetSystemDirectoryW(systemPath, MAX_PATH);
    wcscat_s(systemPath, L"\\version.dll");

    g_originalDll = LoadLibraryW(systemPath);
    if (!g_originalDll) {
        printf("[DLL] エラー: オリジナルのversion.dllを読み込めません\n");
        return false;
    }

    p_GetFileVersionInfoA = GetProcAddress(g_originalDll, "GetFileVersionInfoA");
    p_GetFileVersionInfoW = GetProcAddress(g_originalDll, "GetFileVersionInfoW");
    p_GetFileVersionInfoSizeA = GetProcAddress(g_originalDll, "GetFileVersionInfoSizeA");
    p_GetFileVersionInfoSizeW = GetProcAddress(g_originalDll, "GetFileVersionInfoSizeW");
    p_VerQueryValueA = GetProcAddress(g_originalDll, "VerQueryValueA");
    p_VerQueryValueW = GetProcAddress(g_originalDll, "VerQueryValueW");

    printf("[DLL] version.dllプロキシ初期化完了\n");
    return true;
}

// ========================================
// DLLエントリーポイント
// ========================================

BOOL APIENTRY DllMain(HMODULE hModule, DWORD ul_reason_for_call, LPVOID lpReserved) {
    switch (ul_reason_for_call) {
    case DLL_PROCESS_ATTACH:
        DisableThreadLibraryCalls(hModule);
        
        // InitConsole(); // コンソール表示。デバッグ用
        
        printf("[DLL] version.dll読み込み完了!\n");
        printf("[DLL] Named Pipe + DeltaTracker モード\n");

        if (!InitVersionProxy()) {
            return FALSE;
        }

        g_running = true;
        g_mainThread = std::thread(MainThreadFunc);
        break;

    case DLL_PROCESS_DETACH:
        printf("[DLL] DLLアンロード中...\n");
        g_running = false;
        g_pipeServer.Stop();
        if (g_mainThread.joinable()) {
            g_mainThread.detach();
        }
        if (g_originalDll) {
            FreeLibrary(g_originalDll);
        }
        CloseConsole();
        break;
    }
    return TRUE;
}
