export type Cell = string | number | boolean | null;

export type Column = { id: string; name: string };
export type Dataset = { columns: Column[]; rows: Cell[][] };

export type Operation =
  | { type: "merge"; columnIds: string[]; separator: string; name: string; removeSource: boolean }
  | { type: "split"; columnId: string; delimiter: string; count: number; names: string[]; removeSource: boolean }
  | { type: "rename"; columnId: string; name: string }
  | { type: "delete"; columnIds: string[] }
  | { type: "reorder"; columnIds: string[] }
  | { type: "add"; name: string; value: string };

export const MAX_COLUMNS = 100;
export const MAX_ROWS = 20_000;
export type RecipeDefinition = { name: string; operations: Operation[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** JSON and localStorage values are untrusted, even when TypeScript has a type. */
export function validateOperation(value: unknown): asserts value is Operation {
  const text = (field: unknown): field is string => typeof field === "string";
  const texts = (field: unknown): field is string[] => Array.isArray(field) && field.length <= MAX_COLUMNS && field.every(text);
  if (!isRecord(value)) throw new Error("操作の形式が正しくありません。");
  let valid = false;
  switch (value.type) {
    case "merge": valid = texts(value.columnIds) && text(value.separator) && text(value.name) && typeof value.removeSource === "boolean"; break;
    case "split": valid = text(value.columnId) && text(value.delimiter) && typeof value.count === "number" && Number.isFinite(value.count) && texts(value.names) && typeof value.removeSource === "boolean"; break;
    case "rename": valid = text(value.columnId) && text(value.name); break;
    case "delete":
    case "reorder": valid = texts(value.columnIds); break;
    case "add": valid = text(value.name) && text(value.value); break;
  }
  if (!valid) throw new Error("操作の形式が正しくありません。列・区切り文字・値の設定を確認してください。");
}

function copyOperation(operation: Operation): Operation {
  switch (operation.type) {
    case "merge": return { type: "merge", columnIds: [...operation.columnIds], separator: operation.separator, name: operation.name, removeSource: operation.removeSource };
    case "split": return { type: "split", columnId: operation.columnId, delimiter: operation.delimiter, count: operation.count, names: [...operation.names], removeSource: operation.removeSource };
    case "rename": return { type: "rename", columnId: operation.columnId, name: operation.name };
    case "delete": return { type: "delete", columnIds: [...operation.columnIds] };
    case "reorder": return { type: "reorder", columnIds: [...operation.columnIds] };
    case "add": return { type: "add", name: operation.name, value: operation.value };
  }
}

export function parseRecipe(value: unknown): RecipeDefinition {
  if (!isRecord(value) || typeof value.name !== "string" || !value.name.trim() || !Array.isArray(value.operations) || value.operations.length === 0 || value.operations.length > 100) {
    throw new Error("レシピには名前と1〜100件の操作が必要です。");
  }
  return {
    name: value.name.trim(),
    operations: value.operations.map((operation) => {
      validateOperation(operation);
      return copyOperation(operation);
    }),
  };
}

function stableHash(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36);
}

export function cellText(value: Cell | undefined): string {
  return value == null ? "" : String(value);
}

function validateDataset(data: Dataset): void {
  if (!data || !Array.isArray(data.columns) || !Array.isArray(data.rows)) {
    throw new Error("データ形式が正しくありません。");
  }
  if (!data.columns.length) throw new Error("1列以上のデータが必要です。");
  if (data.columns.length > MAX_COLUMNS) throw new Error(`列数は${MAX_COLUMNS}列までです。`);
  if (data.rows.length > MAX_ROWS) throw new Error(`データ行は${MAX_ROWS.toLocaleString()}行までです。`);
  if (data.columns.some((column) => !column || typeof column.id !== "string" || !column.id || typeof column.name !== "string")) {
    throw new Error("列の形式が正しくありません。");
  }
  if (new Set(data.columns.map((column) => column.id)).size !== data.columns.length) {
    throw new Error("列の識別子が重複しています。");
  }
  validateNames(data.columns.map((column) => column.name));
  if (data.rows.some((row) => !Array.isArray(row) || row.length !== data.columns.length)) {
    throw new Error("行ごとの列数が一致していません。");
  }
}

function validateNames(names: string[]): void {
  const trimmed = names.map((name) => name.trim());
  if (trimmed.some((name) => !name)) throw new Error("列名を入力してください。");
  if (new Set(trimmed).size !== trimmed.length) throw new Error("同じ列名が存在します。別の列名を入力してください。");
}

function indicesFor(data: Dataset, ids: string[]): number[] {
  if (!ids.length) throw new Error("列を選択してください。");
  if (new Set(ids).size !== ids.length) throw new Error("同じ列を複数回選択できません。");
  return ids.map((id) => {
    const index = data.columns.findIndex((column) => column.id === id);
    if (index === -1) throw new Error("選択した列が見つかりません。列を選び直してください。");
    return index;
  });
}

// Stable generated IDs let a recipe refer to columns created by earlier steps.
function generatedIds(data: Dataset, operation: Operation, count: number): string[] {
  const hash = stableHash(JSON.stringify([data.columns.map((column) => column.id), copyOperation(operation)]));
  const occupied = new Set(data.columns.map((column) => column.id));
  return Array.from({ length: count }, (_, index) => {
    let id = `generated-${hash}-${index + 1}`;
    while (occupied.has(id)) id += "-new";
    occupied.add(id);
    return id;
  });
}

function finish(columns: Column[], rows: Cell[][]): Dataset {
  const result = { columns, rows };
  validateDataset(result);
  return result;
}

/** The first row is the header; blank/duplicate headers receive distinct names. */
export function makeDataset(matrix: Cell[][]): Dataset {
  if (!matrix.length || matrix.every((row) => row.every((cell) => cellText(cell).trim() === ""))) {
    throw new Error("ファイルにデータがありません。");
  }
  const width = matrix.reduce((max, row) => Math.max(max, row.length), 0);
  if (width > MAX_COLUMNS) throw new Error(`列数は${MAX_COLUMNS}列までです。`);
  if (matrix.length - 1 > MAX_ROWS) throw new Error(`データ行は${MAX_ROWS.toLocaleString()}行までです。`);
  const usedNames = new Set<string>();
  const columns = Array.from({ length: width }, (_, index) => {
    const original = cellText(matrix[0][index]).trim() || `列${index + 1}`;
    let name = original;
    let suffix = 2;
    while (usedNames.has(name)) name = `${original} (${suffix++})`;
    usedNames.add(name);
    return { id: `column-${index + 1}-${stableHash(name)}`, name };
  });
  return finish(columns, matrix.slice(1).map((row) => columns.map((_, index) => row[index] ?? "")));
}

/** Split at most count - 1 delimiters, retaining all overflow in the final cell. */
function splitCell(value: Cell, delimiter: string, count: number): string[] {
  const result: string[] = [];
  let rest = cellText(value);
  for (let index = 0; index < count - 1; index++) {
    const whitespace = delimiter === " " ? /[ \u3000]+/.exec(rest) : null;
    const position = delimiter === " " ? (whitespace?.index ?? -1) : rest.indexOf(delimiter);
    if (position === -1) {
      result.push(rest);
      rest = "";
      break;
    }
    result.push(rest.slice(0, position));
    rest = rest.slice(position + (whitespace?.[0].length ?? delimiter.length));
  }
  result.push(rest);
  while (result.length < count) result.push("");
  return result;
}

export function transform(data: Dataset, operation: Operation): Dataset {
  validateDataset(data);
  validateOperation(operation);
  switch (operation.type) {
    case "merge": {
      if (operation.columnIds.length < 2) throw new Error("結合する列を2列以上選択してください。");
      const selected = indicesFor(data, operation.columnIds);
      const keep = data.columns.map((_, index) => index).filter((index) => !operation.removeSource || !selected.includes(index));
      const columns = keep.map((index) => ({ ...data.columns[index] }));
      const insertion = operation.removeSource ? Math.min(...selected) : data.columns.length;
      columns.splice(insertion, 0, { id: generatedIds(data, operation, 1)[0], name: operation.name.trim() });
      const rows = data.rows.map((row) => {
        const result = keep.map((index) => row[index]);
        result.splice(insertion, 0, selected.map((index) => cellText(row[index])).join(operation.separator));
        return result;
      });
      return finish(columns, rows);
    }
    case "split": {
      const [selected] = indicesFor(data, [operation.columnId]);
      if (!operation.delimiter) throw new Error("区切り文字を入力してください。");
      if (!Number.isInteger(operation.count) || operation.count < 2 || operation.count > MAX_COLUMNS) {
        throw new Error(`分割数は2〜${MAX_COLUMNS}の整数を指定してください。`);
      }
      if (operation.names.length !== operation.count) throw new Error("分割数と列名の数を一致させてください。");
      const ids = generatedIds(data, operation, operation.count);
      const columns = data.columns.map((column) => ({ ...column }));
      const insertion = operation.removeSource ? selected : selected + 1;
      columns.splice(insertion, operation.removeSource ? 1 : 0, ...operation.names.map((name, index) => ({ id: ids[index], name: name.trim() })));
      const rows = data.rows.map((row) => {
        const result = [...row];
        result.splice(insertion, operation.removeSource ? 1 : 0, ...splitCell(row[selected], operation.delimiter, operation.count));
        return result;
      });
      return finish(columns, rows);
    }
    case "rename": {
      const [selected] = indicesFor(data, [operation.columnId]);
      return finish(data.columns.map((column, index) => ({ ...column, name: index === selected ? operation.name.trim() : column.name })), data.rows.map((row) => [...row]));
    }
    case "delete": {
      const selected = indicesFor(data, operation.columnIds);
      if (selected.length === data.columns.length) throw new Error("すべての列は削除できません。1列以上残してください。");
      const keep = data.columns.map((_, index) => index).filter((index) => !selected.includes(index));
      return finish(keep.map((index) => ({ ...data.columns[index] })), data.rows.map((row) => keep.map((index) => row[index])));
    }
    case "reorder": {
      const selected = indicesFor(data, operation.columnIds);
      if (selected.length !== data.columns.length) throw new Error("並び替えにはすべての列を1回ずつ指定してください。");
      return finish(selected.map((index) => ({ ...data.columns[index] })), data.rows.map((row) => selected.map((index) => row[index])));
    }
    case "add":
      return finish([...data.columns.map((column) => ({ ...column })), { id: generatedIds(data, operation, 1)[0], name: operation.name.trim() }], data.rows.map((row) => [...row, operation.value]));
    default:
      throw new Error("対応していない操作です。");
  }
}

export function applyRecipe(data: Dataset, operations: Operation[]): Dataset {
  if (!Array.isArray(operations)) throw new Error("レシピの操作一覧が正しくありません。");
  operations.forEach(validateOperation);
  return operations.reduce((result, operation) => transform(result, operation), data);
}

/** Build history labels without repeatedly transforming all data rows. */
export function recipeLabels(data: Dataset, operations: Operation[]): string[] {
  let metadata: Dataset = { columns: data.columns, rows: [] };
  return operations.map((operation) => {
    validateOperation(operation);
    const label = operationLabel(operation, metadata);
    metadata = transform(metadata, operation);
    return label;
  });
}

export function operationLabel(operation: Operation, data: Dataset): string {
  const name = (id: string) => data.columns.find((column) => column.id === id)?.name ?? "削除済みの列";
  switch (operation.type) {
    case "merge": return `${operation.columnIds.map(name).join(" ＋ ")} → ${operation.name}`;
    case "split": return `${name(operation.columnId)}を${operation.count}列に分割`;
    case "rename": return `${name(operation.columnId)} → ${operation.name}`;
    case "delete": return `${operation.columnIds.map(name).join("・")}を削除`;
    case "reorder": return "列の並び順を変更";
    case "add": return `「${operation.name}」を追加`;
  }
}
