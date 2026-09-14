import { test, expect, type Page, type Download } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import Papa from "papaparse";
import * as XLSX from "xlsx";

async function importCSV(page: Page, content: string, name = "入力.csv") {
  await page.getByLabel("Excel・CSVファイルを選択").setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(content, "utf8") });
  await expect(page.getByRole("table", { name: "編集テーブル", exact: true })).toBeVisible();
}

async function customer(page: Page) {
  await page.locator(".demo-nav").getByRole("button", { name: "顧客名簿", exact: true }).click();
  await expect(page.getByRole("table", { name: "編集テーブル", exact: true })).toBeVisible();
}

async function editTable(page: Page) {
  await page.getByRole("button", { name: "編集テーブル", exact: true }).click();
  return page.getByRole("table", { name: "編集テーブル", exact: true });
}

async function apply(page: Page) {
  await page.getByRole("button", { name: "変更を適用", exact: true }).click();
  await expect(page.getByRole("table", { name: "処理後のデータ", exact: true })).toBeVisible();
}

async function dismissToast(page: Page) {
  const close = page.getByRole("button", { name: "通知を閉じる", exact: true });
  if (await close.isVisible()) await close.click();
}

async function downloadedBytes(download: Download) {
  const filename = await download.path();
  expect(filename).not.toBeNull();
  return readFile(filename!);
}

test.beforeEach(async ({ page }) => { await page.goto("/"); });

test("CSV file selection immediately renders the complete table with leading zeroes and quoted values", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", request => { if (request.method() === "POST") requests.push(request.url()); });
  await importCSV(page, '顧客番号,姓,名,メモ\r\n00001,金城,俊輔,"改行\nカンマ,あり"\r\n00002,佐藤,美咲,通常');
  const table = page.getByRole("table", { name: "編集テーブル", exact: true });
  await expect(table.locator("tbody tr")).toHaveCount(2);
  await expect(table.locator("tbody tr").first().locator("td")).toHaveText(["1", "00001", "金城", "俊輔", "改行\nカンマ,あり"]);
  await expect(page.getByRole("button", { name: "顧客番号列を選択", exact: true })).toBeVisible();
  expect(requests).toEqual([]);
});

test("drag and drop imports a CSV directly", async ({ page }) => {
  const dataTransfer = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["姓,名\n金城,俊輔"], "ドロップ.csv", { type: "text/csv" }));
    return transfer;
  });
  await page.locator(".import-panel").dispatchEvent("drop", { dataTransfer });
  await expect(page.getByRole("table", { name: "編集テーブル", exact: true })).toBeVisible();
  await expect(page.locator(".file-description strong")).toHaveText("ドロップ.csv");
  await dataTransfer.dispose();
});

test("three columns merge in selection order with a custom separator; preview marks cells and undo restores data", async ({ page }) => {
  await customer(page);
  await page.getByRole("button", { name: "姓列を選択", exact: true }).click();
  await page.getByRole("button", { name: "名列を選択", exact: true }).click();
  await page.getByRole("button", { name: "都道府県列を選択", exact: true }).click();
  await page.getByRole("button", { name: "カスタム", exact: true }).click();
  await page.getByLabel("カスタム区切り文字", { exact: true }).fill("｜");
  await page.getByLabel("結合後の列名", { exact: true }).fill("顧客表示");
  await expect(page.locator(".preview-after")).toHaveText("金城｜俊輔｜沖縄県");
  await page.getByRole("button", { name: "Before / Afterで確認", exact: true }).click();
  const after = page.getByRole("table", { name: "処理後のデータ", exact: true });
  await expect(after.locator(".changed-cell")).toHaveCount(8);
  await expect(page.locator(".compare-summary")).toContainText("未適用のプレビュー");
  await apply(page);
  await expect(after.locator("tbody tr").first().locator("td").last()).toHaveText("金城｜俊輔｜沖縄県");
  await expect(page.locator(".recipe-strip li")).toHaveCount(1);
  await page.getByRole("button", { name: "元に戻す", exact: true }).click();
  await expect(page.getByRole("button", { name: "顧客表示列を選択", exact: true })).toHaveCount(0);
  await expect(page.getByRole("table", { name: "編集テーブル", exact: true }).locator("thead th")).toHaveCount(7);
  await expect(page.getByRole("button", { name: "元に戻す", exact: true })).toBeDisabled();
});

