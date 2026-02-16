# umamusume-localify DLLプロキシ実装分析

## 概要

ウマ娘（Uma Musume）ゲームの多言語ローカライズパッチ。
**DLL Hijacking** + **MinHook** + **IL2Cppメタデータ** を組み合わせた実装。

---

## ファイル構成

```
umamusume-localify-develop/
├── src/
│   ├── main.cpp                 ★ DllMain エントリポイント
│   ├── hook.cpp                 ★ APIフック実装（核心部分）
│   ├── stdinclude.hpp           ★ 統一インクルード
│   │
│   ├── dllproxy/
│   │   ├── proxy.cpp            ★ version.dll プロキシ初期化
│   │   ├── version.asm          ★ x64アセンブリ スタブ
│   │   └── version.def          ★ DLLエクスポート定義
│   │
│   ├── il2cpp/
│   │   ├── il2cpp_symbols.hpp   ★ IL2Cppメタデータ構造体
│   │   └── il2cpp_symbols.cpp   ★ IL2Cpp関数ポインタ解決
│   │
│   ├── local/
│   │   └── local.cpp            ★ 多言語辞書管理・検索
│   │
│   └── logger/
│       └── logger.cpp           ★ ログ出力（非同期）
│
└── deps/
    ├── minhook/                 ★ MinHook ライブラリ
    └── rapidjson/               ★ JSON解析
```

---

## 1. DLL Hijacking（DLLプロキシ）

### 仕組み

**プロキシ対象**: `version.dll`（Windows System DLL）

```
ゲーム起動
    ↓
Windows DLL読み込み順序
  1. ゲームフォルダ内の version.dll ← パッチDLL（優先）
  2. System32の version.dll（本物）
    ↓
パッチDLLのDllMain実行
    ↓
本物のversion.dllをSystem32からロード
    ↓
全エクスポート関数ポインタを取得
    ↓
パッチ処理を初期化
```

### エクスポート関数（17個）

```
GetFileVersionInfoA, GetFileVersionInfoW,
GetFileVersionInfoSizeA, GetFileVersionInfoSizeW,
VerQueryValueA, VerQueryValueW, ...
```

### ASMスタブ（version.asm）

```asm
extern GetFileVersionInfoA_Original:QWORD

GetFileVersionInfoA_EXPORT proc
  jmp QWORD ptr GetFileVersionInfoA_Original
GetFileVersionInfoA_EXPORT endp
```

本物のDLL関数へジャンプするだけのスタブ。

### プロキシ初期化（proxy.cpp）

```cpp
void init_version_proxy() {
    // System32から本物のversion.dllをロード
    wchar_t sys_path[MAX_PATH];
    GetSystemDirectoryW(sys_path, MAX_PATH);
    wcscat_s(sys_path, L"\\version.dll");

    HMODULE original = LoadLibraryW(sys_path);

    // 各関数ポインタを取得
    GetFileVersionInfoA_Original = GetProcAddress(original, "GetFileVersionInfoA");
    // ...他の関数も同様
}
```

---

## 2. ゲームプロセスへのアタッチ

### DllMain（main.cpp）

```cpp
int __stdcall DllMain(HINSTANCE, DWORD reason, LPVOID)
{
    if (reason == DLL_PROCESS_ATTACH)
    {
        // 1. ターゲットプロセス確認
        std::filesystem::path module_path(GetModuleFileName(nullptr));
        if (module_path.filename() != "umamusume.exe")
            return 1;  // 他のプロセスでは何もしない

        // 2. 作業ディレクトリ設定
        std::filesystem::current_path(module_path.parent_path());

        // 3. 設定ファイル読み込み
        auto dicts = read_config();

        // 4. 初期化スレッド開始（メインスレッドをブロックしない）
        std::thread init_thread([dicts]() {
            logger::init_logger();
            local::load_textdb(&dicts);
            init_hook();
        });
        init_thread.detach();
    }
    return 1;
}
```

**ポイント**:
- プロセス名で対象を限定
- 初期化は別スレッドで実行（ゲーム起動を阻害しない）

---

## 3. フック技術

### 使用ライブラリ: MinHook

軽量なインラインフックライブラリ。関数の先頭を書き換えてフック関数にジャンプさせる。

### フック初期化フロー

```cpp
bool init_hook() {
    // 1. MinHook初期化
    MH_Initialize();

    // 2. LoadLibraryWをフック（GameAssembly.dllロード検出用）
    MH_CreateHook(LoadLibraryW, load_library_w_hook, &load_library_w_orig);
    MH_EnableHook(LoadLibraryW);

    return true;
}
```

### LoadLibraryWフック

