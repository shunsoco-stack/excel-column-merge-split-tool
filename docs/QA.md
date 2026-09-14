# 検証記録

このファイルは実行結果と未確認事項を区別して記録します。アプリコードやCI設定の存在だけでは、検証・公開・画面確認の成功を意味しません。

## 実行記録

| 項目 | 状態 | 記録 |
| --- | --- | --- |
| ESLint | PASS | 2026-09-14、`npm run lint` |
| TypeScript | PASS | `next typegen && tsc --noEmit`（アプリ・テストを含む） |
| 単体テスト | PASS | Vitest、2ファイル・52ケース。全6操作、非破壊性、レシピ検証、CSV/XLSX入出力 |
| Production build | PASS | Next.js 16.3.5、Static Export、`out/`生成 |
| Secret scanner自己検証 | PASS | 2026-09-14、`node scripts/secret-scan.mjs --self-test` |
| 現行ソースSecret Scan | PASS | 2026-09-14、27テキスト・5バイナリ除外・候補0。公開候補を検査 |
| Git履歴Secret Scan | PASS | Gitleaks 8.30.0、`gitleaks git . --redact=100`、実装commit `be8346d`、検出0件 |
| 依存監査 | PASS | `npm audit --omit=dev --audit-level=moderate`、脆弱性0件 |
| ローカルのブラウザ操作 | PASS | Playwright / Chromium、14ケースすべて成功（1.2分）。実ダウンロードをCSV/XLSXとして再解析 |
| Productionのブラウザ操作 | PASS | 本番URLに対して13ケース成功（25.7秒）。実ファイル取込・全列加工・Undo・レシピ・CSV/XLSX出力を確認 |
| モバイル表示 | PASS | 390×844、Import・編集・比較・Exportにドキュメント横はみ出しなし |
| Vercel Production公開 | PASS | https://excel-column-merge-split-tool.vercel.app — READY / Production、匿名ブラウザで表示確認 |
| GitHub Public公開 | PASS | https://github.com/shunsoco-stack/excel-column-merge-split-tool — API visibility=PUBLIC、匿名Web UIで表示確認 |
| GitHub Actions | PASS | [Quality checks](https://github.com/shunsoco-stack/excel-column-merge-split-tool/actions/runs/34795311095)、実装commitの全ジョブ成功 |
| スクリーンショット5枚 | PASS | 2026-09-14、実ブラウザ撮影。01/05は1440×1000、02/03/04は1440×1400 |
| GitHub Web UIでREADME画像5枚確認 | PASS | 匿名でRepositoryのREADMEを開き、5枚の画像がcomplete=true・naturalWidth=1440を確認。Import・Merge・Exportをスクロール表示して目視確認 |

## ブラウザの確認シナリオ

- CSV / XLSXのファイル選択直後に表を表示し、Drag & Dropでも読み込める。
- 顧客名簿、商品一覧、社員一覧のデモを開ける。
- 姓と名を結合し「金城 俊輔」をプレビュー・適用・出力できる。
- 3列結合と、なし・半角・全角・ハイフン・カンマ・カスタムの区切り文字を確認する。
- 列分割の区切り文字・分割数・列名を設定し、余剰の内容が最後の列に保持される。
- 列名変更、削除、並び替え、新規列を適用し、Before / Afterで結果を確認する。
- 変更セル・新規列・削除列が識別できる。
- Undoで直前の操作を戻せる。
- 複数操作のレシピを保存・再適用し、JSONの書出し・読込ができる。
- CSVとXLSXをダウンロードし、出力の列名・順番・値を読戻しで確認する。
- ページングの表示範囲外も全件出力される。
- ファイル形式・空ファイル・サイズ・行数・列数・空欄列名などのエラーを確認する。
- デスクトップとモバイルで、取込から出力まで操作できる。

## Secret Scanの範囲

`scripts/secret-scan.mjs`は現行公開候補のテキストと機密ファイル名を検査します。既知の認証情報パターン、秘密鍵、認証情報入りURL、プレースホルダーではないcredential assignmentなどを検出し、値を出力せずファイル名・行番号・規則を返します。

依存ファイル、生成物、ログ、バイナリなどは除外します。Git過去履歴とスクリーンショット内容はこのスクリプトの対象外です。Git履歴のscanを別に実施した場合は、scannerのversion、コマンド、対象commit、結果を記録します。

## スクリーンショット

| 画像 | 内容 | 取得・表示確認 |
| --- | --- | --- |
| `docs/screenshots/01-import.png` | Import | 実画面を取得・目視確認、GitHub READMEでも読み込み成功 |
| `docs/screenshots/02-column-merge.png` | Column Merge | 実画面を取得・目視確認、GitHub READMEでも読み込み成功 |
| `docs/screenshots/03-column-split.png` | Column Split | 実画面を取得・目視確認、GitHub READMEでも読み込み成功 |
| `docs/screenshots/04-before-after.png` | Before / After | 実画面を取得・目視確認、GitHub READMEでも読み込み成功 |
| `docs/screenshots/05-export.png` | Export | 実画面を取得・目視確認、GitHub READMEでも読み込み成功 |


## 開発ルールの確認

`DEVELOPMENT_RULES.md`は作業フォルダ、ドキュメント配下、各親ディレクトリで見つかりませんでした。提示された要件と`AGENTS.md`に従い、インストール済みNext.jsのローカルドキュメントを確認して実装しました。apple-design SkillをUI設計に使用しました。
