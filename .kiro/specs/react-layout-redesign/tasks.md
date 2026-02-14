# Implementation Plan

## Tasks

- [x] 1. TwoPaneLayout からヘッダーを削除し、フルハイトレイアウトを実現
- [x] 1.1 (P) AppBar コンポーネントと関連インポートを完全に除去
  - AppBar、Toolbar、Typography、LanguageSwitcher のインポートを削除
  - flexbox 構成を `height: 100vh` で左右ペインのみに変更
  - AppBar 削除によりメインコンテンツ領域が縦方向に約 40px 拡大
  - _Requirements: 1.1, 1.3, 5.2_

- [x] 2. VersionToggle コンポーネントを新規作成
- [x] 2.1 (P) BA/RJ 切替用の ToggleButtonGroup コンポーネントを実装
  - MUI ToggleButtonGroup を exclusive モードで使用
  - VERSION_COLORS を適用し、選択中バージョンを強調表示
  - 非選択バージョンは低コントラストで表示
  - selectedVersion と onVersionChange を props として受け取る
  - バレルエクスポートに追加
  - _Requirements: 2.1, 3.1, 3.3, 6.3_

- [x] 3. LevelList コンポーネントを新規作成
- [x] 3.1 (P) 選択バージョンのレベルボタン群を単一列で表示するコンポーネントを実装
  - Lv1-12 を縦に単一列配置
  - React Router Link でナビゲーション
  - 選択バージョンのテーマカラー（VERSION_COLORS）を適用
  - _Requirements: 2.3, 6.1, 6.2_

- [x] 3.2 フィルタ適用時のヒット件数表示と disabled 状態を実装
  - getHitCount ロジックを Sidebar から移植
  - フィルタアクティブ時に各ボタンへヒット件数を表示
  - ヒット件数 0 のボタンは disabled スタイルを適用
  - バレルエクスポートに追加
  - _Requirements: 2.4_

- [x] 4. Sidebar コンポーネントを刷新し、新レイアウト構造を統合
- [x] 4.1 LanguageSwitcher を Sidebar 上部に統合
  - TwoPaneLayout から移動してきた LanguageSwitcher を配置
  - Sidebar 上部に「BA/RJ FolderView」のラベルと共に配置
  - _Requirements: 1.2_

- [x] 4.2 バージョン選択状態を管理し、VersionToggle と連携
  - selectedVersion 状態を useState で新規追加
  - URL パラメータ（useParams）から初期バージョンを取得
  - バージョン変更時に useNavigate で URL 遷移（Lv1 にリセット）
  - VersionToggle コンポーネントを配置
  - _Requirements: 2.2, 3.2_

- [x] 4.3 LevelList コンポーネントを配置し、既存レベルボタンを置換
  - 既存の2列 BA/RJ ボタン配置を LevelList で置換
  - selectedVersion に応じた単一列表示に変更
  - フィルタ状態（selectedType, selectedCard）を LevelList に渡す
  - _Requirements: 2.3, 2.4_

- [x] 4.4 検索・フィルタ領域の最適化とクリアボタン追加
  - 検索入力欄を上部に固定表示
  - 属性フィルタアイコン 8 種類を横並びで維持
  - 選択状態の視覚的フィードバックを確認
  - フィルタアクティブ時にクリアボタンを表示
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 4.5 左ペイン幅の制約とレスポンシブ対応を適用
  - 幅を 280px-360px の範囲で固定（現行 310px 維持）
  - 狭いウィンドウ幅時に内部要素が折り返し表示されることを確認
  - _Requirements: 5.1, 5.3_

- [x] 5. 統合テストと動作確認
- [x] 5.1 全コンポーネントの統合動作を確認
  - バージョン切替時の URL 遷移と配色変更を確認
  - 検索・フィルタ操作後のヒット件数表示を確認
  - 言語切替機能が正常に動作することを確認
  - 全レベルボタンのナビゲーション動作を確認
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 6.1, 6.2, 6.3_
