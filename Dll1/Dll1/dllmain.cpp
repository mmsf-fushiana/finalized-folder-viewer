// dllmain.cpp : melonDS用 DLLプロキシ (version.dll)
// NDS構造体パターンスキャンによるMainRAM検出

#include "pch.h"
#include <Psapi.h>
#include <cstdio>
#include <vector>
#include <MinHook.h>

#pragma comment(lib, "Psapi.lib")

// ========================================
// グローバル変数
// ========================================
static HMODULE g_originalDll = nullptr;
static std::atomic<bool> g_running{ false };
static std::thread g_cheatThread;

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
// ゲームアドレス定義（ここに追加していく）
// ========================================
struct GameAddress {
    const char* name;           // 識別名
    uint32_t dsAddress;         // DSメモリ上のアドレス
    uint8_t size;               // バイトサイズ (2 or 4)
};

// アドレスリスト（ゲームごとに変更）
static const GameAddress GAME_ADDRESSES[] = {
    { "ZENY",       0x020F3394, 4 },
    { "NOISE",      0x020F39C0, 1 },
    { "WARLOCK",    0x020F2CD0, 4 },
    { "CARD01",     0x020F3806, 2 },
    { "CARD02",     0x020F3808, 2 },
    { "CARD03",     0x020F380A, 2 },
    { "CARD04",     0x020F380C, 2 },
    { "CARD05",     0x020F380E, 2 },
    { "CARD06",     0x020F3810, 2 },
    { "CARD07",     0x020F3812, 2 },
    { "CARD08",     0x020F3814, 2 },
    { "CARD09",     0x020F3816, 2 },
    { "CARD10",     0x020F3818, 2 },
    { "CARD11",     0x020F381A, 2 },
    { "CARD12",     0x020F381C, 2 },
    { "CARD13",     0x020F381E, 2 },
    { "CARD14",     0x020F3820, 2 },
    { "CARD15",     0x020F3822, 2 },
    { "CARD16",     0x020F3824, 2 },
    { "CARD17",     0x020F3826, 2 },
    { "CARD18",     0x020F3828, 2 },
    { "CARD19",     0x020F382A, 2 },
    { "CARD20",     0x020F382C, 2 },
    { "CARD21",     0x020F382E, 2 },
    { "CARD22",     0x020F3830, 2 },
    { "CARD23",     0x020F3832, 2 },
    { "CARD24",     0x020F3834, 2 },
    { "CARD25",     0x020F3836, 2 },
    { "CARD26",     0x020F3838, 2 },
    { "CARD27",     0x020F383A, 2 },
    { "CARD28",     0x020F383C, 2 },
    { "CARD29",     0x020F383E, 2 },
    { "CARD30",     0x020F3840, 2 },
    { "REG",        0x020F3844, 2 },// 2?
    { "TAG1_2",     0x020F3842, 2 },// 2?
};
static constexpr size_t GAME_ADDRESS_COUNT = sizeof(GAME_ADDRESSES) / sizeof(GAME_ADDRESSES[0]);

// melonDSのMainRAMポインタ（実行時に検出）
static uint8_t* g_mainRAM = nullptr;
static uint32_t g_mainRAMMask = 0;

// ========================================
// デバッグコンソール
// ========================================
static FILE* g_consoleOut = nullptr;
static FILE* g_consoleIn = nullptr;