```cpp
HMODULE __stdcall load_library_w_hook(const wchar_t* path) {
    // cri_ware_unity.dll ロード時 = GameAssembly.dll準備完了
    if (path == L"cri_ware_unity.dll"s) {
        patch_game_assembly();  // メインパッチ処理

        // フック解除
        MH_DisableHook(LoadLibraryW);
        MH_RemoveHook(LoadLibraryW);
    }

    return reinterpret_cast<decltype(LoadLibraryW)*>(load_library_w_orig)(path);
}
```

### 主要フック対象

| フック対象 | 目的 |
|-----------|------|
| `TextGenerator::PopulateWithErrors` | テキスト表示時に多言語置換 |
| `Localize::Get` | ゲーム内蔵ローカライズシステム |
| `Query::.ctor` / `Query::GetText` | SQLiteクエリ結果の置換 |
| `WndProc` | ウィンドウリサイズ制御 |
| `Application::set_targetFrameRate` | FPS制限解除 |

### フック実装例

```cpp
void* populate_with_errors_orig = nullptr;

bool populate_with_errors_hook(void* _this, Il2CppString* str,
                                TextGenerationSettings_t* settings, void* context) {
    // 文字列を多言語版に置換
    auto localized = local::get_localized_string(str);

    // 元の関数を呼び出し
    return reinterpret_cast<decltype(populate_with_errors_hook)*>(populate_with_errors_orig)
        (_this, localized, settings, context);
}

// フック設定マクロ
#define ADD_HOOK(_name_, _fmt_) \
    MH_CreateHook(_name_##_offset, _name_##_hook, &_name_##_orig); \
    MH_EnableHook(_name_##_offset);
```

---

## 4. IL2Cppメタデータによるアドレス解決

### IL2Cppとは

Unity IL2CPPバックエンドでビルドされたゲームのランタイム。
C#コードがC++に変換され、メタデータが保持される。

### メタデータ構造体

```cpp
struct Il2CppString {
    void* Empty;
    void* WhiteChars;
    int32_t length;
    wchar_t start_char[1];  // UTF-16文字列
};

struct MethodInfo {
    uintptr_t methodPointer;  // ★ 実装関数アドレス
    const char* name;
    uintptr_t klass;
    const ParameterInfo* parameters;
    // ...
};
```

### IL2Cpp関数の取得

```cpp
void init(HMODULE game_module) {
    // GameAssembly.dllからエクスポート関数を取得
    il2cpp_domain_get = GetProcAddress(game_module, "il2cpp_domain_get");
    il2cpp_domain_assembly_open = GetProcAddress(game_module, "il2cpp_domain_assembly_open");
    il2cpp_class_from_name = GetProcAddress(game_module, "il2cpp_class_from_name");
    il2cpp_class_get_method_from_name = GetProcAddress(game_module, "il2cpp_class_get_method_from_name");
    // ...
}
```

### メソッドアドレス解決

```cpp
uintptr_t get_method_pointer(const char* assemblyName, const char* namespaze,
                             const char* klassName, const char* name, int argsCount) {
    // 1. アセンブリ取得
    auto assembly = il2cpp_domain_assembly_open(il2cpp_domain, assemblyName);

    // 2. イメージ取得
    auto image = il2cpp_assembly_get_image(assembly);

    // 3. クラス検索
    auto klass = il2cpp_class_from_name(image, namespaze, klassName);

    // 4. メソッド検索
    auto method = il2cpp_class_get_method_from_name(klass, name, argsCount);

    // 5. 実装アドレスを返す
    return method->methodPointer;
}
```

**利点**: シグネチャスキャン不要。ゲーム更新時も自動対応。

### カスタム検索（同名メソッドの区別）

```cpp
uintptr_t find_method(const char* assemblyName, const char* namespaze,
                      const char* klassName, std::function<bool(const MethodInfo*)> predict) {
    auto klass = il2cpp_class_from_name(...);

    void* iter = nullptr;
    while (const MethodInfo* method = il2cpp_class_get_methods(klass, &iter)) {
        if (predict(method))
            return method->methodPointer;
    }
    return 0;
}

// 使用例: パラメータ型で区別
auto addr = find_method("umamusume.dll", "Gallop", "Localize",
    [](const MethodInfo* m) {
        return m->name == "Get"s &&
               m->parameters->parameter_type->type == IL2CPP_TYPE_VALUETYPE;
    });
```

---

## 5. メモリアクセスパターン

### 直接メモリ読み取り

```cpp
// フック関数内で直接アクセス
void* hook(void* _this, Il2CppString* str, ...) {
    // strは既にメモリ内のポインタ
    wchar_t* text = str->start_char;
    int len = str->length;
    // ...
}
```

### ハッシュベースの辞書検索

