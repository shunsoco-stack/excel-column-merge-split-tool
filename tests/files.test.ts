import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { makeDataset, MAX_ROWS } from "../src/lib/engine";
import { createXlsx, MAX_FILE_SIZE, readFile, serializeCSV } from "../src/lib/files";

function xlsxFile(workbook: XLSX.WorkBook) {
  const buffer: ArrayBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  return new File([buffer], "demo.xlsx");
}

describe("CSV input and output", () => {
  it("round trips Japanese, commas, quotes, newlines, empty cells, and leading zeros", async () => {
    const data = makeDataset([["番号", "説明", "空列"], ["00123", '金城, "俊輔"\n改行あり', ""], ["00001", "日本語", ""]]);
    const csv = serializeCSV(data);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const result = await readFile(new File([csv], "customers.csv"));
    expect(result.sheets[0].data).toEqual(data);
  });

  it("reads Shift_JIS Japanese with the native decoder fallback", async () => {
    const bytes = new Uint8Array([0x96, 0xbc, 0x91, 0x4f, 0x0d, 0x0a, 0x8b, 0xe0, 0x8f, 0xe9]);
    const result = await readFile(new File([bytes], "sjis.csv"));
    expect(result.sheets[0].data.columns[0].name).toBe("名前");
    expect(result.sheets[0].data.rows[0][0]).toBe("金城");
  });

  it("protects formula-like content and headers by default", async () => {
    const data = makeDataset([["=HEADER", "値"], ["=1+1", "+SUM(A1)"], ["  @SUM(A1)", "-1"], ["\t=1", "\r=2"]]);
    const safe = (await readFile(new File([serializeCSV(data)], "safe.csv"))).sheets[0].data;
    expect(safe.columns[0].name).toBe("'=HEADER");
    expect(safe.rows).toEqual([["'=1+1", "'+SUM(A1)"], ["'  @SUM(A1)", "'-1"], ["'\t=1", "'\r=2"]]);
    const raw = (await readFile(new File([serializeCSV(data, false)], "raw.csv"))).sheets[0].data;
    expect(raw).toEqual(data);
  });

  it("rejects malformed CSV, empty files, binary content and row overflow", async () => {
    await expect(readFile(new File(['name\r\n"unclosed'], "bad.csv"))).rejects.toThrow("引用符");
    await expect(readFile(new File([], "empty.csv"))).rejects.toThrow("空");
    await expect(readFile(new File(["name\n\u0000bad"], "binary.csv"))).rejects.toThrow("形式");
    await expect(readFile(new File(["ID\n" + "1\n".repeat(MAX_ROWS + 1)], "large.csv"))).rejects.toThrow("20,000");
  });

  it("accepts exactly 20,000 rows", async () => {
    const result = await readFile(new File(["ID\n" + "1\n".repeat(MAX_ROWS)], "limit.csv"));
    expect(result.sheets[0].data.rows).toHaveLength(MAX_ROWS);
  });
});

describe("XLSX input and output", () => {
  it("exports formula-looking text as string cells and preserves leading zeros", async () => {
    const data = makeDataset([["ID", "備考"], ["00123", "=HYPERLINK(\"https://example.com\")"], ["00001", "+1+1"]]);
    const bytes = createXlsx(data);
    const workbook = XLSX.read(bytes, { type: "array" });
    expect(workbook.Sheets[workbook.SheetNames[0]].B2).toMatchObject({ t: "s", v: '=HYPERLINK("https://example.com")' });
    expect(workbook.Sheets[workbook.SheetNames[0]].B2.f).toBeUndefined();
    const result = await readFile(new File([bytes as Uint8Array<ArrayBuffer>], "output.xlsx"));
    expect(result.sheets[0].data).toEqual(data);
  });

  it("reads multiple worksheets and Excel formatted display values", async () => {
    const workbook = XLSX.utils.book_new();
    const first = XLSX.utils.aoa_to_sheet([["商品コード", "日付"], [123, 45292]]);
    first.A2.z = "000000";
    first.B2.z = "yyyy/mm/dd";
    XLSX.utils.book_append_sheet(workbook, first, "商品");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["氏名"], ["金城 俊輔"]]), "社員");
    const result = await readFile(xlsxFile(workbook));
    expect(result.sheets.map((sheet) => sheet.name)).toEqual(["商品", "社員"]);
    expect(result.sheets[0].data.rows[0]).toEqual(["000123", "2024/01/01"]);
  });

  it("reads cached formula results without evaluating or retaining formulas", async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([["合計"], [2]]);
    sheet.A2.f = "1+1";
    XLSX.utils.book_append_sheet(workbook, sheet, "計算");
    const result = await readFile(xlsxFile(workbook));
    expect(result.sheets[0].data.rows).toEqual([["2"]]);
    const reexport = XLSX.read(createXlsx(result.sheets[0].data), { type: "array" });
    expect(reexport.Sheets[reexport.SheetNames[0]].A2.f).toBeUndefined();
  });

  it("rejects unsupported types, a renamed CSV, corrupt ZIPs and oversized files", async () => {
    await expect(readFile(new File(["a"], "a.xls"))).rejects.toThrow("CSV または XLSX");
    await expect(readFile(new File(["a,b\n1,2"], "fake.xlsx"))).rejects.toThrow("有効なXLSX");
    await expect(readFile(new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0])], "corrupt.xlsx"))).rejects.toThrow("読み取れません");
    await expect(readFile(new File([new Uint8Array(MAX_FILE_SIZE + 1)], "big.csv"))).rejects.toThrow("10MB");
  });

  it("rejects oversized worksheet ranges before converting cells", async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([["名前"], ["金城"]]);
    sheet["!ref"] = "A1:CW2";
    sheet.CW2 = { t: "s", v: "超過" };
    XLSX.utils.book_append_sheet(workbook, sheet, "横長");
    await expect(readFile(xlsxFile(workbook))).rejects.toThrow("100列");
  });

  it("reports Excel cell text limits clearly without preventing CSV output", () => {
    const data = makeDataset([["長文"], ["あ".repeat(32_768)]]);
    expect(() => createXlsx(data)).toThrow("CSVで書き出してください");
    expect(serializeCSV(data)).toContain("あ".repeat(32_768));
  });
});
