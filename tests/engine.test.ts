import { describe, expect, it } from "vitest";
import { applyRecipe, makeDataset, MAX_COLUMNS, MAX_ROWS, operationLabel, parseRecipe, recipeLabels, transform, type Dataset, type Operation } from "../src/lib/engine";
import { demos } from "../src/lib/demos";

const source = () => makeDataset([
  ["ID", "姓", "名", "電話番号"],
  ["001", "金城", "俊輔", "090-1234-5678"],
  ["002", "佐藤", "美咲", ""],
]);
const ids = (data: Dataset) => data.columns.map((column) => column.id);

describe("import normalization", () => {
  it("preserves leading zeros, normalizes ragged rows and disambiguates headers", () => {
    const data = makeDataset([["氏名", "氏名", ""], ["001", "金城"], ["002", null, true]]);
    expect(data.columns.map((column) => column.name)).toEqual(["氏名", "氏名 (2)", "列3"]);
    expect(data.rows).toEqual([["001", "金城", ""], ["002", "", true]]);
  });

  it("rejects empty data and input beyond limits", () => {
    expect(() => makeDataset([["", null]])).toThrow("データがありません");
    expect(() => makeDataset([Array.from({ length: MAX_COLUMNS + 1 }, (_, index) => `列${index}`)])).toThrow("100列");
    expect(() => makeDataset([["ID"], ...Array.from({ length: MAX_ROWS + 1 }, () => ["1"])])).toThrow("20,000");
  });
});

describe("merge", () => {
  it.each(["", " ", "　", "-", ",", " / "])("joins 3+ columns in selection order with %j", (separator) => {
    const data = source();
    const result = transform(data, { type: "merge", columnIds: [ids(data)[1], ids(data)[2], ids(data)[0]], separator, name: "検索用", removeSource: false });
    expect(result.rows[0].at(-1)).toBe(["金城", "俊輔", "001"].join(separator));
    expect(result.columns).toHaveLength(5);
  });

  it("removes sources and inserts the merged column at the earliest source position", () => {
    const data = source();
    const result = transform(data, { type: "merge", columnIds: [ids(data)[1], ids(data)[2]], separator: " ", name: "氏名", removeSource: true });
    expect(result.columns.map((column) => column.name)).toEqual(["ID", "氏名", "電話番号"]);
    expect(result.rows[0]).toEqual(["001", "金城 俊輔", "090-1234-5678"]);
  });

  it("does not mutate any source columns or rows", () => {
    const data = source();
    const original = structuredClone(data);
    for (const row of data.rows) Object.freeze(row);
    for (const column of data.columns) Object.freeze(column);
    Object.freeze(data.columns);
    Object.freeze(data.rows);
    Object.freeze(data);
    const merged = transform(data, { type: "merge", columnIds: ids(data).slice(1, 3), separator: " ", name: "氏名", removeSource: true });
    merged.columns[0].name = "変更";
    merged.rows[0][0] = "変更";
    expect(data).toEqual(original);
  });
});

describe("split", () => {
  it("handles repeated half/full spaces and retains final overflow verbatim", () => {
    const data = makeDataset([["氏名"], ["金城 　俊輔  第三"], ["佐藤"], [""]]);
    const result = transform(data, { type: "split", columnId: ids(data)[0], delimiter: " ", count: 2, names: ["姓", "名"], removeSource: true });
    expect(result.rows).toEqual([["金城", "俊輔  第三"], ["佐藤", ""], ["", ""]]);
  });

  it.each([",", "-", "/", "::"])("supports literal delimiters %j and preserves empty fields", (delimiter) => {
    const data = makeDataset([["元データ"], [`A${delimiter}${delimiter}C${delimiter}D`]]);
    const result = transform(data, { type: "split", columnId: ids(data)[0], delimiter, count: 3, names: ["1", "2", "3"], removeSource: false });
    expect(result.rows[0]).toEqual([`A${delimiter}${delimiter}C${delimiter}D`, "A", "", `C${delimiter}D`]);
  });

  it("rejects empty delimiters, inconsistent names and invalid counts", () => {
    const data = source();
    const op: Operation = { type: "split", columnId: ids(data)[1], delimiter: " ", count: 2, names: ["a", "b"], removeSource: false };
    expect(() => transform(data, { ...op, delimiter: "" })).toThrow("区切り文字");
    expect(() => transform(data, { ...op, count: 1 })).toThrow("整数");
    expect(() => transform(data, { ...op, count: 2.5 })).toThrow("整数");
    expect(() => transform(data, { ...op, names: ["a"] })).toThrow("列名の数");
  });
});

