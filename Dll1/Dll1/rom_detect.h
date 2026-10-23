#pragma once
// rom_detect.h : melonDS にロードされている ROM の判定
//
// - 版 (RJ / BA) は MainRAM 上の ROM ヘッダミラー (DS 0x027FFE00) のゲームコードから決める。
//   ファームウェア / ダイレクトブートが ROM ヘッダ 0x170 バイトをここへコピーし、
//   ROM 切り替え時は NDS::Reset() のゼロクリア後に新しいヘッダが書き直される。
// - ファイル名は MainRAM には無いので、melonDS が ROM ブート直後に書き換える設定ファイル
//   (1.x: melonDS.toml の RecentROM[0] / 0.9.x: melonDS.ini の RecentROM_0) から取る。
//   設定ファイルはヘッダより後に書かれるため、ファイル先頭 16 バイトがヘッダと一致した時だけ採用する。
//
// このヘッダは Win32 とファイル I/O だけに依存し、DLL のグローバル状態には触らない。
// 全関数は DLL のメインスレッドから呼ぶこと。

#include <windows.h>
#include <cstdint>
#include <cstring>
#include <string>

constexpr uint32_t DS_CART_HEADER_ADDR = 0x027FFE00;  // ROM ヘッダのコピー先 (MainRAM + 0x3FFE00)
constexpr size_t   CART_HEADER_PROBE   = 16;          // タイトル 12 バイト + ゲームコード 4 バイト

// ロード中 ROM の状態 (status メッセージに載せる内容)
struct RomState {
    bool        loaded = false;   // ヘッダが全ゼロでない
    char        code[5] = "";     // ゲームコード ("CRRJ" / "CRBJ" / ...)、未ロード時 ""
    char        title[13] = "";   // 内部タイトル ("RR3_R_JOKER" など)
    char        version[3] = "";  // "RJ" / "BA" / "" (非対応 ROM・未ロード)
    std::string file;             // ファイル名のみ (確認済みの時だけ非空)
    std::string path;             // フルパス (確認済みの時だけ非空)。アーカイブは "a.zip|b.nds"

    bool operator==(const RomState& o) const {
        return loaded == o.loaded
            && strcmp(code, o.code) == 0
            && strcmp(version, o.version) == 0
            && file == o.file
            && path == o.path;
    }
    bool operator!=(const RomState& o) const { return !(*this == o); }
};

// ゲームコード → 版
inline const char* VersionFromCode(const char* code) {
    if (memcmp(code, "CRRJ", 4) == 0) return "RJ";   // 流星のロックマン3 レッドジョーカー
    if (memcmp(code, "CRBJ", 4) == 0) return "BA";   // 流星のロックマン3 ブラックエース
    return "";
}

inline std::wstring Utf8ToWide(const std::string& s) {
    if (s.empty()) return L"";
    int n = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), nullptr, 0);
    if (n <= 0) return L"";
    std::wstring w((size_t)n, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), &w[0], n);
    return w;
}

inline bool DirectoryExists(const std::wstring& p) {
    DWORD a = GetFileAttributesW(p.c_str());
    return a != INVALID_FILE_ATTRIBUTES && (a & FILE_ATTRIBUTE_DIRECTORY);
}

inline bool FileExists(const std::wstring& p) {
    DWORD a = GetFileAttributesW(p.c_str());
    return a != INVALID_FILE_ATTRIBUTES && !(a & FILE_ATTRIBUTE_DIRECTORY);
}

// melonDS の設定ファイルの場所。
//   <exe フォルダ>[\portable]\melonDS.toml (1.x) または melonDS.ini (0.9.x)
// 1.x は初回起動時に DllMain より後で toml を作るので、キャッシュせず毎回解決する。
inline std::wstring ResolveMelonConfigPath() {
    wchar_t exe[MAX_PATH];
    if (!GetModuleFileNameW(nullptr, exe, MAX_PATH)) return L"";
    std::wstring dir(exe);
    size_t sep = dir.find_last_of(L"\\/");
    if (sep == std::wstring::npos) return L"";
    dir.erase(sep + 1);
    if (DirectoryExists(dir + L"portable")) dir += L"portable\\";

    std::wstring toml = dir + L"melonDS.toml";
    if (FileExists(toml)) return toml;
    return dir + L"melonDS.ini";
}

