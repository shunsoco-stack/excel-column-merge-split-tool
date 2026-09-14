# ポートフォリオ掲載用・完全版プロンプト

以下を、既存ポートフォリオへ作品を追加する開発タスクに貼り付けて使用してください。公開URL、スクリーンショット、検証結果は実行時にも確認してください。アプリの開発タスクではポートフォリオ本体を変更していません。

---

既存ポートフォリオへ「Excel列結合・分割ツール」を新しい作品として追加してください。画像の配置、作品データ、一覧・詳細、カテゴリ絞り込み、アプリとGitHubへのリンク、レスポンシブ表示まで実装し、確認してください。既存の作品、デザイン、未コミットの変更を保護して統合してください。

## 最初に確認するもの

- 対象ポートフォリオ：`my-homepage`
- Repository：https://github.com/shunsoco-stack/my-homepage
- 共通データ：`src/mocks/works.ts`の`WorkItem`、`works`、`workCategories`
- カード：`src/components/feature/WorkCard.tsx`
- 詳細モーダル：`src/components/feature/WorkDetailModal.tsx`
- トップページ作品一覧：`src/pages/home/components/Works.tsx`
- 全作品一覧：`src/pages/works/components/WorksGrid.tsx`
- 公開パスの解決：`src/utils/resolvePublicUrl`

ファイル構成は実行時に再確認してください。適用範囲内の`AGENTS.md`と`DEVELOPMENT_RULES.md`があれば先に読み、apple-design Skillが利用できる場合は使用してください。既存のカード・詳細モーダル・ギャラリーを活用してください。

## 作品情報

| 項目 | 値 |
| --- | --- |
| アプリ名 | Excel列結合・分割ツール |
| カテゴリ | 業務効率化ツール |
| サブカテゴリ | Excel・CSV加工 |
| 制作区分 | Concept Project / 自主制作 |
| 制作年 | 2026 |
| スラッグ | excel-column-merge-split-tool |
| 作品URL | /works/excel-column-merge-split-tool |
| アプリURL | https://excel-column-merge-split-tool.vercel.app |
| GitHub | https://github.com/shunsoco-stack/excel-column-merge-split-tool |
| README | https://github.com/shunsoco-stack/excel-column-merge-split-tool#readme |
| 検証記録 | https://github.com/shunsoco-stack/excel-column-merge-split-tool/blob/main/docs/QA.md |
| 詳細画面のメインCTA | ツールを使う |

アプリ名を画面内の補助ブランド「Column / studio」に置き換えないでください。実在企業の受託案件、導入実績、売上向上実績として紹介しないでください。

## 掲載文

カード用：

> Excel・CSVの列を、コード不要で結合・分割・並び替え。読み込み直後の表から列を選び、変更の比較、Undo、レシピ保存、CSV・XLSX出力までブラウザ内で完結する業務効率化ツール。

詳細用：

> 顧客名簿の姓と名の結合、商品コードの分割、社員一覧の列整理など、繰り返し発生する表計算データの加工を短い手順で行うために制作しました。ファイルの読み込みが完了するとすぐに表を表示し、見出しをクリックして列を選択できます。結合・分割・列名変更・削除・並び替え・新規列の6種類の操作に対応し、ライブプレビューとBefore / Afterで変更を確認してから適用します。直前の操作はUndoでき、一連の手順はレシピとして保存・再利用できます。入力ファイルやセル値をサーバーへ送信せず、CSV・XLSXの出力までブラウザ内で処理します。

設計の見どころ：

- Import → Select Columns → Transform → Preview → Exportの5ステップで進む作業導線。
- ファイル選択後すぐに表を表示し、列見出しをそのまま選択操作に利用。
- 2列・3列以上の結合と、選択順の番号表示。6種類のSeparatorを選択。
- スペース・カンマ・ハイフン・スラッシュ・カスタムで分割。分割しきれない内容は最後の列に保持。
- 元データを保った変換、Before / After比較、新規列・変更セルの強調、Undo。
- 操作を順序付きで保存するレシピ。JSONの書き出し・読み込みとブラウザ保存。
- データ処理用のバックエンドやデータベースを設けない構成。
- 値・列構成をCSVまたはXLSXへ出力。CSVの式解釈を抑えるエスケープと、XLSXの文字列セル出力。

バッジ候補：`ブラウザ内処理` / `6種類の列加工` / `Before・After` / `Undo・レシピ` / `CSV・XLSX出力`

技術タグ：`Next.js 16` / `React 19` / `TypeScript` / `SheetJS` / `Papa Parse` / `Vitest` / `Vercel`

## 実装構成

Next.js App RouterのStatic Export構成です。ReactのClient Componentが取込、列選択、操作設定、プレビュー、履歴、レシピ、ダウンロードを管理します。`src/lib/engine.ts`に入力検証・列変換・レシピ再適用、`src/lib/files.ts`にPapa ParseとSheetJSによるファイル入出力、`src/lib/demos.ts`に3種類の架空データがあります。

