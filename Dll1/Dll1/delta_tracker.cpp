#include "pch.h"
#include "delta_tracker.h"
#include "json_util.h"
#include <cstring>

void DeltaTracker::RegisterAddress(const char* name, uint32_t addr, uint8_t size) {
    TrackedValue tv = {};
    tv.name = name;
    tv.dsAddress = addr;
    tv.size = size;
    tv.currentValue = 0;
    tv.lastSentValue = 0;
    tv.changed = false;
    tv.initialized = false;
    m_values.push_back(tv);
}

void DeltaTracker::Update(MemoryReadFunc readFunc) {
    for (auto& tv : m_values) {
        uint32_t newValue = 0;
        if (readFunc(tv.dsAddress, tv.size, &newValue)) {
            if (!tv.initialized || tv.currentValue != newValue) {
                tv.changed = true;
            }
            tv.currentValue = newValue;
            tv.initialized = true;
        }
    }
}

std::string DeltaTracker::BuildHelloJson() const {
    JsonWriter jw;
    jw.BeginObject();
    jw.StringField("type", "hello");
    jw.StringField("version", "1.0");
    jw.UIntField("addresses", (uint32_t)m_values.size());
    jw.EndObject();
    return jw.GetString();
}

std::string DeltaTracker::BuildFullStateJson() const {
    JsonWriter jw;
    jw.BeginObject();
    jw.StringField("type", "full");

    jw.Key("data");
    jw.BeginObject();
    for (const auto& tv : m_values) {
        if (!tv.initialized) continue;

        jw.Key(tv.name);
        jw.BeginObject();
        jw.UIntField("v", tv.currentValue);
        jw.HexField("a", tv.dsAddress);
        jw.UIntField("s", tv.size);
        jw.EndObject();
    }
    jw.EndObject();

    jw.EndObject();
    return jw.GetString();
}

std::string DeltaTracker::BuildDeltaJson() const {
    // 変化があるか先にチェック
    bool anyChanged = false;
    for (const auto& tv : m_values) {
        if (tv.changed) {
            anyChanged = true;
            break;
        }
    }

    if (!anyChanged) return "";

    JsonWriter jw;
    jw.BeginObject();
    jw.StringField("type", "delta");

    jw.Key("data");
    jw.BeginObject();
    for (const auto& tv : m_values) {
        if (!tv.changed) continue;

        jw.Key(tv.name);
        jw.BeginObject();
        jw.UIntField("v", tv.currentValue);
        jw.EndObject();
    }
    jw.EndObject();

    jw.EndObject();
    return jw.GetString();
}

void DeltaTracker::ResetChangeFlags() {
    for (auto& tv : m_values) {
        tv.lastSentValue = tv.currentValue;
        tv.changed = false;
    }
}

bool DeltaTracker::HasChanges() const {
    for (const auto& tv : m_values) {
        if (tv.changed) return true;
    }
    return false;
}

TrackedValue* DeltaTracker::FindByName(const char* name) {
    for (auto& tv : m_values) {
        if (strcmp(tv.name, name) == 0) {
            return &tv;
        }
    }
    return nullptr;
}