test("employee names split into surname and given name, optionally replacing the source", async ({ page }) => {
  await page.locator(".demo-nav").getByRole("button", { name: "社員一覧", exact: true }).click();
  await page.getByRole("button", { name: "列を分割", exact: true }).click();
  await page.getByRole("button", { name: "氏名列を選択", exact: true }).click();
  await page.getByLabel("元の列を削除する", { exact: true }).check();
  await expect(page.locator(".preview-after")).toHaveText("金城 / 俊輔");
  await apply(page);
  const after = page.getByRole("table", { name: "処理後のデータ", exact: true });
  await expect(after.locator("tbody tr").first().locator("td")).toHaveText(["1", "00101", "金城", "俊輔", "開発部 / プロダクトチーム", "kinjo@example.com", "2022/04/01"]);
  await expect(after.getByRole("columnheader", { name: "氏名", exact: true })).toHaveCount(0);
  await expect(after.locator(".changed-cell")).toHaveCount(12);
});

test("split count preserves overflow in the last column and supports custom delimiters", async ({ page }) => {
  await importCSV(page, "商品コード,価格\nA::B::C::D,100\nX::Y,200");
  await page.getByRole("button", { name: "列を分割", exact: true }).click();
  await page.getByRole("button", { name: "商品コード列を選択", exact: true }).click();
  await page.locator("#delimiter").selectOption("custom");
  await page.getByLabel("カスタム分割文字", { exact: true }).fill("::");
  await page.getByLabel("分割する列数").fill("3");
  await page.getByLabel("分割後の列名 1", { exact: true }).fill("カテゴリ");
  await page.getByLabel("分割後の列名 2", { exact: true }).fill("品番");
  await page.getByLabel("分割後の列名 3", { exact: true }).fill("残り");
  await apply(page);
  const rows = page.getByRole("table", { name: "処理後のデータ", exact: true }).locator("tbody tr");
  await expect(rows.first().locator("td")).toHaveText(["1", "A::B::C::D", "A", "B", "C::D", "100"]);
  await expect(rows.nth(1).locator("td")).toHaveText(["2", "X::Y", "X", "Y", "—", "200"]);
});

test("the product demo is ready to split its code into three meaningful columns", async ({ page }) => {
  await page.locator(".demo-cards").getByRole("button", { name: /商品一覧/ }).click();
  await expect(page.getByRole("table", { name: "編集テーブル", exact: true })).toBeVisible();
  await expect(page.locator(".inspector-heading h2")).toHaveText("列を分割");
  await expect(page.locator(".preview-after")).toHaveText("ST / 000101 / NV");
  await apply(page);
  await expect(page.getByRole("table", { name: "処理後のデータ", exact: true }).locator("tbody tr").first().locator("td")).toHaveText(["1", "ST-000101-NV", "ST", "000101", "NV", "文具", "ノート", "ネイビー", "A5", "480"]);
});