describe("column operations and recipes", () => {
  it("renames, deletes, reorders, and adds without changing unrelated cells", () => {
    const data = source();
    const recipe: Operation[] = [
      { type: "rename", columnId: ids(data)[0], name: "顧客番号" },
      { type: "delete", columnIds: [ids(data)[3]] },
      { type: "reorder", columnIds: [ids(data)[2], ids(data)[1], ids(data)[0]] },
      { type: "add", name: "ステータス", value: "未対応" },
    ];
    const result = applyRecipe(data, recipe);
    expect(result.columns.map((column) => column.name)).toEqual(["名", "姓", "顧客番号", "ステータス"]);
    expect(result.rows[0]).toEqual(["俊輔", "金城", "001", "未対応"]);
    expect(data.columns.map((column) => column.name)).toEqual(["ID", "姓", "名", "電話番号"]);
  });

  it("replays operations on generated columns with stable IDs", () => {
    const data = source();
    const merge: Operation = { type: "merge", columnIds: ids(data).slice(1, 3), separator: " ", name: "氏名", removeSource: true };
    const merged = transform(data, merge);
    const rename: Operation = { type: "rename", columnId: merged.columns[1].id, name: "お名前" };
    expect(applyRecipe(data, [merge, rename])).toEqual(transform(merged, rename));
  });

  it("keeps generated IDs stable when imported JSON uses a different property order", () => {
    const data = source();
    const merge: Operation = { type: "merge", columnIds: ids(data).slice(1, 3), separator: " ", name: "氏名", removeSource: true };
    const reordered: Operation = { removeSource: true, name: "氏名", separator: " ", columnIds: ids(data).slice(1, 3), type: "merge" };
    expect(transform(data, reordered)).toEqual(transform(data, merge));
  });

  it("allows recipes on the same schema but rejects unrelated columns at the same positions", () => {
    const data = source();
    const operation: Operation = { type: "delete", columnIds: [data.columns[3].id] };
    const sameSchema = makeDataset([["ID", "姓", "名", "電話番号"], ["100", "鈴木", "陽菜", "080-1111-2222"]]);
    expect(applyRecipe(sameSchema, [operation]).columns).toHaveLength(3);
    const wrongSchema = makeDataset([["ID", "カテゴリ", "商品名", "価格"], ["100", "文具", "ノート", "1000"]]);
    expect(() => applyRecipe(wrongSchema, [operation])).toThrow("見つかりません");
  });

  it("builds history labels using only column metadata", () => {
    const data = source();
    const merge: Operation = { type: "merge", columnIds: ids(data).slice(1, 3), separator: " ", name: "氏名", removeSource: true };
    const merged = transform(data, merge);
    const rename: Operation = { type: "rename", columnId: merged.columns[1].id, name: "お名前" };
    const labels = recipeLabels({ columns: data.columns, get rows(): never { throw new Error("Rows must not be read"); } }, [merge, rename]);
    expect(labels).toEqual(["姓 ＋ 名 → 氏名", "氏名 → お名前"]);
  });

  it("rejects missing IDs, repeated IDs, duplicate/blank names and deleting all columns", () => {
    const data = source();
    expect(() => transform(data, { type: "rename", columnId: "missing", name: "新名称" })).toThrow("見つかりません");
    expect(() => transform(data, { type: "delete", columnIds: [ids(data)[0], ids(data)[0]] })).toThrow("複数回");
    expect(() => transform(data, { type: "add", name: "  ID  ", value: "" })).toThrow("同じ列名");
    expect(() => transform(data, { type: "rename", columnId: ids(data)[0], name: "　 " })).toThrow("列名を入力");
    expect(() => transform(data, { type: "reorder", columnIds: ids(data).slice(1) })).toThrow("すべての列");
    expect(() => transform(data, { type: "delete", columnIds: ids(data) })).toThrow("すべての列は削除");
    const deleted = transform(data, { type: "delete", columnIds: [ids(data)[1]] });
    expect(() => transform(deleted, { type: "rename", columnId: ids(data)[1], name: "変更" })).toThrow("見つかりません");
  });

  it("enforces the 100-column result limit", () => {
    const data = makeDataset([Array.from({ length: MAX_COLUMNS }, (_, index) => `列${index}`), Array(MAX_COLUMNS).fill("x")]);
    expect(() => transform(data, { type: "add", name: "追加", value: "" })).toThrow("100列");
    const result = transform(data, { type: "merge", columnIds: ids(data).slice(0, 2), separator: "-", name: "結合", removeSource: true });
    expect(result.columns).toHaveLength(99);
  });

  it("ships all three labeled demo datasets", () => {
    expect(Object.values(demos).map((demo) => demo.name)).toEqual(["顧客名簿", "商品一覧", "社員一覧"]);
    expect(demos.customer.data.rows[0].slice(1, 3)).toEqual(["金城", "俊輔"]);
    expect(operationLabel({ type: "merge", columnIds: ids(source()).slice(1, 3), name: "氏名", separator: " ", removeSource: false }, source())).toContain("姓 ＋ 名 → 氏名");
    const splitProduct = transform(demos.product.data, { type: "split", columnId: demos.product.data.columns[0].id, delimiter: "-", count: 3, names: ["カテゴリコード", "商品番号", "色コード"], removeSource: false });
    expect(splitProduct.rows[0].slice(1, 4)).toEqual(["ST", "000101", "NV"]);
  });
});

