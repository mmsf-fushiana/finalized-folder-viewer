#pragma once
// json_util.h : 簡易JSONビルダー（外部ライブラリ不要）
// Named Pipe送信用の軽量JSON文字列生成

#include <string>
#include <cstdio>
#include <cstdint>
#include <cstring>

class JsonWriter {
public:
    void BeginObject() {
        m_buf += '{';
        m_first = true;
    }

    void EndObject() {
        m_buf += '}';
    }

    void BeginArray() {
        m_buf += '[';
        m_first = true;
    }

    void EndArray() {
        m_buf += ']';
    }

    void Key(const char* key) {
        Comma();
        m_buf += '"';
        EscapeString(key);
        m_buf += "\":";
    }

    void ValueString(const char* val) {
        m_buf += '"';
        EscapeString(val);
        m_buf += '"';
    }

    void ValueInt(int64_t val) {
        char tmp[32];
        snprintf(tmp, sizeof(tmp), "%lld", (long long)val);
        m_buf += tmp;
    }

    void ValueUInt(uint32_t val) {
        char tmp[16];
        snprintf(tmp, sizeof(tmp), "%u", val);
        m_buf += tmp;
    }

    void ValueBool(bool val) {
        m_buf += val ? "true" : "false";
    }

    // Key + 各種 Value ショートカット
    void StringField(const char* key, const char* val) {
        Key(key);
        ValueString(val);
    }

    void IntField(const char* key, int64_t val) {
        Key(key);
        ValueInt(val);
    }

    void UIntField(const char* key, uint32_t val) {
        Key(key);
        ValueUInt(val);
    }

    void BoolField(const char* key, bool val) {
        Key(key);
        ValueBool(val);
    }

    // 16進文字列フィールド (アドレス表示用: 常に8桁)
    void HexField(const char* key, uint32_t val) {
        Key(key);
        char tmp[16];
        snprintf(tmp, sizeof(tmp), "%08X", val);
        m_buf += '"';
        m_buf += tmp;
        m_buf += '"';
    }

    // バイトサイズに応じた16進数値フィールド (ゲーム値送信用)
    // size=1 → "FF", size=2 → "FFFF", size=4 → "FFFFFFFF"
    void HexValueField(const char* key, uint32_t val, uint8_t size) {
        Key(key);
        char tmp[16];
        if (size == 1)      snprintf(tmp, sizeof(tmp), "%02X", (uint8_t)val);
        else if (size == 2) snprintf(tmp, sizeof(tmp), "%04X", (uint16_t)val);
        else                snprintf(tmp, sizeof(tmp), "%08X", val);
        m_buf += '"';
        m_buf += tmp;
        m_buf += '"';
    }

    // ポインタアドレスフィールド
    void PtrField(const char* key, const void* ptr) {
        Key(key);
        char tmp[32];
        snprintf(tmp, sizeof(tmp), "0x%p", ptr);
        m_buf += '"';
        m_buf += tmp;
        m_buf += '"';
    }

    const std::string& GetString() const { return m_buf; }

    // LF区切りメッセージとして返す
    std::string GetMessage() const {
        return m_buf + "\n";
    }

    void Clear() {
        m_buf.clear();
        m_first = true;
    }

private:
    std::string m_buf;
    bool m_first = true;

    void Comma() {
        if (!m_first) m_buf += ',';
        m_first = false;
    }

    void EscapeString(const char* s) {
        for (; *s; ++s) {
            switch (*s) {
            case '"':  m_buf += "\\\""; break;
            case '\\': m_buf += "\\\\"; break;
            case '\n': m_buf += "\\n";  break;
            case '\r': m_buf += "\\r";  break;
            case '\t': m_buf += "\\t";  break;
            default:   m_buf += *s;     break;
            }
        }
    }
};

// ========================================
// 簡易JSONパーサー（コマンド受信用）
// ========================================

struct JsonCommand {
    char cmd[32];       // "write", "refresh", "ping"
    char target[32];    // write時のターゲット名
    uint32_t value;     // write時の値
    bool valid;
};

// 極めて簡易なJSON解析（完全なパーサーではない）
// {"cmd":"write","target":"ZENY","value":99999} のような単純構造のみ対応
inline JsonCommand ParseCommand(const char* json) {
    JsonCommand result = {};
    result.valid = false;

    // "cmd" フィールドを探す
    const char* cmdPos = strstr(json, "\"cmd\"");
    if (!cmdPos) return result;

    const char* valStart = strchr(cmdPos + 5, '"');
    if (!valStart) return result;
    valStart++;
    const char* valEnd = strchr(valStart, '"');
    if (!valEnd || (valEnd - valStart) >= (int)sizeof(result.cmd)) return result;

    memcpy(result.cmd, valStart, valEnd - valStart);
    result.cmd[valEnd - valStart] = '\0';
    result.valid = true;

    // "target" フィールド
    const char* targetPos = strstr(json, "\"target\"");
    if (targetPos) {
        valStart = strchr(targetPos + 9, '"');
        if (valStart) {
            valStart++;
            valEnd = strchr(valStart, '"');
            if (valEnd && (valEnd - valStart) < (int)sizeof(result.target)) {
                memcpy(result.target, valStart, valEnd - valStart);
                result.target[valEnd - valStart] = '\0';
            }
        }
    }

    // "value" フィールド (数値)
    const char* valuePos = strstr(json, "\"value\"");
    if (valuePos) {
        const char* colon = strchr(valuePos + 7, ':');
        if (colon) {
            result.value = (uint32_t)strtoul(colon + 1, nullptr, 10);
        }
    }

    return result;
}
