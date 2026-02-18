#pragma once
// delta_tracker.h : メモリアドレス差分検知・JSON生成

#include <string>
#include <vector>
#include <cstdint>

struct TrackedValue {
    const char* name;
    uint32_t dsAddress;
    uint8_t size;           // 1, 2, or 4
    uint32_t currentValue;
    uint32_t lastSentValue;
    bool changed;           // 前回送信から変化したか
    bool initialized;       // 初回読み取り済みか
};

// メモリ読み取りコールバック型
// dsAddress, size を受け取り、読み取った値を outValue に格納。成功時 true
using MemoryReadFunc = bool(*)(uint32_t dsAddress, uint8_t size, uint32_t* outValue);

// メモリ書き込みコールバック型
using MemoryWriteFunc = bool(*)(uint32_t dsAddress, uint8_t size, uint32_t value);

class DeltaTracker {
public:
    // アドレス登録
    void RegisterAddress(const char* name, uint32_t addr, uint8_t size);

    // 全アドレスを読み取り、変化を検知
    void Update(MemoryReadFunc readFunc);

    // hello メッセージJSON
    std::string BuildHelloJson() const;

    // フルステートJSON (type: "full")
    std::string BuildFullStateJson() const;

    // 差分JSON (type: "delta")。変化なしの場合は空文字列
    std::string BuildDeltaJson() const;

    // 変化フラグリセット（送信後に呼ぶ）
    void ResetChangeFlags();

    // 変化があるか
    bool HasChanges() const;

    // アドレス数
    size_t GetAddressCount() const { return m_values.size(); }

    // 名前でアドレス情報を検索
    TrackedValue* FindByName(const char* name);

private:
    std::vector<TrackedValue> m_values;
};
