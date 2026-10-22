# Requirements Document

## Project Description
melonDS にロードされた ROM を version.dll が自動判定し、流星のロックマン3 (MMSF3) の版 (BA / RJ) と
ROM ファイル名をデスクトップアプリへ通知する。手動のバージョン選択を廃止し、melonDS を開いたままの
ROM 切り替えにも追従する。

## Background
- 現状はユーザーが待機画面で BA / RJ を手動選択し、DLL は `setVersion` を一度しか受け付けない
- 版を間違えると別版のアドレス表を当ててしまい、値がすべて不正になる
- melonDS を開いたまま別の ROM (別版、別のセーブ用コピー) に切り替えても追従できない
- どの ROM を読んでいるか画面から分からない
- melonDS は ROM ブート時に ROM ヘッダを DS アドレス 0x027FFE00 にコピーし、ブート直後に設定ファイル
  (1.x: `melonDS.toml` の `RecentROM`、0.9.x: `melonDS.ini` の `RecentROM_0`) へファイルパスを書く (検証済み)

## Goal
- アプリ起動後、ユーザー操作なしで流星3 の版を判定し、モニター画面へ進む
- melonDS を開いたままの ROM 切り替えを検知し、版と表示を追従させる
- ロード中の ROM ファイル名と版をウィンドウキャプションに表示する

## In Scope
- version.dll の ROM 判定・ファイル名取得・アドレス表の自動切り替え
- Named Pipe プロトコル (`status` メッセージ) の拡張と `setVersion` の廃止
- デスクトップアプリの待機画面・自動遷移・キャプション表示
- melonDS 1.x (toml) と 0.9.x (ini) の両対応

## Out of Scope
- Web 版フロントエンドの変更
- melonDS 終了後のパイプ自動再接続
- 流星3 以外のゲームへの対応 (アドレス表の追加)
- アーカイブ (zip) 内 ROM のファイル内容照合

---

## Requirements

### Requirement 1: 版の自動判定
**Objective:** ユーザーとして、ロードした ROM の版 (BA / RJ) を自動で判定してほしい。手動選択の誤りを無くすため。

#### Acceptance Criteria
1. The DLL shall MainRAM 上の ROM ヘッダミラー (DS 0x027FFE00) のゲームコードを読み、`CRRJ` を RJ、`CRBJ` を BA と判定する
2. If ゲームコードがそれ以外 (全ゼロを含む) の場合, the DLL shall 版を「不明」として扱い、アドレス表を登録しない
3. When 版が確定または変化した時, the DLL shall 対応する版のアドレス表に入れ替え、直後にフルステートを送信する
4. The DLL shall `setVersion` コマンドを受け付けない (不明コマンドとして応答する)

### Requirement 2: ROM 切り替えの検知
**Objective:** ユーザーとして、melonDS を開いたまま別の ROM に切り替えても追従してほしい。melonDS やアプリを再起動せずに済むため。

#### Acceptance Criteria
1. The DLL shall ROM ヘッダミラーと設定ファイルの直近エントリを定期的に監視する
2. When ゲームコード・版・ファイル名のいずれかが変化した時, the DLL shall `status` メッセージを送信する
3. While melonDS の Reset 操作でヘッダが一瞬ゼロになっている間, the DLL shall ロード状態を維持する (短時間のゼロでは「未ロード」にしない)
4. If 設定ファイルが読めない、または書き込み途中である場合, the DLL shall 前回のファイル名を維持する
5. When 版が変わらずファイルだけが変わった時, the DLL shall フルステートを再送信する

### Requirement 3: ROM ファイル名の取得
**Objective:** ユーザーとして、どの ROM (どのセーブ用コピー) を読んでいるか知りたい。複数の .nds コピーを使い分けているため。

#### Acceptance Criteria
1. The DLL shall melonDS の設定ファイル (`melonDS.toml` の `RecentROM` 先頭、または `melonDS.ini` の `RecentROM_0`) から直近にブートした ROM のパスを読む
2. The DLL shall 設定ファイルを melonDS.exe と同じフォルダ (`portable` サブフォルダがあればそちら) から探す
3. The DLL shall ファイル先頭 16 バイトがヘッダミラーと一致した場合にのみ、そのファイル名とパスを `status` に載せる
4. Where パスがアーカイブ形式 (`a.zip|b.nds`) である場合, the DLL shall 内容を照合せずアーカイブ内のファイル名を採用する
5. The DLL shall ファイル名を UTF-8 のまま送信し、日本語名を欠損させない

### Requirement 4: 待機画面からの自動遷移
**Objective:** ユーザーとして、流星3 の ROM を読んだら自動でモニター画面に進んでほしい。版ボタンを押す手間を無くすため。

#### Acceptance Criteria
1. The Desktop App shall 待機画面からバージョン選択ボタンを撤去する
2. When `status` の版が BA または RJ になった時, the Desktop App shall ウィンドウをモニターサイズに変更し `/monitor/<版>` へ遷移する
3. When モニター画面表示中に別の版へ切り替わった時, the Desktop App shall その版のモニター画面へ遷移する
4. While モニター画面表示中に流星3 以外の ROM になった、または ROM が無くなった間, the Desktop App shall モニター画面に留まり状態表示を「ゲーム待機中」にする
5. While 待機画面で流星3 以外の ROM がロードされている間, the Desktop App shall そのファイル名と共に流星3 ではない旨を表示する
6. The Desktop App shall gameAPI の購読をアプリ生存中 1 か所で行い、画面遷移で購読を切らない

### Requirement 5: キャプション表示
**Objective:** ユーザーとして、ウィンドウのタイトルバーで ROM 名と版を確認したい。複数ウィンドウを並べても区別できるため。

#### Acceptance Criteria
1. When ファイル名と版が判明している時, the Desktop App shall キャプションを `SSR3 melonDS Viewer 1.0.0 - <拡張子を除いたファイル名> [<版の略称>]` にする
2. When ファイル名だけが判明している時, the Desktop App shall キャプションを `SSR3 melonDS Viewer 1.0.0 - <拡張子を除いたファイル名>` にする
3. When ROM 情報が無い時, the Desktop App shall キャプションを `SSR3 melonDS Viewer 1.0.0` に戻す

### Requirement 6: melonDS 両版対応と安定性
**Objective:** ユーザーとして、melonDS 1.x と 0.9.5 のどちらでも同じ version.dll を使いたい。環境を使い分けているため。

#### Acceptance Criteria
1. The DLL shall `melonDS.toml` (1.x) と `melonDS.ini` (0.9.x) の両方の書式を解釈する
2. The DLL shall MainRAM の検出をクライアント接続中に自動で繰り返し、フロントからの `rescan` 要求に依存しない
3. The DLL shall アドレス表と ROM 状態の変更をメインスレッドだけで行い、パイプ側スレッドからはロック下で参照する
4. If 旧プロトコルのクライアントが `setVersion` を送った場合, the DLL shall `UNKNOWN_CMD` エラーを返し動作を継続する