// ファイル全体を読む。melonDS は trunc → write で書くので、サイズ 0 (書き込み途中) は失敗扱い。
inline bool ReadWholeFile(const std::wstring& path, std::string& out) {
    HANDLE h = CreateFileW(path.c_str(), GENERIC_READ,
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        nullptr, OPEN_EXISTING, 0, nullptr);
    if (h == INVALID_HANDLE_VALUE) return false;

    LARGE_INTEGER sz = {};
    bool ok = GetFileSizeEx(h, &sz) && sz.QuadPart > 0 && sz.QuadPart <= (1 << 20);
    if (ok) {
        out.resize((size_t)sz.QuadPart);
        DWORD rd = 0;
        ok = ReadFile(h, &out[0], (DWORD)out.size(), &rd, nullptr) && rd == out.size();
    }
    CloseHandle(h);
    return ok;
}

// melonDS.toml:  RecentROM = [\n    "C:\\path\\x.nds",\n ... ]
// 戻り値 false = 判定不能 (キー無し / 書き込み途中) → 呼び出し側は前回値を維持する。
// 空配列 (Recent を Clear した直後) は true + 空文字。
inline bool ParseRecentToml(const std::string& text, std::string& out) {
    size_t k = text.find("RecentROM");
    if (k == std::string::npos) return false;
    size_t i = text.find('[', k);
    if (i == std::string::npos) return false;
    for (++i; i < text.size() && (text[i] == ' ' || text[i] == '\t' || text[i] == '\r' || text[i] == '\n'); ++i) {}
    if (i >= text.size()) return false;
    if (text[i] == ']') { out.clear(); return true; }
    if (text[i] != '"') return false;

    std::string s;
    for (++i; i < text.size(); ++i) {
        char c = text[i];
        if (c == '\\' && i + 1 < text.size()) { s += text[++i]; continue; }  // "\\" → "\", "\"" → "\""
        if (c == '"') { out = s; return true; }
        s += c;
    }
    return false;  // 閉じ引用符が無い = 書き込み途中
}

// melonDS.ini:  RecentROM_0=C:/path/x.nds   (エスケープ無し。Clear 後は値が空)
inline bool ParseRecentIni(const std::string& text, std::string& out) {
    static const char kKey[] = "RecentROM_0=";
    size_t k = text.find(kKey);
    if (k == std::string::npos) return false;
    size_t s = k + sizeof(kKey) - 1;
    size_t e = text.find_first_of("\r\n", s);
    if (e == std::string::npos) e = text.size();
    out = text.substr(s, e - s);
    return true;
}

// 設定ファイルから直近にブートした ROM のパス (UTF-8) を読む
inline bool ReadRecentRomEntry(std::string& out) {
    std::wstring cfg = ResolveMelonConfigPath();
    if (cfg.empty()) return false;
    std::string text;
    if (!ReadWholeFile(cfg, text)) return false;
    bool isToml = cfg.size() >= 5 && _wcsicmp(cfg.c_str() + cfg.size() - 5, L".toml") == 0;
    return isToml ? ParseRecentToml(text, out) : ParseRecentIni(text, out);
}

// ファイル先頭 16 バイトがヘッダミラーと一致するか。
// アーカイブ内 ("a.zip|b.nds") は開けないので一致扱いにする (仕様書に明記)。
inline bool FileHeaderMatches(const std::string& utf8Path, const uint8_t* hdr) {
    if (utf8Path.find('|') != std::string::npos) return true;
    std::wstring w = Utf8ToWide(utf8Path);
    if (w.empty()) return false;
    HANDLE h = CreateFileW(w.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE,
        nullptr, OPEN_EXISTING, 0, nullptr);
    if (h == INVALID_HANDLE_VALUE) return false;
    uint8_t buf[CART_HEADER_PROBE] = {};
    DWORD rd = 0;
    bool ok = ReadFile(h, buf, CART_HEADER_PROBE, &rd, nullptr) && rd == CART_HEADER_PROBE
        && memcmp(buf, hdr, CART_HEADER_PROBE) == 0;
    CloseHandle(h);
    return ok;
}

