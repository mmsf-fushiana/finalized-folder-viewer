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
// ゲームアドレス定義（ここに追加していく）
// ========================================
struct GameAddress {
    const char* name;           // 識別名
    uint32_t dsAddress;         // DSメモリ上のアドレス
    uint8_t size;               // バイトサイズ (1, 2, or 4)
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
    { "REG",        0x020F3844, 2 },
    { "TAG1_2",     0x020F3842, 2 },
};
static constexpr size_t GAME_ADDRESS_COUNT = sizeof(GAME_ADDRESSES) / sizeof(GAME_ADDRESSES[0]);

// melonDSのMainRAMポインタ（実行時に検出）
static uint8_t* g_mainRAM = nullptr;
static uint32_t g_mainRAMMask = 0;

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

    } else if (strcmp(cmd.cmd, "refresh") == 0) {
        // フルステート再送
        g_deltaTracker.Update(ReadMemory);
        std::string fullJson = g_deltaTracker.BuildFullStateJson();
        g_pipeServer.Send(fullJson);
        g_deltaTracker.ResetChangeFlags();
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

    // DeltaTrackerにアドレス登録
    for (size_t i = 0; i < GAME_ADDRESS_COUNT; i++) {
        g_deltaTracker.RegisterAddress(
            GAME_ADDRESSES[i].name,
            GAME_ADDRESSES[i].dsAddress,
            GAME_ADDRESSES[i].size
        );
    }

    // PipeServerコールバック設定
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

            // フルステート送信
            g_deltaTracker.Update(ReadMemory);
            g_pipeServer.Send(g_deltaTracker.BuildFullStateJson());
            g_deltaTracker.ResetChangeFlags();
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

    // 接続中ならstatus + フルステート送信
    if (g_pipeServer.IsConnected()) {
        JsonWriter jw;
        jw.BeginObject();
        jw.StringField("type", "status");
        jw.BoolField("connected", true);
        jw.BoolField("gameActive", true);
        jw.PtrField("mainram", g_mainRAM);
        jw.EndObject();
        g_pipeServer.Send(jw.GetString());

        g_deltaTracker.Update(ReadMemory);
        g_pipeServer.Send(g_deltaTracker.BuildFullStateJson());
        g_deltaTracker.ResetChangeFlags();
    }

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
        InitConsole();
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
