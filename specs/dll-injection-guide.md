# DLLインジェクション ガイド

## 概要

DLLインジェクションとは、実行中または起動時のプロセスに外部のDLLをロードさせる技術です。

---

## 方式の比較

| 方式 | 必要なもの | タイミング |
|------|-----------|-----------|
| **DLL Hijacking** | DLLのみ | 起動前 |
| **DLLインジェクション** | DLL + インジェクター | 起動後でもOK |

---

## 1. DLL Hijacking（DLLプロキシ）

### 概要

WindowsのDLL検索順序を利用して、本物のDLLの代わりにパッチDLLをロードさせる方式。

### DLL検索順序

```
1. アプリケーションのディレクトリ  ← ここにパッチDLLを配置
2. システムディレクトリ (C:\Windows\System32)
3. Windowsディレクトリ
4. 環境変数PATH
```

### 必要なもの

- DLLのみ（インジェクター不要）

### 動作フロー

```
1. version.dll をゲームフォルダに配置
2. ゲーム起動
3. Windowsがゲームフォルダの version.dll を優先的にロード
4. パッチDLLの DllMain が実行される
5. 本物の version.dll をシステムフォルダからロード
6. 全エクスポート関数を本物に転送
```

### プロキシDLLの実装例

```cpp
#include <windows.h>
#include <string>

// 本物のDLL関数ポインタ
void* GetFileVersionInfoA_Original = NULL;
void* VerQueryValueW_Original = NULL;
// ... 他の関数

class version_init {
public:
    version_init() {
        // システムフォルダから本物のDLLをロード
        std::string dll_path;
        dll_path.resize(MAX_PATH);
        dll_path.resize(GetSystemDirectoryA(dll_path.data(), MAX_PATH));
        dll_path += "\\version.dll";

        auto original_dll = LoadLibraryA(dll_path.data());

        // 本物の関数アドレスを取得
        GetFileVersionInfoA_Original = GetProcAddress(original_dll, "GetFileVersionInfoA");
        VerQueryValueW_Original = GetProcAddress(original_dll, "VerQueryValueW");
        // ... 他の関数
    }
};

version_init init{};

BOOL APIENTRY DllMain(HMODULE hModule, DWORD reason, LPVOID reserved) {
    if (reason == DLL_PROCESS_ATTACH) {
        // パッチ処理を初期化
        // InitializeHooks();
    }
    return TRUE;
}
```

### よく使われるプロキシ対象DLL

| DLL名 | 理由 |
|-------|------|
| version.dll | 多くのアプリが使用、関数が少ない |
| winmm.dll | ゲームでよく使用（マルチメディア） |
| d3d9.dll | DirectXゲームで必ずロード |
| dinput8.dll | 入力処理で使用 |

---

## 2. DLLインジェクション（CreateRemoteThread方式）

### 概要

外部プログラム（インジェクター）から対象プロセスにDLLを強制的にロードさせる方式。

### 必要なもの

```
プロジェクト/
├── injector.exe    ← 注入プログラム
└── payload.dll     ← 注入されるDLL
```

### インジェクター（injector.exe）

```cpp
#include <windows.h>
#include <iostream>
#include <tlhelp32.h>

// プロセス名からPIDを取得
DWORD GetProcessIdByName(const char* processName) {
    HANDLE hSnapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    PROCESSENTRY32 pe;
    pe.dwSize = sizeof(pe);

    if (Process32First(hSnapshot, &pe)) {
        do {
            if (_stricmp(pe.szExeFile, processName) == 0) {
                CloseHandle(hSnapshot);
                return pe.th32ProcessID;
            }
        } while (Process32Next(hSnapshot, &pe));
    }

    CloseHandle(hSnapshot);
    return 0;
}

int main(int argc, char* argv[]) {
    const char* targetProcess = "game.exe";
    const char* dllPath = "C:\\path\\to\\payload.dll";

    // 1. 対象プロセスのPIDを取得
    DWORD pid = GetProcessIdByName(targetProcess);
    if (pid == 0) {
        std::cout << "Process not found" << std::endl;
        return 1;
    }

    std::cout << "Target PID: " << pid << std::endl;

    // 2. 対象プロセスを開く
    HANDLE hProcess = OpenProcess(
        PROCESS_CREATE_THREAD | PROCESS_VM_OPERATION |
        PROCESS_VM_READ | PROCESS_VM_WRITE | PROCESS_QUERY_INFORMATION,
        FALSE, pid
    );

    if (!hProcess) {
        std::cout << "Failed to open process" << std::endl;
        return 1;
    }

    // 3. 対象プロセス内にメモリ確保
    size_t pathLen = strlen(dllPath) + 1;
    void* remoteMem = VirtualAllocEx(
        hProcess, NULL, pathLen,
        MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE
    );

    if (!remoteMem) {
        std::cout << "Failed to allocate memory" << std::endl;
        CloseHandle(hProcess);
        return 1;
    }

    // 4. DLLパスを書き込み
    WriteProcessMemory(hProcess, remoteMem, dllPath, pathLen, NULL);

    // 5. LoadLibraryAのアドレスを取得
    HMODULE hKernel32 = GetModuleHandle("kernel32.dll");
    LPVOID loadLibAddr = (LPVOID)GetProcAddress(hKernel32, "LoadLibraryA");

    // 6. 対象プロセスでLoadLibraryAを実行
    HANDLE hThread = CreateRemoteThread(
        hProcess, NULL, 0,
        (LPTHREAD_START_ROUTINE)loadLibAddr,
        remoteMem, 0, NULL
    );

    if (!hThread) {
        std::cout << "Failed to create remote thread" << std::endl;
        VirtualFreeEx(hProcess, remoteMem, 0, MEM_RELEASE);
        CloseHandle(hProcess);
        return 1;
    }

    std::cout << "DLL injected successfully!" << std::endl;

    // 7. スレッド終了を待機
    WaitForSingleObject(hThread, INFINITE);

    // 8. クリーンアップ
    VirtualFreeEx(hProcess, remoteMem, 0, MEM_RELEASE);
    CloseHandle(hThread);
    CloseHandle(hProcess);

    return 0;
}
```