// "C:\a\b.nds" / "C:/a/b.nds" / "a.zip|b.nds" → "b.nds"
inline std::string BaseName(const std::string& p) {
    size_t bar = p.rfind('|');
    std::string s = (bar == std::string::npos) ? p : p.substr(bar + 1);
    size_t k = s.find_last_of("\\/");
    return (k == std::string::npos) ? s : s.substr(k + 1);
}

// ROM 状態のポーリング。メインスレッド専用。
struct RomDetector {
    static constexpr int   kLostDebouncePolls   = 6;    // 全ゼロが続いてから「未ロード」にするまでのポーリング回数 (50ms × 6)
    static constexpr DWORD kConfigPollUnverified = 100; // ファイル名未確定の間の設定ファイル読み取り間隔 (ms)
    static constexpr DWORD kConfigPollVerified   = 500; // 確定後の間隔 (ms)

    uint8_t     hdr[CART_HEADER_PROBE] = {};  // 最後に見た非ゼロのヘッダ
    bool        hdrValid = false;
    std::string recentPath;                   // 設定ファイルから読めた直近エントリ (未確認でも保持)
    std::string verifiedPath;                 // ヘッダと一致した時だけ非空
    DWORD       lastConfigRead = 0;
    int         zeroPolls = 0;

    // hdr16: ヘッダ先頭 16 バイト (読めなければ nullptr)。prev から out を計算し、変化があれば true。
    bool Poll(const uint8_t* hdr16, const RomState& prev, RomState& out) {
        if (!hdr16) {
            // MainRAM が読めない → 未ロード扱い
            out = RomState{};
            hdrValid = false;
            verifiedPath.clear();
            zeroPolls = 0;
            return out != prev;
        }

        bool zero = true;
        for (size_t i = 0; i < CART_HEADER_PROBE; i++) if (hdr16[i]) { zero = false; break; }

        if (zero) {
            // melonDS の Reset は「ゼロクリア → ヘッダ再コピー」を一呼び出しで行うので、
            // 一瞬ゼロを見ただけでは落とさず、連続して続いた時だけ「未ロード」にする。
            zeroPolls++;
            if (prev.loaded && zeroPolls < kLostDebouncePolls) {
                out = prev;
                return false;
            }
            out = RomState{};
            hdrValid = false;
            verifiedPath.clear();
            return out != prev;
        }
        zeroPolls = 0;

        bool hdrChanged = !hdrValid || memcmp(hdr16, hdr, CART_HEADER_PROBE) != 0;
        if (hdrChanged) {
            memcpy(hdr, hdr16, CART_HEADER_PROBE);
            hdrValid = true;
            verifiedPath.clear();   // 別の ROM になったので名前は確認し直す
        }

        out = RomState{};
        out.loaded = true;
        memcpy(out.title, hdr, 12); out.title[12] = '\0';
        memcpy(out.code, hdr + 12, 4); out.code[4] = '\0';
        strcpy_s(out.version, VersionFromCode(out.code));

        // 設定ファイルはヘッダより後に書かれる: ヘッダが変わった直後は即、
        // 名前が未確定の間は短い間隔、確定後は長い間隔で読む。
        DWORD now = GetTickCount();
        DWORD interval = verifiedPath.empty() ? kConfigPollUnverified : kConfigPollVerified;
        if (hdrChanged || now - lastConfigRead >= interval) {
            lastConfigRead = now;
            std::string entry;
            if (ReadRecentRomEntry(entry)) {
                recentPath = entry;   // Clear 直後は ""
                verifiedPath = (!entry.empty() && FileHeaderMatches(entry, hdr)) ? entry : std::string();
            }
            // 読めない / 書き込み途中 → 前回値を維持
        }

        out.path = verifiedPath;
        out.file = verifiedPath.empty() ? std::string() : BaseName(verifiedPath);
        return out != prev;
    }
};