test("rename, delete, add and reorder accumulate a reversible recipe", async ({ page }) => {
  await customer(page);
  await page.getByRole("button", { name: "列名変更", exact: true }).click();
  await page.getByLabel("対象の列", { exact: true }).selectOption({ label: "姓" });
  await page.getByLabel("新しい列名", { exact: true }).fill("名字");
  await apply(page);
  await editTable(page);
  await page.getByRole("button", { name: "列を削除", exact: true }).click();
  await page.getByRole("button", { name: "電話番号列を選択", exact: true }).click();
  await apply(page);
  await page.getByRole("button", { name: "新規列", exact: true }).click();
  await page.getByLabel("列名", { exact: true }).fill("対応状況");
  await page.getByLabel("全行に入れる値").fill("未対応");
  await apply(page);
  await page.getByRole("button", { name: "並び替え", exact: true }).click();
  await page.getByRole("button", { name: "名字を左へ", exact: true }).click();
  await apply(page);
  const table = await editTable(page);
  await expect(table.locator("thead th").nth(1)).toContainText("名字");
  await expect(page.getByRole("button", { name: "電話番号列を選択", exact: true })).toHaveCount(0);
  await expect(table.locator("tbody tr").first().locator("td").last()).toHaveText("未対応");
  await expect(page.locator(".recipe-strip li")).toHaveCount(4);
  await page.getByRole("button", { name: "元に戻す", exact: true }).click();
  await expect(table.locator("thead th").nth(1)).toContainText("顧客ID");
  await expect(table.locator("tbody tr").first().locator("td").last()).toHaveText("未対応");
  await expect(page.locator(".recipe-strip li")).toHaveCount(3);
});

test("saved recipes survive reload and JSON recipes reapply operations that refer to a newly created column", async ({ page }) => {
  await customer(page);
  await page.getByRole("button", { name: "新規列", exact: true }).click();
  await page.getByLabel("列名", { exact: true }).fill("判定");
  await page.getByLabel("全行に入れる値").fill("確認待ち");
  await apply(page);
  await page.getByRole("button", { name: "列名変更", exact: true }).click();
  await page.getByLabel("対象の列", { exact: true }).selectOption({ label: "判定" });
  await page.getByLabel("新しい列名", { exact: true }).fill("ステータス");
  await apply(page);
  await page.getByRole("button", { name: "レシピを管理", exact: true }).click();
  await page.locator("#recipe-name").fill("顧客の確認フロー");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator(".saved-recipe")).toContainText("顧客の確認フロー");
  const jsonPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "顧客の確認フローをJSONで保存", exact: true }).click();
  const recipe = JSON.parse((await downloadedBytes(await jsonPromise)).toString("utf8"));
  expect(recipe.operations.map((operation: { type: string }) => operation.type)).toEqual(["add", "rename"]);
  expect(JSON.stringify(recipe)).not.toContain("kinjo@example.com");
  await page.reload();
  await customer(page);
  await page.getByRole("button", { name: "レシピを管理", exact: true }).click();
  await expect(page.locator(".saved-recipe")).toContainText("顧客の確認フロー");
  await page.locator(".saved-recipe").getByRole("button", { name: "適用", exact: true }).click();
  await expect(page.getByRole("table", { name: "処理後のデータ", exact: true }).locator("tbody tr").first().locator("td").last()).toHaveText("確認待ち");
  await expect(page.getByRole("table", { name: "処理後のデータ", exact: true }).locator("thead")).toContainText("ステータス");
  await customer(page);
  await page.getByRole("button", { name: "レシピを管理", exact: true }).click();
  await page.getByRole("button", { name: "顧客の確認フローを削除", exact: true }).click();
  await page.getByLabel("レシピファイルを選択", { exact: true }).setInputFiles({ name: "recipe.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(recipe)) });
  await expect(page.locator(".saved-recipe")).toHaveCount(1);
  await page.locator(".saved-recipe").getByRole("button", { name: "適用", exact: true }).click();
  await expect(page.getByRole("table", { name: "処理後のデータ", exact: true }).locator("tbody tr").first().locator("td").last()).toHaveText("確認待ち");
});