生成AIや外部AI APIは使用していません。アカウント登録、バックエンドAPI、データベース、共同編集機能はありません。「AIツール」「クラウドで自動処理」と表現しないでください。

## 掲載する画像5枚

以下の実画面画像を取得し、`public/works/excel-column-merge-split-tool/`へ保存してください。画像が未公開・取得不能の場合は、実在しない画像へ置き換えず、公開元と検証記録を確認してください。画面をAI生成して代用しないでください。

| 順番 | 保存ファイル名 | ギャラリー名 | alt |
| --- | --- | --- | --- |
| 1 | 01-import.png | Import | Excel・CSVのドロップ領域と顧客名簿・商品一覧・社員一覧のデモを表示した画面 |
| 2 | 02-column-merge.png | Column Merge | 姓と名を選び、半角スペースで結合する設定とライブプレビューを表示した画面 |
| 3 | 03-column-split.png | Column Split | 区切り文字・分割数・分割後の列名を指定する列分割画面 |
| 4 | 04-before-after.png | Before / After | 加工前後の表を比較し、新規列と変更セルを確認する画面 |
| 5 | 05-export.png | Export | 適用済みデータの行数・列数とCSV・XLSXのダウンロードを表示した画面 |

取得URL：

1. https://raw.githubusercontent.com/shunsoco-stack/excel-column-merge-split-tool/main/docs/screenshots/01-import.png
2. https://raw.githubusercontent.com/shunsoco-stack/excel-column-merge-split-tool/main/docs/screenshots/02-column-merge.png
3. https://raw.githubusercontent.com/shunsoco-stack/excel-column-merge-split-tool/main/docs/screenshots/03-column-split.png
4. https://raw.githubusercontent.com/shunsoco-stack/excel-column-merge-split-tool/main/docs/screenshots/04-before-after.png
5. https://raw.githubusercontent.com/shunsoco-stack/excel-column-merge-split-tool/main/docs/screenshots/05-export.png

メイン画像には`02-column-merge.png`を使用してください。必要なら既存作品の規則に合わせてWebPサムネイルを作成できますが、ギャラリーには5枚すべてを登録し、文字や操作領域が読める表示サイズを保ってください。画像パスは`resolvePublicUrl`等、既存の公開パス解決に従ってください。

## データ登録・ルーティング

- 新規作品のIDは既存のIDと重複しない値を選択してください。
- `title`、`category`、`subcategory`、`year`、`description`、`tags`、`image`、`gallery`、`url`、`appUrl`、`githubUrl`を既存型に合わせて登録してください。
- `url`には`/works/excel-column-merge-split-tool`を設定し、詳細モーダル・詳細ページの既存方式でアクセスできるようにしてください。ルートが必要な実装では登録し、一覧だけにリンクを追加して404にしないでください。
- カテゴリ「業務効率化ツール」が未登録なら既存カテゴリを改名せず追加し、一覧の絞り込みに反映してください。
- カードから作品詳細、詳細から本番ツール・GitHubへ到達できるようにしてください。
- 3つのデモは架空データです。「顧客名簿」「商品一覧」「社員一覧」を例として紹介できます。
- 公開日、テスト件数、監査結果、性能値は検証記録で確認できた内容のみ掲載してください。

## 正確に伝える制限

- 入力はCSV / XLSX、最大10 MiB（画面表記10MB）・20,000データ行・100列です。
- 1行目を見出しとして扱います。CSVはUTF-8 / Shift_JISのカンマ区切りです。
- XLSXは選択したシートの値を加工します。出力は加工した値と列構成を持つ1シートです。
- 元の書式、数式そのもの、数式の再計算、マクロ、画像、結合セル構造、他のシートは保持しません。
- 分割数の画面指定は2〜10列です。余剰の区切りは最後の列へ残します。
- CSVには、数式として解釈される可能性がある文字列の先頭へ単一引用符が付く場合があります。
- 入力データと編集結果はページを閉じると消えます。レシピ設定は同じブラウザへ保存でき、列構成が異なるファイルには適用できない場合があります。
- レシピには列名、区切り文字、新規列の固定値などの設定が含まれます。
- ブラウザ内処理であり、初回のアプリ配信にはネットワークが必要です。オフライン動作保証、無制限の大容量処理、暗号化保存をうたわないでください。
- 納品実績、導入企業数、削減時間、性能保証、セキュリティ認証を創作しないでください。

## 完了確認

既存プロジェクトのlint・型検査・buildなど必要な検証を実行し、デスクトップとモバイルで作品カード、カテゴリ絞り込み、作品詳細、5枚ギャラリー、キーボード操作、アプリ・GitHubリンクを実際に確認してください。直アクセスとページ再読み込みで作品URLが表示できることも確認してください。

画像は5枚とも読み込まれ、適切なaltが付き、ギャラリーの送り戻しと閉じる操作ができる状態にしてください。既存作品に表示崩れがないこと、URLや画像のプレースホルダーが残っていないことを確認し、変更したファイル、実施した検証、確認できたURLを報告してください。公開を依頼されている場合は、既存の公開フローとその時点の承認範囲に従って反映してください。
