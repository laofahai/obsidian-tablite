import { useMemo, useCallback, useRef, useState } from "preact/hooks";
import { detectDelimiter, type Delimiter } from "../parser/detect";
import { parseCSV, serializeCSV } from "../parser/csv-engine";
import { useTableData, type TableState } from "../hooks/useTableData";
import { Toolbar } from "./Toolbar";
import { Table } from "./Table";

interface AppProps {
  initialData: string;
  filePath: string;
  onDataChange: (data: string) => void;
}

export function App({ initialData, filePath, onDataChange }: AppProps) {
  const [delimiter, setDelimiter] = useState<Delimiter>(() => {
    if (!initialData || initialData.trim().length === 0) return ",";
    return detectDelimiter(initialData);
  });
  const [encoding, setEncoding] = useState("utf-8");
  const [searchQuery, setSearchQuery] = useState("");

  // Parse initial data
  const initialState = useMemo<TableState>(() => {
    if (!initialData || initialData.trim().length === 0) {
      return { headers: ["Column 1"], data: [[""]] };
    }
    const { headers, data } = parseCSV(initialData, delimiter);
    return { headers, data };
  }, []);

  const handleDataChange = useCallback(
    (headers: string[], data: string[][]) => {
      const csv = serializeCSV(headers, data, delimiter);
      onDataChange(csv);
    },
    [delimiter, onDataChange],
  );

  const {
    headers,
    data,
    updateCell,
    updateHeader,
    insertRow,
    deleteRow,
    insertColumn,
    deleteColumn,
    undo,
    redo,
    reset,
  } = useTableData(initialState, handleDataChange);

  // Re-parse when delimiter changes manually
  const handleDelimiterChange = useCallback(
    (newDelimiter: Delimiter) => {
      setDelimiter(newDelimiter);
      const { headers: h, data: d } = parseCSV(initialData, newDelimiter);
      reset({ headers: h, data: d });
    },
    [initialData, reset],
  );

  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      class="tablite-container"
      tabIndex={0}
    >
      <Toolbar
        encoding={encoding}
        delimiter={delimiter}
        rowCount={data.length}
        colCount={headers.length}
        onDelimiterChange={handleDelimiterChange}
        onEncodingChange={setEncoding}
        onSearch={setSearchQuery}
        onUndo={undo}
        onRedo={redo}
      />
      <Table
        headers={headers}
        data={data}
        onUpdateCell={updateCell}
        onUpdateHeader={updateHeader}
        onInsertRow={insertRow}
        onDeleteRow={deleteRow}
        onInsertColumn={insertColumn}
        onDeleteColumn={deleteColumn}
      />
    </div>
  );
}
