import { useMemo, useCallback, useRef, useState, useEffect } from "preact/hooks";
import { detectDelimiter, type Delimiter } from "../parser/detect";
import { parseCSV, serializeCSV } from "../parser/csv-engine";
import { useTableData, type TableState } from "../hooks/useTableData";
import { Toolbar } from "./Toolbar";
import { Table } from "./Table";
import {
  normalizeColumnConfig,
  remapColumnConfigForDelete,
  remapColumnConfigForInsert,
  type ColumnConfig,
} from "../types";

interface AppProps {
  initialData: string;
  filePath: string;
  initialColumnConfig: ColumnConfig;
  onColumnConfigChange: (config: ColumnConfig, columnCount: number) => void | Promise<void>;
  onDataChange: (data: string) => void;
}

interface ActiveCell {
  row: number;
  col: number;
}

function ensureEditableState(state: TableState): TableState {
  const headerCount = Math.max(1, state.headers.length);
  const headers =
    state.headers.length > 0
      ? state.headers
      : Array.from({ length: headerCount }, (_, index) => `Column ${index + 1}`);

  const data =
    state.data.length > 0
      ? state.data.map((row) => {
          if (row.length < headers.length) {
            return [...row, ...new Array(headers.length - row.length).fill("")];
          }
          return row.slice(0, headers.length);
        })
      : [new Array(headers.length).fill("")];

  return { headers, data };
}