### ペイロードDLL（payload.dll）

```cpp
#include <windows.h>

// フック用のライブラリ（MinHookなど）をインクルード
// #include <MinHook.h>

void InitializeHooks() {
    // フック処理を初期化
    // MH_Initialize();
    // MH_CreateHook(...);
    // MH_EnableHook(...);
}

void CleanupHooks() {
    // フック解除
    // MH_DisableHook(MH_ALL_HOOKS);
    // MH_Uninitialize();
}

BOOL APIENTRY DllMain(HMODULE hModule, DWORD reason, LPVOID reserved) {
    switch (reason) {
        case DLL_PROCESS_ATTACH:
            // スレッド通知を無効化（パフォーマンス向上）
            DisableThreadLibraryCalls(hModule);

            // デバッグ用メッセージ
            MessageBoxA(NULL, "DLL Injected!", "Success", MB_OK);

            // フック初期化
            InitializeHooks();
            break;

        case DLL_PROCESS_DETACH:
            // クリーンアップ
            CleanupHooks();
            break;
    }
    return TRUE;
}

// エクスポート関数（オプション）
extern "C" __declspec(dllexport) void Initialize() {
    // 外部から呼び出し可能な初期化関数
}
```

### 動作フロー図

```
┌─────────────────┐     ┌─────────────────┐
│  injector.exe   │     │   game.exe      │
│                 │     │                 │
│ OpenProcess ────┼────→│                 │
│ VirtualAllocEx ─┼────→│ [メモリ確保]    │
│ WriteProcessMem─┼────→│ "payload.dll"   │
│ CreateRemote    │     │                 │
│   Thread ───────┼────→│ LoadLibraryA()  │
│                 │     │    ↓            │
│                 │     │ payload.dll     │
│                 │     │ DllMain実行     │
└─────────────────┘     └─────────────────┘
```

---

## 3. その他のインジェクション方式

### SetWindowsHookEx

```cpp
// グローバルフックを設定してDLLを注入
HHOOK hHook = SetWindowsHookEx(
    WH_GETMESSAGE,      // フックタイプ
    HookProc,           // フック関数
    hDllModule,         // DLLハンドル
    0                   // 0 = 全スレッド
);
```

### QueueUserAPC

```cpp
// APCキューを使用して注入
HANDLE hThread = OpenThread(THREAD_SET_CONTEXT, FALSE, threadId);
QueueUserAPC((PAPCFUNC)LoadLibraryA, hThread, (ULONG_PTR)remoteMem);
```

### NtCreateThreadEx

```cpp
// 低レベルAPIを使用（検出回避向け）
typedef NTSTATUS(NTAPI* pNtCreateThreadEx)(...);
auto NtCreateThreadEx = (pNtCreateThreadEx)GetProcAddress(
    GetModuleHandle("ntdll.dll"), "NtCreateThreadEx"
);
```

---

## 4. メモリの直接読み書き

### 同一プロセス内（DLL注入後）

```cpp
// 固定アドレスの場合
int* playerHP = (int*)0x00A1B2C4;

// 読み取り
int currentHP = *playerHP;

// 書き込み
*playerHP = 9999;
```

### ポインタチェーンの場合

```cpp
// [[ベース + 0x10] + 0x24] + 0x08 = HP
uintptr_t base = (uintptr_t)GetModuleHandle(NULL);
uintptr_t ptr1 = *(uintptr_t*)(base + 0x10);
uintptr_t ptr2 = *(uintptr_t*)(ptr1 + 0x24);
int* hp = (int*)(ptr2 + 0x08);
```

### 外部プロセスから

```cpp
HANDLE hProcess = OpenProcess(PROCESS_ALL_ACCESS, FALSE, pid);

// 読み取り
int hp;
ReadProcessMemory(hProcess, (LPCVOID)0x00A1B2C4, &hp, sizeof(hp), NULL);

// 書き込み
int newHP = 9999;
WriteProcessMemory(hProcess, (LPVOID)0x00A1B2C4, &newHP, sizeof(newHP), NULL);
```

---

## 5. 管理者権限が必要なケース

| 状況 | 管理者権限 |
|------|-----------|
| 通常権限のプロセス | 不要 |
| 管理者として実行中のプロセス | **必要** |
| システムプロセス | **必要**（または不可能） |
| 保護されたプロセス（PPL） | 不可能 |
| Program Files への書き込み | **必要** |

---

## 6. 比較まとめ

| 項目 | DLL Hijacking | DLLインジェクション |
|------|--------------|-------------------|
| 必要ファイル | DLLのみ | DLL + インジェクター |
| 対象の状態 | 起動前 | 起動後でもOK |
| 配置場所 | ゲームフォルダ | どこでもOK |
| 実装難易度 | 簡単 | やや複雑 |
| 検出リスク | 低い | 高い |
| 管理者権限 | 通常不要 | 場合により必要 |

---

## 7. 実際の使い分け

| 用途 | 推奨方式 |
|------|---------|
| ゲームMod | DLL Hijacking |
| デバッグ・解析 | DLLインジェクション |
| リバースエンジニアリング | DLLインジェクション |
| 常駐型ツール | DLLインジェクション |

---

## 8. 注意事項

- アンチチート搭載ゲームでは検出・BAN対象となる可能性があります
- 他人のゲームに対する不正行為は利用規約違反です
- 学習・研究目的での使用を推奨します