test("corrupt saved recipes and malformed JSON imports do not crash the workspace", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await customer(page);
  await page.evaluate(() => localStorage.setItem("column-studio-recipes", "{broken"));
  await page.getByRole("button", { name: "レシピを管理", exact: true }).click();
  await expect(page.locator(".no-recipes")).toBeVisible();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.evaluate(() => localStorage.setItem("column-studio-recipes", JSON.stringify([
    null,
    { name: "不正な操作", operations: [{ type: "merge", name: "壊れた設定" }] },
    { name: "正常なレシピ", operations: [{ type: "add", name: "確認状態", value: "確認待ち" }] },
  ])));
  await page.getByRole("button", { name: "レシピを管理", exact: true }).click();
  await expect(page.locator(".saved-recipe")).toHaveCount(1);
  await expect(page.locator(".saved-recipe")).toContainText("正常なレシピ");
  await page.getByLabel("レシピファイルを選択", { exact: true }).setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ name: "不正なJSONレシピ", operations: [{ type: "split" }] })) });
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  await expect(page.locator(".saved-recipe")).toHaveCount(1);
  await page.locator(".saved-recipe").getByRole("button", { name: "適用", exact: true }).click();
  await expect(page.getByRole("table", { name: "処理後のデータ", exact: true }).locator("tbody tr").first().locator("td").last()).toHaveText("確認待ち");
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("XLSX import offers sheet selection and preserves string codes", async ({ page }) => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["番号", "氏名"], ["00101", "金城 俊輔"]]), "社員");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["商品番号", "商品名"], ["000101", "ノート"]]), "商品");
  await page.getByLabel("Excel・CSVファイルを選択").setInputFiles({ name: "複数シート.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) });
  const table = page.getByRole("table", { name: "編集テーブル", exact: true });
  await expect(table.locator("tbody tr").first().locator("td")).toHaveText(["1", "00101", "金城 俊輔"]);
  await page.getByLabel("シートを選択", { exact: true }).selectOption({ label: "商品" });
  await expect(table.locator("tbody tr").first().locator("td")).toHaveText(["1", "000101", "ノート"]);
});

test("CSV and XLSX downloads contain every row, Japanese text, zero-padded IDs and safe formula-like strings", async ({ page }) => {
  const matrix = [["顧客番号", "氏名", "注意事項"], ...Array.from({ length: 12 }, (_, index) => [String(index + 1).padStart(5, "0"), index ? `利用者${index + 1}` : "金城 俊輔", index ? "通常" : "=2+3"])];
  await importCSV(page, Papa.unparse(matrix), "検証.csv");
  await page.getByRole("button", { name: "新規列", exact: true }).click();
  await page.getByLabel("列名", { exact: true }).fill("加工状態");
  await page.getByLabel("全行に入れる値").fill("処理済み");
  await apply(page);
  await editTable(page);
  await expect(page.getByRole("table", { name: "編集テーブル", exact: true }).locator("tbody tr")).toHaveCount(10);
  await page.getByRole("button", { name: "次のページ", exact: true }).click();
  await expect(page.getByRole("table", { name: "編集テーブル", exact: true }).locator("tbody tr")).toHaveCount(2);
  await page.getByRole("button", { name: "書き出す", exact: true }).click();
  await page.locator(".format-options").getByRole("button", { name: /CSV/ }).click();
  const csvPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSVをダウンロード", exact: true }).click();
  const csvDownload = await csvPromise;
  expect(csvDownload.suggestedFilename()).toBe("検証_加工済み.csv");
  const csv = await downloadedBytes(csvDownload);
  expect([...csv.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const parsed = Papa.parse<string[]>(csv.toString("utf8")).data;
  expect(parsed).toHaveLength(13);
  expect(parsed[1]).toEqual(["00001", "金城 俊輔", "'=2+3", "処理済み"]);
  expect(parsed[12][0]).toBe("00012");
  await page.locator(".format-options").getByRole("button", { name: /Excel/ }).click();
  const xlsxPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "XLSXをダウンロード", exact: true }).click();
  const xlsxDownload = await xlsxPromise;
  expect(xlsxDownload.suggestedFilename()).toBe("検証_加工済み.xlsx");
  const workbook = XLSX.read(await downloadedBytes(xlsxDownload), { type: "buffer", cellFormula: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const exported = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: true });
  expect(exported).toEqual(matrix.map((row, index) => [...row, index ? "処理済み" : "加工状態"]));
  expect(sheet.A2.t).toBe("s");
  expect(sheet.C2.f).toBeUndefined();
  await expect(page.locator(".download-success")).toBeVisible();
});