void InitConsole() {
    AllocConsole();
    freopen_s(&g_consoleOut, "CONOUT$", "w", stdout);
    freopen_s(&g_consoleIn, "CONIN$", "r", stdin);
    printf("[melonDS Cheat] コンソール初期化完了\n");
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

// DSアドレスからホストアドレスを計算
uint8_t* GetHostAddress(uint32_t dsAddress) {
    if (!g_mainRAM || !g_mainRAMMask) return nullptr;
    uint32_t offset = (dsAddress - DS_MAIN_RAM_START) & g_mainRAMMask;
    return g_mainRAM + offset;
}

// 32bit値を読み取り
bool ReadU32(uint32_t dsAddress, uint32_t* outValue) {
    uint8_t* hostAddr = GetHostAddress(dsAddress);
    if (!hostAddr) return false;
    return SafeReadU32(hostAddr, outValue);
}

// 16bit値を読み取り
bool ReadU16(uint32_t dsAddress, uint16_t* outValue) {
    uint8_t* hostAddr = GetHostAddress(dsAddress);
    if (!hostAddr) return false;
    return SafeReadU16(hostAddr, outValue);
}

// 8bit値を読み取り
bool ReadU8(uint32_t dsAddress, uint8_t* outValue) {
    uint8_t* hostAddr = GetHostAddress(dsAddress);
    if (!hostAddr) return false;
    return SafeReadU8(hostAddr, outValue);
}

// 32bit値を書き込み
bool WriteU32(uint32_t dsAddress, uint32_t value) {
    uint8_t* hostAddr = GetHostAddress(dsAddress);
    if (!hostAddr) return false;
    return SafeWriteU32(hostAddr, value);
}

// 16bit値を書き込み
bool WriteU16(uint32_t dsAddress, uint16_t value) {
    uint8_t* hostAddr = GetHostAddress(dsAddress);
    if (!hostAddr) return false;
    return SafeWriteU16(hostAddr, value);
}

// 8bit値を書き込み
bool WriteU8(uint32_t dsAddress, uint8_t value) {
    uint8_t* hostAddr = GetHostAddress(dsAddress);
    if (!hostAddr) return false;
    return SafeWriteU8(hostAddr, value);
}

// アドレス名から定義を検索
const GameAddress* FindAddressByName(const char* name) {
    for (size_t i = 0; i < GAME_ADDRESS_COUNT; i++) {
        if (strcmp(GAME_ADDRESSES[i].name, name) == 0) {
            return &GAME_ADDRESSES[i];
        }
    }
    return nullptr;
}

// 名前指定で32bit値を読み取り
bool ReadByName(const char* name, uint32_t* outValue) {
    const GameAddress* addr = FindAddressByName(name);
    if (!addr) return false;
    return ReadU32(addr->dsAddress, outValue);
}

// 名前指定で32bit値を書き込み
bool WriteByName(const char* name, uint32_t value) {
    const GameAddress* addr = FindAddressByName(name);
    if (!addr) return false;
    return WriteU32(addr->dsAddress, value);
}

// 名前指定で値を加算
bool AddByName(const char* name, int32_t amount) {
    const GameAddress* addr = FindAddressByName(name);
    if (!addr) return false;

    uint32_t current;
    if (!ReadU32(addr->dsAddress, &current)) return false;

    uint32_t newValue = current + amount;
    return WriteU32(addr->dsAddress, newValue);
}

// デバッグ: 生バイト表示
void DumpBytes(uint32_t dsAddress, size_t count) {
    uint8_t* hostAddr = GetHostAddress(dsAddress);
    if (!hostAddr) {
        printf("[melonDS Cheat] アドレス 0x%08X: 無効\n", dsAddress);
        return;
    }

    printf("[melonDS Cheat] アドレス 0x%08X: ", dsAddress);
    for (size_t i = 0; i < count; i++) {
        uint8_t b;
        if (SafeReadU8(hostAddr + i, &b)) {
            printf("%02X ", b);
        } else {
            printf("?? ");
        }
    }
    printf("\n");
}

// ========================================
// MainRAM検出（ヒープパターンスキャン）
// ========================================

// ヒープメモリをスキャンしてMainRAMを検索
uint8_t* FindMainRAMByHeapScan() {
    printf("[melonDS Cheat] ヒープ領域でMainRAMパターンをスキャン中...\n");

    HANDLE hProcess = GetCurrentProcess();
    MEMORY_BASIC_INFORMATION mbi;
    uint8_t* addr = nullptr;
    std::vector<std::pair<uint8_t*, size_t>> heapRegions;

    // まず全てのヒープ領域を列挙
    while (VirtualQueryEx(hProcess, addr, &mbi, sizeof(mbi))) {
        if (mbi.State == MEM_COMMIT &&
            mbi.Type == MEM_PRIVATE &&
            (mbi.Protect == PAGE_READWRITE || mbi.Protect == PAGE_EXECUTE_READWRITE)) {

            // 十分な大きさのヒープ領域のみ（1MB以上）
            if (mbi.RegionSize >= 0x100000) {
                heapRegions.push_back({ static_cast<uint8_t*>(mbi.BaseAddress), mbi.RegionSize });
            }
        }
        addr = static_cast<uint8_t*>(mbi.BaseAddress) + mbi.RegionSize;
    }

    printf("[melonDS Cheat] %zu個のヒープ領域をスキャン対象として発見\n", heapRegions.size());

    // 各ヒープ領域内でMainRAM/Maskパターンを検索
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

            printf("[melonDS Cheat] *** ヒープ内でNDSパターン発見! ***\n");
            printf("[melonDS Cheat]   位置: %p (ヒープ領域 %p 内)\n", base + i, base);
            printf("[melonDS Cheat]   MainRAM: %p\n", mainRAMCandidate);
            printf("[melonDS Cheat]   MainRAMMask: 0x%08X\n", maskCandidate);

            g_mainRAMMask = maskCandidate;
            return static_cast<uint8_t*>(mainRAMCandidate);
        }
    }

    return nullptr;
}

