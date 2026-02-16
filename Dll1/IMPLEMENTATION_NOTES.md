# melonDS Cheat DLL - Implementation Notes

## Problem

Previous implementation was writing to memory but not affecting game data. Raw bytes showed writes were succeeding, but in-game zeny value didn't change.

**Cause:** The DLL was finding a wrong memory region that happened to be 4MB, not the actual NDS MainRAM used by melonDS.

---

## Investigation

### melonDS Source Code Analysis

Key findings from melonDS source code:

#### 1. NDS Class Structure (NDS.h:296-297)
```cpp
u8* MainRAM;
u32 MainRAMMask;
```
- `MainRAM` and `MainRAMMask` are adjacent members in the NDS class
- This creates a detectable pattern: `[8-byte pointer][4-byte mask]`

#### 2. MainRAMMask Values
- **NDS (4MB):** `0x003FFFFF`
- **DSi (16MB):** `0x00FFFFFF`

#### 3. Instance Management (main.cpp:79, EmuInstance.h:92,273)
```cpp
const int kMaxEmuInstances = 16;
EmuInstance* emuInstances[kMaxEmuInstances];

// EmuInstance class
melonDS::NDS* getNDS() { return nds; }
melonDS::NDS* nds;
```

#### 4. Memory Access Pattern
```cpp
*(u32*)&MainRAM[addr & MainRAMMask]
```
DS address is masked with MainRAMMask to get offset into MainRAM.

---

## Implementation Changes

### Previous Approach (Failed)
- Simple memory scanning for 4MB regions
- No validation that found region was actually melonDS's MainRAM
- Found wrong memory region

### New Approach (Pattern Scanning)

#### Detection Method 1: NDS Structure Pattern
Scans executable module memory for:
```
[MainRAM pointer (8 bytes)][MainRAMMask (4 bytes)]
```
Where MainRAMMask equals `0x003FFFFF` or `0x00FFFFFF`.

**Validation:**
- MainRAM pointer must point to committed memory
- Memory region must be >= expected size (4MB or 16MB)
- Must be readable

#### Detection Method 2: Heap Scan
Same pattern search across all heap regions (MEM_PRIVATE, PAGE_READWRITE).

#### Detection Method 3: Size-based Fallback
- Looks for exact 4MB/16MB committed regions
- Validates by checking if zeny offset value is reasonable (0-1 billion)

---

## Code Structure

```
dllmain.cpp
├── Safe Memory Functions
│   ├── SafeReadPtr()    - SEH-protected pointer read
│   ├── SafeReadU32()    - SEH-protected u32 read
│   └── SafeReadU8()     - SEH-protected u8 read
│
├── Detection Functions
│   ├── FindMainRAMByNDSPattern()  - Pattern scan in modules
│   ├── FindMainRAMByHeapScan()    - Pattern scan in heap
│   └── FindMainRAMBySize()        - Fallback size search
│
├── Zeny Functions
│   ├── ReadZeny()
│   ├── WriteZeny()
│   └── AddZeny()
│
└── DLL Proxy (version.dll)
    └── Forwards calls to System32\version.dll
```

---

## Key Constants

```cpp
constexpr uint32_t DS_MAIN_RAM_START = 0x02000000;
constexpr uint32_t DS_MAIN_RAM_SIZE  = 0x00400000;   // 4MB
constexpr uint32_t NDS_MAIN_RAM_MASK = 0x003FFFFF;
constexpr uint32_t DSI_MAIN_RAM_MASK = 0x00FFFFFF;
constexpr uint32_t ZENY_DS_ADDR      = 0x020F3394;
constexpr uint32_t ZENY_OFFSET       = 0x000F3394;   // DS addr - RAM start
```

---

## Difference from umamusume-localify

| Aspect | umamusume-localify | This Implementation |
|--------|-------------------|---------------------|
| Target | Unity/IL2CPP game | Qt/C++ emulator |
| Method | Hook il2cpp functions, get object pointers | Pattern scan for data structure |
| API | il2cpp_symbols for reflection | Direct memory scanning |
| Hooking | MinHook for function interception | MinHook included but not used for hooking |

umamusume-localify hooks specific functions to get object references at runtime. This implementation scans memory for known data patterns because melonDS doesn't expose its internals through a hookable API.

---

## Debug Output

Console shows:
1. Module enumeration
2. Pattern matches found
3. MainRAM address and mask
4. Zeny read/write operations with raw bytes

---

## Build

```
MSBuild Dll1.sln -p:Configuration=Release -p:Platform=x64
Output: x64\Release\version.dll
```