```cpp
Il2CppString* get_localized_string(Il2CppString* str) {
    // ハッシュ値を計算
    auto hash = std::hash<wstring>{}(str->start_char);

    // 辞書から検索（O(1)）
    if (text_db.contains(hash)) {
        return il2cpp_string_new(text_db[hash].data());
    }
    return str;
}
```

### 配列アクセス

```cpp
struct Il2CppArraySize {
    Il2CppObject obj;
    void* bounds;
    uintptr_t max_length;
    alignas(8) void* vector[0];  // 可変長配列
};

#define il2cpp_array_addr(array, type, index) \
    ((type*)((char*)array + kIl2CppSizeOfArray + sizeof(type) * index))
```

---

## 6. データフロー

### 起動時シーケンス

```
1. ゲーム起動 (umamusume.exe)
        ↓
2. version.dll ロード (パッチDLL)
        ↓
3. DllMain → プロセス確認 → 初期化スレッド生成
        ↓
4. LoadLibraryW フック設定
        ↓
5. ゲーム通常実行
        ↓
6. cri_ware_unity.dll ロード検出
        ↓
7. GameAssembly.dll パッチ
   - IL2Cpp関数ポインタ取得
   - 各メソッドアドレス解決
   - MinHookでフック設定
        ↓
8. テキスト表示時にフック割り込み → 多言語置換
```

### テキスト置換フロー

```
ゲーム内テキスト表示
        ↓
TextGenerator::PopulateWithErrors() 呼び出し
        ↓
フック関数割り込み
        ↓
ハッシュ計算 → 辞書検索
        ↓
見つかった → 新しいIl2CppString生成
見つからない → ログ記録（オプション）
        ↓
元の関数呼び出し（置換後の文字列で）
```

---

## 7. DLL注入への応用

### 技術対応表

| umamusume-localify | 汎用DLL注入 |
|--------------------|-------------|
| DLL Hijacking (version.dll) | 任意のシステムDLLをプロキシ |
| MinHook | Detours, frida-gum, etc. |
| IL2Cppメタデータ | シグネチャスキャン / パターンマッチ |
| LoadLibraryWフック | DLLロード監視 |

### 実装パターン

#### DLLプロキシテンプレート

```cpp
// proxy.cpp
HMODULE g_original_dll = nullptr;

void init_proxy() {
    wchar_t sys_path[MAX_PATH];
    GetSystemDirectoryW(sys_path, MAX_PATH);
    wcscat_s(sys_path, L"\\target.dll");

    g_original_dll = LoadLibraryW(sys_path);

    // エクスポート関数のアドレスを取得
    OriginalFunc1 = GetProcAddress(g_original_dll, "Func1");
    // ...
}

// ASMスタブまたはフォワーダーで元DLLに転送
```

#### MinHookパターン

```cpp
void* original = nullptr;

RetType hook_func(Params...) {
    // 前処理
    // ...

    // 元の関数呼び出し
    auto result = ((decltype(hook_func)*)original)(params...);

    // 後処理
    // ...

    return result;
}

void setup_hook(void* target) {
    MH_Initialize();
    MH_CreateHook(target, hook_func, &original);
    MH_EnableHook(target);
}
```

---

## 8. 設定オプション（config.json）

```json
{
    "enableConsole": true,      // デバッグコンソール
    "enableLogger": false,      // テキストダンプ
    "maxFps": 0,                // FPS制限 (-1/0=無制限)
    "unlockSize": true,         // 解像度制限解除
    "uiScale": 1.0,             // UI拡大率
    "dicts": [                  // 辞書ファイル
        "localized_data/static.json",
        "localized_data/common.json"
    ]
}
```

---

## 9. 技術スタック

| 技術 | 用途 |
|------|------|
| C++17 | メイン言語 |
| x86-64 ASM (MASM) | DLLスタブ |
| MinHook | 関数フック |
| RapidJSON | JSON解析 |
| Win32 API | OS制御 |

---

## 10. 特筆すべき設計

1. **DLL Hijacking**: インジェクター不要で隠蔽性が高い
2. **IL2Cppメタデータ**: シグネチャスキャン不要で堅牢
3. **非同期初期化**: ゲーム起動への影響最小化
4. **ハッシュテーブル検索**: O(1)の高速検索
5. **バッチログフラッシュ**: パフォーマンス配慮

---

## 参考ファイル

| 内容 | パス |
|------|------|
| DLLプロキシ | `src/dllproxy/proxy.cpp` |
| エントリポイント | `src/main.cpp` |
| フック実装 | `src/hook.cpp` |
| IL2Cppシンボル | `src/il2cpp/il2cpp_symbols.cpp` |
| ASMスタブ | `src/dllproxy/version.asm` |