// ========================================
// 全アドレス値をテキストで構築
// ========================================

std::string BuildAllValuesText() {
    std::string result;
    char line[128];

    for (size_t i = 0; i < GAME_ADDRESS_COUNT; i++) {
        const GameAddress& addr = GAME_ADDRESSES[i];
        uint8_t* hostAddr = GetHostAddress(addr.dsAddress);
        if (!hostAddr) continue;

        uint32_t value = 0;
        bool ok = false;
        if (addr.size == 4) {
            ok = SafeReadU32(hostAddr, &value);
        } else if (addr.size == 2) {
            uint16_t v16 = 0;
            ok = SafeReadU16(hostAddr, &v16);
            value = v16;
        } else if (addr.size == 1) {
            uint8_t v8 = 0;
            ok = SafeReadU8(hostAddr, &v8);
            value = v8;
        }

        if (ok) {
            snprintf(line, sizeof(line), "%s=%u\n", addr.name, value);
            result += line;
        }
    }

    return result;
}

// ========================================
// チートスレッド（Named Pipe Server）
// ========================================

void CheatThreadFunc() {
    printf("[PipeServer] スレッド開始\n");
    printf("[PipeServer] ゲームロード待機中（15秒）...\n");
    Sleep(15000);

    // ヒープスキャンでMainRAMを探す
    for (int attempt = 0; attempt < 20 && !g_mainRAM && g_running; attempt++) {
        printf("[PipeServer] === 検出試行 %d ===\n", attempt + 1);
        g_mainRAM = FindMainRAMByHeapScan();
        if (!g_mainRAM) {
            printf("[PipeServer] 見つからず、3秒後に再試行...\n");
            Sleep(3000);
        }
    }

    if (!g_mainRAM) {
        printf("[PipeServer] エラー: MainRAMが見つかりません!\n");
        return;
    }

    printf("[PipeServer] MainRAM発見: %p (mask: 0x%08X)\n", g_mainRAM, g_mainRAMMask);

    // Named Pipe サーバーループ
    const char* PIPE_NAME = "\\\\.\\pipe\\ssr3_viewer";

    while (g_running) {
        HANDLE hPipe = CreateNamedPipeA(
            PIPE_NAME,
            PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED,
            PIPE_TYPE_BYTE | PIPE_READMODE_BYTE,
            1,      // max instances
            4096,   // out buffer
            4096,   // in buffer
            0, NULL
        );

        if (hPipe == INVALID_HANDLE_VALUE) {
            printf("[PipeServer] CreateNamedPipe失敗: %lu\n", GetLastError());
            Sleep(1000);
            continue;
        }

        printf("[PipeServer] クライアント接続待機中...\n");

        // Overlapped接続（g_runningチェック可能にする）
        OVERLAPPED olConnect = {};
        olConnect.hEvent = CreateEvent(NULL, TRUE, FALSE, NULL);
        ConnectNamedPipe(hPipe, &olConnect);
        DWORD lastErr = GetLastError();

        bool connected = false;
        if (lastErr == ERROR_PIPE_CONNECTED) {
            connected = true;
        } else if (lastErr == ERROR_IO_PENDING) {
            while (g_running) {
                DWORD waitResult = WaitForSingleObject(olConnect.hEvent, 500);
                if (waitResult == WAIT_OBJECT_0) {
                    connected = true;
                    break;
                }
            }
        }
        CloseHandle(olConnect.hEvent);

        if (!connected) {
            CloseHandle(hPipe);
            continue;
        }

        printf("[PipeServer] クライアント接続!\n");

        // データ送信ループ（1秒間隔）
        HANDLE hWriteEvent = CreateEvent(NULL, TRUE, FALSE, NULL);

        while (g_running) {
            std::string text = BuildAllValuesText();
            text += "\n"; // フレーム区切り（末尾の\nと合わせて\n\nになる）

            OVERLAPPED olWrite = {};
            olWrite.hEvent = hWriteEvent;
            ResetEvent(hWriteEvent);

            BOOL ok = WriteFile(hPipe, text.c_str(), (DWORD)text.size(), NULL, &olWrite);
            if (!ok && GetLastError() != ERROR_IO_PENDING) {
                printf("[PipeServer] 書き込み失敗、クライアント切断\n");
                break;
            }

            DWORD written = 0;
            if (!GetOverlappedResult(hPipe, &olWrite, &written, TRUE)) {
                printf("[PipeServer] 書き込み完了失敗、クライアント切断\n");
                break;
            }

            // 1秒待機（100ms刻みでg_runningチェック）
            for (int i = 0; i < 10 && g_running; i++) {
                Sleep(100);
            }
        }

        CloseHandle(hWriteEvent);
        DisconnectNamedPipe(hPipe);
        CloseHandle(hPipe);
        printf("[PipeServer] クライアント切断、再接続待機...\n");
    }

    printf("[PipeServer] スレッド停止\n");
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
        printf("[melonDS Cheat] エラー: オリジナルのversion.dllを読み込めません\n");
        return false;
    }

    p_GetFileVersionInfoA = GetProcAddress(g_originalDll, "GetFileVersionInfoA");
    p_GetFileVersionInfoW = GetProcAddress(g_originalDll, "GetFileVersionInfoW");
    p_GetFileVersionInfoSizeA = GetProcAddress(g_originalDll, "GetFileVersionInfoSizeA");
    p_GetFileVersionInfoSizeW = GetProcAddress(g_originalDll, "GetFileVersionInfoSizeW");
    p_VerQueryValueA = GetProcAddress(g_originalDll, "VerQueryValueA");
    p_VerQueryValueW = GetProcAddress(g_originalDll, "VerQueryValueW");

    printf("[melonDS Cheat] version.dllプロキシ初期化完了\n");
    return true;
}

// ========================================
// DLLエントリーポイント
// ========================================

BOOL APIENTRY DllMain(HMODULE hModule, DWORD ul_reason_for_call, LPVOID lpReserved) {
    switch (ul_reason_for_call) {
    case DLL_PROCESS_ATTACH:
        DisableThreadLibraryCalls(hModule);
        InitConsole();
        printf("[melonDS Cheat] DLL読み込み完了!\n");
        printf("[melonDS Cheat] NDS構造体パターン検出を使用\n");

        if (!InitVersionProxy()) {
            return FALSE;
        }

        g_running = true;
        g_cheatThread = std::thread(CheatThreadFunc);
        break;

    case DLL_PROCESS_DETACH:
        printf("[melonDS Cheat] DLLアンロード中...\n");
        g_running = false;
        if (g_cheatThread.joinable()) {
            g_cheatThread.detach(); // プロセス終了時にブロックしないようdetach
        }
        if (g_originalDll) {
            FreeLibrary(g_originalDll);
        }
        CloseConsole();
        break;
    }
    return TRUE;
}