describe("untrusted recipe validation", () => {
  it.each([null, [], {}, { name: {} }, { name: "a", operations: null }, { name: "a", operations: [] }, { name: " ", operations: [{ type: "add", name: "a", value: "" }] }])("rejects malformed recipe %j", (value) => {
    expect(() => parseRecipe(value)).toThrow("レシピ");
  });

  it.each([null, [], {}, { type: "unknown" }, { type: "add", name: "a", value: {} }, { type: "rename", columnId: null, name: "a" }, { type: "delete", columnIds: "column-1" }, { type: "merge", columnIds: [], separator: " ", name: "a", removeSource: "false" }, { type: "split", columnId: "column-1", delimiter: "-", count: "2", names: ["a", "b"], removeSource: false }])("rejects malformed operation %j before transformation", (value) => {
    const data = source();
    const before = structuredClone(data);
    expect(() => applyRecipe(data, [value] as Operation[])).toThrow("操作の形式");
    expect(data).toEqual(before);
  });

  it("copies validated fields and rejects more than 100 imported steps", () => {
    const operation = { type: "add", name: "備考", value: "未対応", unrelated: "not persisted" };
    expect(parseRecipe({ name: "  整形  ", operations: [operation] })).toEqual({ name: "整形", operations: [{ type: "add", name: "備考", value: "未対応" }] });
    expect(() => parseRecipe({ name: "長すぎる", operations: Array(101).fill(operation) })).toThrow("1〜100件");
    expect(() => applyRecipe(source(), null as unknown as Operation[])).toThrow("操作一覧");
  });
});
