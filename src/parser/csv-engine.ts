import Papa from "papaparse";
import type { Delimiter } from "./detect";

export interface ParseResult {
  data: string[][];
  headers: string[];
  hasHeader: boolean;
}

function generateColumnLabels(count: number): string[] {
  const labels: string[] = [];
  for (let i = 0; i < count; i++) {
    let label = "";
    let n = i;
    do {
      label = String.fromCharCode(65 + (n % 26)) + label;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    labels.push(label);
  }
  return labels;
}

/**
 * Heuristic: first row is likely a header if it looks distinct from the data rows.
 * - All first-row values are non-numeric while most data rows contain numbers
 * - First row has no duplicate values (headers are typically unique)
 * - First row values look like labels (no pure numbers)
 */
function detectHasHeader(rows: string[][]): boolean {
  if (rows.length < 2) return true; // only one row, treat as header by default

  const firstRow = rows[0];

  // Check if first row has duplicate values — headers rarely do
  const uniqueFirst = new Set(firstRow.map((v) => v.trim().toLowerCase()));
  if (uniqueFirst.size < firstRow.length) return false;

  // Check if first row is all non-numeric while data rows have numbers
  const isNumeric = (v: string) => v.trim() !== "" && !isNaN(Number(v.trim()));
  const firstRowNumCount = firstRow.filter(isNumeric).length;

  // Sample up to 10 data rows
  const sampleRows = rows.slice(1, 11);
  const dataNumCounts = sampleRows.map(
    (row) => row.filter(isNumeric).length,
  );
  const avgDataNums =
    dataNumCounts.reduce((a, b) => a + b, 0) / dataNumCounts.length;

  // If data rows have numbers but first row doesn't, likely a header
  if (firstRowNumCount === 0 && avgDataNums > 0) return true;

  // If first row has fewer numbers than data rows on average, likely a header
  if (firstRowNumCount < avgDataNums * 0.5) return true;

  // If first row pattern matches data rows, probably not a header
  if (firstRowNumCount > 0 && Math.abs(firstRowNumCount - avgDataNums) < 1) return false;

  // Default: treat first row as header
  return true;
}

export function parseCSV(
  text: string,
  delimiter: string,
  hasHeader?: boolean,
): ParseResult {
  const result = Papa.parse<string[]>(text, {
    delimiter,
    header: false,
    skipEmptyLines: "greedy",
  });

  const rawData = result.data;
  if (rawData.length === 0) {
    return { headers: [], data: [], hasHeader: true };
  }

  const detectedHasHeader = hasHeader ?? detectHasHeader(rawData);

  if (detectedHasHeader) {
    const headers = rawData[0];
    const rows = rawData.slice(1);
    const colCount = headers.length;
    const normalized = rows.map((row) => {
      if (row.length < colCount) {
        return [...row, ...new Array(colCount - row.length).fill("")];
      }
      return row.slice(0, colCount);
    });
    return { headers, data: normalized, hasHeader: true };
  } else {
    const colCount = Math.max(...rawData.map((r) => r.length));
    const headers = generateColumnLabels(colCount);
    const normalized = rawData.map((row) => {
      if (row.length < colCount) {
        return [...row, ...new Array(colCount - row.length).fill("")];
      }
      return row.slice(0, colCount);
    });
    return { headers, data: normalized, hasHeader: false };
  }
}

export function serializeCSV(
  headers: string[],
  data: string[][],
  delimiter: string,
  hasHeader: boolean = true,
): string {
  const allRows = hasHeader ? [headers, ...data] : data;
  return Papa.unparse(allRows, {
    delimiter,
    newline: "\n",
  });
}