export function App({
  initialData,
  filePath,
  initialColumnConfig,
  onColumnConfigChange,
  onDataChange,
}: AppProps) {
  const [delimiter, setDelimiter] = useState<Delimiter>(() => {
    if (!initialData || initialData.trim().length === 0) return ",";
    return detectDelimiter(initialData);
  });
  const [encoding, setEncoding] = useState("utf-8");
  const [searchQuery, setSearchQuery] = useState("");
  const [crossHighlight, setCrossHighlight] = useState(true);
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
  const [hasHeader, setHasHeader] = useState<boolean>(() => {
    if (!initialData || initialData.trim().length === 0) return true;
    const { hasHeader: detected } = parseCSV(initialData, delimiter);
    return detected;
  });

  const initialState = useMemo<TableState>(() => {
    if (!initialData || initialData.trim().length === 0) {
      return { headers: ["Column 1"], data: [[""]] };
    }
    const { headers, data } = parseCSV(initialData, delimiter, hasHeader);
    return ensureEditableState({ headers, data });
  }, []);

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
  } = useTableData(initialState, useCallback(
    (nextHeaders: string[], nextData: string[][]) => {
      const csv = serializeCSV(nextHeaders, nextData, delimiter, hasHeader);
      onDataChange(csv);
    },
    [delimiter, hasHeader, onDataChange],
  ));

  const [columnConfig, setColumnConfig] = useState<ColumnConfig>(() =>
    normalizeColumnConfig(initialColumnConfig, initialState.headers.length),
  );
  const searchInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setColumnConfig((prev) => normalizeColumnConfig(prev, headers.length));
  }, [headers.length]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void onColumnConfigChange(columnConfig, headers.length);
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [columnConfig, headers.length, onColumnConfigChange]);

  const visibleColumns = useMemo(
    () => columnConfig.order.filter((index) => !columnConfig.hidden.includes(index)),
    [columnConfig.hidden, columnConfig.order],
  );

  const searchMatches = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [] as ActiveCell[];

    const matches: ActiveCell[] = [];
    for (let rowIndex = 0; rowIndex < data.length; rowIndex += 1) {
      for (const colIndex of visibleColumns) {
        const value = data[rowIndex]?.[colIndex] ?? "";
        if (value.toLowerCase().includes(query)) {
          matches.push({ row: rowIndex, col: colIndex });
        }
      }
    }
    return matches;
  }, [data, searchQuery, visibleColumns]);

  useEffect(() => {
    if (searchMatches.length === 0) return;
    const currentIndex = searchMatches.findIndex(
      (match) => match.row === activeCell?.row && match.col === activeCell?.col,
    );
    if (currentIndex >= 0) return;
    setActiveCell(searchMatches[0]);
  }, [activeCell?.col, activeCell?.row, searchMatches]);

  const handleDelimiterChange = useCallback(
    (newDelimiter: Delimiter) => {
      setDelimiter(newDelimiter);
      const { headers: nextHeaders, data: nextData } = parseCSV(initialData, newDelimiter, hasHeader);
      reset(ensureEditableState({ headers: nextHeaders, data: nextData }));
      setColumnConfig((prev) => normalizeColumnConfig(prev, nextHeaders.length));
    },
    [hasHeader, initialData, reset],
  );

  const handleHasHeaderChange = useCallback(
    (nextHasHeader: boolean) => {
      setHasHeader(nextHasHeader);
      const { headers: nextHeaders, data: nextData } = parseCSV(initialData, delimiter, nextHasHeader);
      reset(ensureEditableState({ headers: nextHeaders, data: nextData }));
      setColumnConfig((prev) => normalizeColumnConfig(prev, nextHeaders.length));
    },
    [delimiter, initialData, reset],
  );

  const handleInsertColumn = useCallback(
    (afterIndex: number) => {
      const insertIndex = afterIndex + 1;
      setColumnConfig((prev) => remapColumnConfigForInsert(prev, insertIndex, headers.length + 1));
      setActiveCell((prev) => {
        if (!prev || prev.col < insertIndex) return prev;
        return { ...prev, col: prev.col + 1 };
      });
      insertColumn(afterIndex);
    },
    [headers.length, insertColumn],
  );

  const handleDeleteColumn = useCallback(
    (index: number) => {
      setColumnConfig((prev) => remapColumnConfigForDelete(prev, index, Math.max(1, headers.length - 1)));
      setActiveCell((prev) => {
        if (!prev) return prev;
        if (prev.col === index) return null;
        if (prev.col < index) return prev;
        return { ...prev, col: prev.col - 1 };
      });
      deleteColumn(index);
    },
    [deleteColumn, headers.length],
  );

  const handleDeleteRow = useCallback(
    (index: number) => {
      setActiveCell((prev) => {
        if (!prev) return prev;
        if (data.length <= 1) return { row: 0, col: prev.col };
        if (prev.row === index) {
          return { row: Math.max(0, Math.min(index, data.length - 2)), col: prev.col };
        }
        if (prev.row > index) {
          return { row: prev.row - 1, col: prev.col };
        }
        return prev;
      });
      deleteRow(index);
    },
    [data.length, deleteRow],
  );

  const toggleColumnVisibility = useCallback((colIndex: number) => {
    setColumnConfig((prev) => {
      const isHidden = prev.hidden.includes(colIndex);
      const hidden = isHidden
        ? prev.hidden.filter((index) => index !== colIndex)
        : [...prev.hidden, colIndex];
      return normalizeColumnConfig({ ...prev, hidden }, headers.length);
    });
  }, [headers.length]);

  const showAllColumns = useCallback(() => {
    setColumnConfig((prev) => normalizeColumnConfig({ ...prev, hidden: [] }, headers.length));
  }, [headers.length]);

  const moveColumn = useCallback((sourceIndex: number, targetIndex: number) => {
    setColumnConfig((prev) => {
      if (sourceIndex === targetIndex) return prev;
      const nextOrder = [...prev.order];
      const from = nextOrder.indexOf(sourceIndex);
      const to = nextOrder.indexOf(targetIndex);
      if (from < 0 || to < 0) return prev;
      nextOrder.splice(from, 1);
      nextOrder.splice(to, 0, sourceIndex);
      return normalizeColumnConfig({ ...prev, order: nextOrder }, headers.length);
    });
  }, [headers.length]);

  const updateColumnSizing = useCallback((sizing: Record<string, number>) => {
    setColumnConfig((prev) => normalizeColumnConfig({ ...prev, sizing }, headers.length));
  }, [headers.length]);

  const updateFrozenCount = useCallback((frozenCount: number) => {
    setColumnConfig((prev) => normalizeColumnConfig({ ...prev, frozenCount }, headers.length));
  }, [headers.length]);

  const navigateSearch = useCallback((direction: 1 | -1) => {
    if (searchMatches.length === 0) return;
    const currentIndex = searchMatches.findIndex(
      (match) => match.row === activeCell?.row && match.col === activeCell?.col,
    );
    const nextIndex =
      currentIndex === -1
        ? direction > 0
          ? 0
          : searchMatches.length - 1
        : (currentIndex + direction + searchMatches.length) % searchMatches.length;
    setActiveCell(searchMatches[nextIndex]);
  }, [activeCell?.col, activeCell?.row, searchMatches]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTextInput =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT";

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (event.key === "F3") {
        event.preventDefault();
        navigateSearch(event.shiftKey ? -1 : 1);
        return;
      }

      const isInsideTablite = !!target?.closest(".tablite-container");
      if (isTextInput || !isInsideTablite) return;

      if (!activeCell) return;

      switch (event.key) {
        case "ArrowUp":
          event.preventDefault();
          if (activeCell.row > 0) setActiveCell({ row: activeCell.row - 1, col: activeCell.col });
          break;
        case "ArrowDown":
          event.preventDefault();
          if (activeCell.row < data.length - 1) setActiveCell({ row: activeCell.row + 1, col: activeCell.col });
          break;
        case "ArrowLeft":
          event.preventDefault();
          if (activeCell.col > 0) setActiveCell({ row: activeCell.row, col: activeCell.col - 1 });
          break;
        case "ArrowRight":
          event.preventDefault();
          if (activeCell.col < headers.length - 1) setActiveCell({ row: activeCell.row, col: activeCell.col + 1 });
          break;
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [activeCell, data.length, headers.length, navigateSearch]);

  const activeMatchIndex = useMemo(
    () => searchMatches.findIndex((match) => match.row === activeCell?.row && match.col === activeCell?.col),
    [activeCell?.col, activeCell?.row, searchMatches],
  );

  return (
    <div
      ref={containerRef}
      class="tablite-container"
      data-file-path={filePath}
      tabIndex={0}
    >
      <Toolbar
        encoding={encoding}
        delimiter={delimiter}
        hasHeader={hasHeader}
        crossHighlight={crossHighlight}
        rowCount={data.length}
        colCount={headers.length}
        headers={headers}
        columnOrder={columnConfig.order}
        hiddenColumns={columnConfig.hidden}
        frozenCount={columnConfig.frozenCount}
        searchQuery={searchQuery}
        searchMatchIndex={activeMatchIndex >= 0 ? activeMatchIndex + 1 : 0}
        searchMatchCount={searchMatches.length}
        searchInputRef={searchInputRef}
        onDelimiterChange={handleDelimiterChange}
        onEncodingChange={setEncoding}
        onHasHeaderChange={handleHasHeaderChange}
        onCrossHighlightChange={setCrossHighlight}
        onSearch={setSearchQuery}
        onSearchNext={() => navigateSearch(1)}
        onSearchPrev={() => navigateSearch(-1)}
        onToggleColumnVisibility={toggleColumnVisibility}
        onShowAllColumns={showAllColumns}
        onFrozenCountChange={updateFrozenCount}
        onUndo={undo}
        onRedo={redo}
      />
      <Table
        headers={headers}
        data={data}
        searchQuery={searchQuery}
        crossHighlight={crossHighlight}
        activeCell={activeCell}
        columnOrder={columnConfig.order}
        hiddenColumns={columnConfig.hidden}
        columnSizing={columnConfig.sizing}
        frozenCount={columnConfig.frozenCount}
        onActiveCellChange={setActiveCell}
        onColumnOrderChange={moveColumn}
        onColumnSizingChange={updateColumnSizing}
        onUpdateCell={updateCell}
        onUpdateHeader={updateHeader}
        onInsertRow={insertRow}
        onDeleteRow={handleDeleteRow}
        onInsertColumn={handleInsertColumn}
        onDeleteColumn={handleDeleteColumn}
      />
    </div>
  );
}
