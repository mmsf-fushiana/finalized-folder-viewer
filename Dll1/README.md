# melonDS Cheat DLL (version.dll)

melonDS用のDLLプロキシ。ゼニーを毎秒+100するチート機能。

## ビルド方法

1. Visual Studio 2022で `Dll1.sln` を開く
2. **x64** / **Release** または **Debug** を選択
3. ビルド実行 (Ctrl+Shift+B)
4. `x64\Release\version.dll` が生成される

## 使用方法

1. `version.dll` を **melonDS.exe と同じフォルダ** にコピー
2. melonDS.exe を起動
3. デバッグコンソールが開く
4. ゲームをロードするとMainRAMが検出され、毎秒ゼニー+100

## 仕組み

### DLL Hijacking
WindowsはEXEと同じフォルダのDLLを優先ロードする。
`version.dll`を配置することで自動的にロードされ、本物のversion.dll（System32）の機能は内部で呼び出す。

### メモリ操作
- melonDSプロセス内のMainRAM（DSの4MBメモリ）を検索
- ゼニーアドレス `0x020F3374` のオフセットに直接アクセス
- 毎秒100を加算

## 設定変更

```cpp
// dllmain.cpp

// ゼニーのDSアドレス（ゲームによって異なる）
constexpr uint32_t ZENY_DS_ADDR = 0x020F3374;

// 加算量
AddZeny(100);  // 毎秒+100

// 実行間隔
Sleep(1000);  // 1秒
```

## ファイル構成

```
Dll1/
├── Dll1.sln
├── README.md
└── Dll1/
    ├── dllmain.cpp      # メイン実装
    ├── framework.h
    ├── pch.h
    ├── pch.cpp
    └── Dll1.vcxproj
```
