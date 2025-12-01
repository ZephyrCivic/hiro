export type CsvRecord = Record<string, string>;

// シンプルな CSV パーサ（引用符ありのカンマ区切りに対応）
export function parseCsv(text: string): CsvRecord[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return [];
  const header = splitCsvLine(lines[0]);
  return lines
    .slice(1)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const cols = splitCsvLine(line);
      const obj: CsvRecord = {};
      header.forEach((h, i) => {
        obj[h] = cols[i] ?? "";
      });
      return obj;
    });
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