test("file validation rejects unsupported, empty, malformed and oversized files without losing imported data", async ({ page }) => {
  const input = page.getByLabel("Excel・CSVファイルを選択");
  const alert = page.getByRole("main").getByRole("alert");
  await input.setInputFiles({ name: "invalid.txt", mimeType: "text/plain", buffer: Buffer.from("a,b") });
  await expect(alert).toContainText("CSV または XLSX");
  await input.setInputFiles({ name: "empty.csv", mimeType: "text/csv", buffer: Buffer.alloc(0) });
  await expect(alert).toContainText("ファイルが空");
  await input.setInputFiles({ name: "false.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from("a,b\n1,2") });
  await expect(alert).toContainText("有効なXLSX");
  await importCSV(page, "番号,氏名\n0001,金城 俊輔");
  await input.setInputFiles({ name: "broken.csv", mimeType: "text/csv", buffer: Buffer.from('番号,氏名\n1,"閉じない') });
  await expect(alert).toContainText("引用符");
  await expect(page.getByRole("table", { name: "編集テーブル", exact: true })).toContainText("金城 俊輔");
  await input.setInputFiles({ name: "large.csv", mimeType: "text/csv", buffer: Buffer.alloc(10 * 1024 * 1024 + 1, "a") });
  await expect(alert).toContainText("10MB");
  await expect(page.getByRole("table", { name: "編集テーブル", exact: true })).toContainText("金城 俊輔");
});

test("mobile import, editor, comparison and export stay within the document width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const noOverflow = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await noOverflow();
  await page.locator(".demo-cards").getByRole("button", { name: /顧客名簿/ }).click();
  await noOverflow();
  await page.getByRole("button", { name: "姓列を選択", exact: true }).click();
  await page.getByRole("button", { name: "名列を選択", exact: true }).click();
  await apply(page);
  await noOverflow();
  await page.getByRole("button", { name: "書き出す", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await noOverflow();
});

test("capture the five real application states for the README", async ({ page }) => {
  const directory = path.resolve("docs/screenshots");
  await mkdir(directory, { recursive: true });
  const capture = async (filename: string) => {
    await page.setViewportSize({ width: 1440, height: filename === "01-import.png" || filename === "05-export.png" ? 1000 : 1400 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await page.screenshot({ path: path.join(directory, filename), fullPage: false });
  };
  await page.evaluate(() => document.fonts.ready);
  await capture("01-import.png");
  await customer(page);
  await page.getByRole("button", { name: "姓列を選択", exact: true }).click();
  await page.getByRole("button", { name: "名列を選択", exact: true }).click();
  await dismissToast(page);
  await expect(page.locator(".preview-after")).toHaveText("金城 俊輔");
  await capture("02-column-merge.png");
  await page.getByRole("button", { name: "Before / Afterで確認", exact: true }).click();
  await capture("04-before-after.png");
  await apply(page);
  await dismissToast(page);
  await page.getByRole("button", { name: "書き出す", exact: true }).click();
  await capture("05-export.png");
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.locator(".demo-nav").getByRole("button", { name: "社員一覧", exact: true }).click();
  await page.getByRole("button", { name: "列を分割", exact: true }).click();
  await page.getByRole("button", { name: "氏名列を選択", exact: true }).click();
  await dismissToast(page);
  await expect(page.locator(".preview-after")).toHaveText("金城 / 俊輔");
  await capture("03-column-split.png");
});
