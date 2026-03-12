import Papa from "papaparse";
import type { Delimiter } from "./detect";

export interface ParseResult {
  data: string[][];
  headers: string[];
}

export function parseCSV(text: string, delimiter: string): ParseResult {
  const result = Papa.parse<string[]>(text, {
    delimiter,
    header: false,
    skipEmptyLines: "greedy",
  });

  const data = result.data;
  if (data.length === 0) {
    return { headers: [], data: [] };
  }

  const headers = data[0];
  const rows = data.slice(1);

  const colCount = headers.length;
  const normalized = rows.map((row) => {
    if (row.length < colCount) {
      return [...row, ...new Array(colCount - row.length).fill("")];
    }
    return row.slice(0, colCount);
  });

  return { headers, data: normalized };
}

export function serializeCSV(
  headers: string[],
  data: string[][],
  delimiter: string,
): string {
  const allRows = [headers, ...data];
  return Papa.unparse(allRows, {
    delimiter,
    newline: "\n",
  });
}
