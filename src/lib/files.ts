import Papa from "papaparse";
import * as XLSX from "xlsx";
import { cellText, makeDataset, MAX_COLUMNS, MAX_ROWS, type Cell, type Dataset } from "./engine";

export const MAX_FILE_SIZE = 10 * 1024 * 1024;

export type ImportedFile = { sheets: { name: string; data: Dataset }[] };

function decodeCSV(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder("shift_jis", { fatal: true }).decode(bytes);
    } catch {
      throw new Error("文字コードを読み取れません。UTF-8 または Shift_JIS のCSVを選択してください。");
    }
  }
}

function parseCSV(text: string): Dataset {
  if (text.includes("\u0000")) throw new Error("CSVとして読み取れません。ファイルの形式を確認してください。");
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), {
    delimiter: ",",
    dynamicTyping: false,
    skipEmptyLines: true,
    preview: MAX_ROWS + 2,
  });
  if (parsed.errors.length) throw new Error("CSVの引用符や改行の形式が正しくありません。ファイルを確認してください。");
  if (parsed.meta.truncated || parsed.data.length > MAX_ROWS + 1) {
    throw new Error(`データ行は${MAX_ROWS.toLocaleString()}行までです。`);
  }
  return makeDataset(parsed.data);
}

export async function readFile(file: File): Promise<ImportedFile> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension !== "csv" && extension !== "xlsx") throw new Error("CSV または XLSX ファイルを選択してください。");
  if (file.size > MAX_FILE_SIZE) throw new Error("ファイルサイズは10MBまでです。");
  if (!file.size) throw new Error("ファイルが空です。");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (extension === "csv") return { sheets: [{ name: "CSV", data: parseCSV(decodeCSV(bytes)) }] };

  // XLSX must be a ZIP container. SheetJS also understands CSV/HTML, which is not
  // appropriate for a file merely renamed to .xlsx.
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    throw new Error("有効なXLSXファイルではありません。");
  }
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(bytes, {
      type: "array",
      cellFormula: false,
      cellHTML: false,
      cellText: true,
      cellDates: false,
      sheetRows: MAX_ROWS + 2,
    });
  } catch {
    throw new Error("XLSXを読み取れません。破損やパスワード保護がないか確認してください。");
  }
  const sheets: ImportedFile["sheets"] = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const reference = sheet?.["!fullref"] || sheet?.["!ref"];
    if (!reference) continue;
    const range = XLSX.utils.decode_range(reference);
    if (range.e.c + 1 > MAX_COLUMNS) throw new Error(`「${name}」の列数が${MAX_COLUMNS}列を超えています。`);
    if (range.e.r > MAX_ROWS) throw new Error(`「${name}」のデータ行が${MAX_ROWS.toLocaleString()}行を超えています。`);
    const matrix = XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, raw: false, defval: "", blankrows: false });
    if (!matrix.length || matrix.every((row) => row.every((cell) => cell === "" || cell === null))) continue;
    sheets.push({ name, data: makeDataset(matrix) });
  }
  if (!sheets.length) throw new Error("ファイルに読み取れるデータがありません。");
  return { sheets };
}

/** Prefix risky text, including headers, so spreadsheet apps do not execute it. */
export function safeCSVCell(value: Cell): string {
  const text = cellText(value);
  return /^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
}

export function serializeCSV(data: Dataset, safe = true): string {
  const rows: Cell[][] = [data.columns.map((column) => column.name), ...data.rows];
  const serialized = Papa.unparse(rows.map((row) => row.map((cell) => safe ? safeCSVCell(cell) : cellText(cell))), {
    quotes: false,
    delimiter: ",",
    newline: "\r\n",
  });
  return `\uFEFF${serialized}`;
}

export function createXlsx(data: Dataset): Uint8Array {
  // All values are explicit string cells. Never populate `f` (Excel formula).
  // This also preserves leading zeroes in phone numbers and product codes.
  const rows = [data.columns.map((column) => column.name), ...data.rows.map((row) => row.map(cellText))];
  if (rows.some((row) => row.some((value) => value.length > 32_767))) {
    throw new Error("Excelの1セルは32,767文字までです。長い値を含むデータはCSVで書き出してください。");
  }
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = data.columns.map((column, index) => ({
    wch: Math.min(45, Math.max(12, column.name.length * 2, ...data.rows.slice(0, 100).map((row) => cellText(row[index]).length + 2))),
  }));
  sheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: data.rows.length, c: data.columns.length - 1 } }) };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "加工データ");
  return new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx", compression: true }));
}
