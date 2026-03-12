import { useState, useCallback } from "preact/hooks";
import type { Delimiter } from "../parser/detect";

interface ToolbarProps {
  encoding: string;
  delimiter: string;
  rowCount: number;
  colCount: number;
  onDelimiterChange: (d: Delimiter) => void;
  onEncodingChange: (e: string) => void;
  onSearch: (query: string) => void;
  onUndo: () => void;
  onRedo: () => void;
}

const DELIMITER_LABELS: Record<string, string> = {
  ",": "Comma (,)",
  ";": "Semicolon (;)",
  "\t": "Tab",
  "|": "Pipe (|)",
};

export function Toolbar({
  encoding,
  delimiter,
  rowCount,
  colCount,
  onDelimiterChange,
  onEncodingChange,
  onSearch,
  onUndo,
  onRedo,
}: ToolbarProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = useCallback(
    (e: Event) => {
      const value = (e.target as HTMLInputElement).value;
      setSearchQuery(value);
      onSearch(value);
    },
    [onSearch],
  );

  return (
    <div class="tablite-toolbar">
      <div class="tablite-toolbar-left">
        <button class="tablite-btn" onClick={onUndo} title="Undo (Ctrl+Z)">
          ↶
        </button>
        <button class="tablite-btn" onClick={onRedo} title="Redo (Ctrl+Shift+Z)">
          ↷
        </button>

        <span class="tablite-separator" />

        <select
          class="tablite-select"
          value={delimiter}
          onChange={(e) =>
            onDelimiterChange((e.target as HTMLSelectElement).value as Delimiter)
          }
        >
          {Object.entries(DELIMITER_LABELS).map(([val, label]) => (
            <option key={val} value={val}>
              {label}
            </option>
          ))}
        </select>

        <select
          class="tablite-select"
          value={encoding}
          onChange={(e) =>
            onEncodingChange((e.target as HTMLSelectElement).value)
          }
        >
          <option value="utf-8">UTF-8</option>
          <option value="gbk">GBK</option>
          <option value="windows-1252">Windows-1252</option>
          <option value="shift_jis">Shift-JIS</option>
        </select>

        <span class="tablite-info">
          {rowCount} rows × {colCount} cols
        </span>
      </div>

      <div class="tablite-toolbar-right">
        <input
          class="tablite-search"
          type="text"
          placeholder="Search..."
          value={searchQuery}
          onInput={handleSearch}
        />
      </div>
    </div>
  );
}
