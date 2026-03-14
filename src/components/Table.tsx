import { useMemo, useRef, useCallback, useState, useEffect } from "preact/hooks";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type FilterFn,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Cell } from "./Cell";
import { HeaderCell } from "./HeaderCell";

interface ActiveCell {
  row: number;
  col: number;
}

interface TableProps {
  headers: string[];
  data: string[][];
  searchQuery: string;
  crossHighlight: boolean;
  activeCell: ActiveCell | null;
  columnOrder: number[];
  hiddenColumns: number[];
  columnSizing: Record<string, number>;
  frozenCount: number;
  onActiveCellChange: (cell: ActiveCell | null) => void;
  onColumnOrderChange: (sourceIndex: number, targetIndex: number) => void;
  onColumnSizingChange: (sizing: Record<string, number>) => void;
  onUpdateCell: (rowIndex: number, colIndex: number, value: string) => void;
  onUpdateHeader: (colIndex: number, value: string) => void;
  onInsertRow: (afterIndex: number) => void;
  onDeleteRow: (index: number) => void;
  onInsertColumn: (afterIndex: number) => void;
  onDeleteColumn: (index: number) => void;
}

interface RangeFilterValue {
  min?: string;
  max?: string;
}

function inferColumnType(values: string[]): "number" | "date" | "string" {
  const nonEmpty = values.map((value) => value.trim()).filter(Boolean);
  if (nonEmpty.length === 0) return "string";

  const numberCount = nonEmpty.filter((value) => !Number.isNaN(Number(value))).length;
  if (numberCount / nonEmpty.length >= 0.9) return "number";

  const dateCount = nonEmpty.filter((value) => !Number.isNaN(Date.parse(value))).length;
  if (dateCount / nonEmpty.length >= 0.9) return "date";

  return "string";
}

function getFilterVariant(values: string[], dataType: "number" | "date" | "string"): "text" | "select" | "numberRange" | "dateRange" {
  if (dataType === "number") return "numberRange";
  if (dataType === "date") return "dateRange";

  const normalized = values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (normalized.length === 0) return "text";

  const uniqueCount = new Set(normalized).size;
  if (uniqueCount >= 2 && uniqueCount <= 10) {
    return "select";
  }

  return "text";
}

const textFilter: FilterFn<string[]> = (row, columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();
  if (!query) return true;
  const value = String(row.getValue(columnId) ?? "").toLowerCase();
  return value.includes(query);
};

const selectFilter: FilterFn<string[]> = (row, columnId, filterValue) => {
  const selected = String(filterValue ?? "").trim();
  if (!selected) return true;
  const value = String(row.getValue(columnId) ?? "").trim();
  return value === selected;
};

const numberRangeFilter: FilterFn<string[]> = (row, columnId, filterValue) => {
  const range = (filterValue as RangeFilterValue | undefined) ?? {};
  if (!range.min && !range.max) return true;

  const raw = String(row.getValue(columnId) ?? "").trim();
  if (!raw) return false;

  const value = Number(raw);
  if (Number.isNaN(value)) return false;

  const min = range.min != null && range.min !== "" ? Number(range.min) : undefined;
  const max = range.max != null && range.max !== "" ? Number(range.max) : undefined;

  if (min != null && Number.isNaN(min)) return true;
  if (max != null && Number.isNaN(max)) return true;
  if (min != null && value < min) return false;
  if (max != null && value > max) return false;
  return true;
};

const dateRangeFilter: FilterFn<string[]> = (row, columnId, filterValue) => {
  const range = (filterValue as RangeFilterValue | undefined) ?? {};
  if (!range.min && !range.max) return true;

  const raw = String(row.getValue(columnId) ?? "").trim();
  if (!raw) return false;

  const value = Date.parse(raw);
  if (Number.isNaN(value)) return false;

  const min = range.min ? Date.parse(range.min) : undefined;
  const max = range.max ? Date.parse(range.max) : undefined;

  if (min != null && Number.isNaN(min)) return true;
  if (max != null && Number.isNaN(max)) return true;
  if (min != null && value < min) return false;
  if (max != null && value > max) return false;
  return true;
};

export function Table({
  headers,
  data,
  searchQuery,
  crossHighlight,
  activeCell,
  columnOrder,
  hiddenColumns,
  columnSizing,
  frozenCount,
  onActiveCellChange,
  onColumnOrderChange,
  onColumnSizingChange,
  onUpdateCell,
  onUpdateHeader,
  onInsertRow,
  onDeleteRow,
  onInsertColumn,
  onDeleteColumn,
}: TableProps) {
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const searchQueryRef = useRef(searchQuery);
  searchQueryRef.current = searchQuery;

  const onUpdateCellRef = useRef(onUpdateCell);
  onUpdateCellRef.current = onUpdateCell;

  const onUpdateHeaderRef = useRef(onUpdateHeader);
  onUpdateHeaderRef.current = onUpdateHeader;

  const visibleColumnOrder = useMemo(
    () => columnOrder.filter((index) => !hiddenColumns.includes(index)),
    [columnOrder, hiddenColumns],
  );

  const columnTypes = useMemo(
    () => Object.fromEntries(headers.map((_, index) => [index, inferColumnType(data.map((row) => row[index] ?? ""))])),
    [data, headers],
  );

  const columnFilterVariants = useMemo(
    () =>
      Object.fromEntries(
        headers.map((_, index) => {
          const values = data.map((row) => row[index] ?? "");
          return [index, getFilterVariant(values, columnTypes[index])];
        }),
      ),
    [columnTypes, data, headers],
  );

  const columns = useMemo<ColumnDef<string[], string>[]>(
    () => [
      {
        id: "__row_num",
        header: () => <div class="tablite-row-num">#</div>,
        size: 50,
        minSize: 40,
        enableSorting: false,
        enableColumnFilter: false,
        cell: ({ row }) => <div class="tablite-row-num">{row.index + 1}</div>,
      },
      ...visibleColumnOrder.map(
        (sourceIndex): ColumnDef<string[], string> => ({
          id: `col_${sourceIndex}`,
          accessorFn: (row) => row[sourceIndex] ?? "",
          size: columnSizing[String(sourceIndex)] ?? 150,
          minSize: 50,
          filterFn:
            columnFilterVariants[sourceIndex] === "select"
              ? selectFilter
              : columnFilterVariants[sourceIndex] === "numberRange"
                ? numberRangeFilter
                : columnFilterVariants[sourceIndex] === "dateRange"
                  ? dateRangeFilter
                  : textFilter,
          sortingFn: (rowA, rowB, columnId) => {
            const a = String(rowA.getValue(columnId) ?? "");
            const b = String(rowB.getValue(columnId) ?? "");
            const type = columnTypes[sourceIndex];
            if (type === "number") return Number(a) - Number(b);
            if (type === "date") return Date.parse(a) - Date.parse(b);
            return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
          },
          meta: {
            sourceIndex,
            dataType: columnTypes[sourceIndex],
            filterVariant: columnFilterVariants[sourceIndex],
          },
          header: ({ column }) => (
            <HeaderCell
              name={headers[sourceIndex]}
              colIndex={sourceIndex}
              column={column}
              onUpdateHeader={(colIndex, value) => onUpdateHeaderRef.current(colIndex, value)}
              onResize={(colIndex, width) => {
                onColumnSizingChange({
                  ...columnSizing,
                  [String(colIndex)]: width,
                });
              }}
              onMoveColumn={onColumnOrderChange}
            />
          ),
          cell: ({ row }) => (
            <Cell
              value={row.original[sourceIndex] ?? ""}
              rowIndex={row.index}
              colIndex={sourceIndex}
              searchQueryRef={searchQueryRef}
              onUpdate={(rowIndex, colIndex, value) => onUpdateCellRef.current(rowIndex, colIndex, value)}
            />
          ),
        }),
      ),
    ],
    [
      visibleColumnOrder,
      columnSizing,
      headers,
      columnFilterVariants,
      columnTypes,
      onColumnOrderChange,
      onColumnSizingChange,
    ],
  );

  const [, forceUpdate] = useState(0);
  useEffect(() => {
    forceUpdate((value) => value + 1);
  }, [searchQuery]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getSortedRowModel: getSortedRowModel(),
  });

  const { rows } = table.getRowModel();

  const totalWidth = table.getHeaderGroups()[0]?.headers.reduce(
    (sum, header) => sum + header.getSize(),
    0,
  ) ?? 0;

  const frozenOffsets = useMemo(() => {
    let offset = 0;
    const offsets: Record<string, number> = {};
    const headerGroup = table.getHeaderGroups()[0];
    for (const header of headerGroup?.headers ?? []) {
      offsets[header.column.id] = offset;
      offset += header.getSize();
    }
    return offsets;
  }, [table, totalWidth]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 32,
    overscan: 20,
  });

  useEffect(() => {
    if (!activeCell) return;
    rowVirtualizer.scrollToIndex(activeCell.row, { align: "center" });

    const frame = window.requestAnimationFrame(() => {
      const container = tableContainerRef.current;
      if (!container) return;

      const cell = container.querySelector<HTMLElement>(
        `[data-row-index="${activeCell.row}"][data-col-index="${activeCell.col}"]`,
      );
      cell?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeCell, rowVirtualizer]);

  const onContextMenu = useCallback(
    (event: MouseEvent, rowIndex: number, colIndex: number) => {
      event.preventDefault();
      const menu = document.createElement("div");
      menu.className = "tablite-context-menu";
      menu.innerHTML = `
        <div class="tablite-menu-item" data-action="insert-row-above">Insert Row Above</div>
        <div class="tablite-menu-item" data-action="insert-row-below">Insert Row Below</div>
        <div class="tablite-menu-item" data-action="delete-row">Delete Row</div>
        <hr/>
        <div class="tablite-menu-item" data-action="insert-col-left">Insert Column Left</div>
        <div class="tablite-menu-item" data-action="insert-col-right">Insert Column Right</div>
        <div class="tablite-menu-item" data-action="delete-col">Delete Column</div>
      `;
      menu.style.position = "fixed";
      menu.style.left = `${event.clientX}px`;
      menu.style.top = `${event.clientY}px`;
      menu.style.zIndex = "1000";

      const handleClick = (ev: Event) => {
        const target = ev.target as HTMLElement;
        switch (target.dataset.action) {
          case "insert-row-above":
            onInsertRow(rowIndex - 1);
            break;
          case "insert-row-below":
            onInsertRow(rowIndex);
            break;
          case "delete-row":
            onDeleteRow(rowIndex);
            break;
          case "insert-col-left":
            onInsertColumn(colIndex - 1);
            break;
          case "insert-col-right":
            onInsertColumn(colIndex);
            break;
          case "delete-col":
            onDeleteColumn(colIndex);
            break;
        }
        menu.remove();
      };

      menu.addEventListener("click", handleClick);
      document.body.appendChild(menu);

      const removeMenu = () => {
        menu.remove();
        document.removeEventListener("click", removeMenu);
      };
      requestAnimationFrame(() => {
        document.addEventListener("click", removeMenu);
      });
    },
    [onDeleteColumn, onDeleteRow, onInsertColumn, onInsertRow],
  );

  const getPinnedStyles = useCallback(
    (cellId: string, position: number, isHeader: boolean) => {
      const isPinned = position < frozenCount || cellId === "__row_num";
      if (!isPinned) return {};
      return {
        position: "sticky",
        left: `${frozenOffsets[cellId] ?? 0}px`,
        zIndex: isHeader ? 5 : 3,
      } as const;
    },
    [frozenCount, frozenOffsets],
  );

  return (
    <div ref={tableContainerRef} class="tablite-table-container">
      <table class="tablite-table" style={{ display: "grid" }}>
        <thead
          style={{
            display: "grid",
            position: "sticky",
            top: 0,
            zIndex: 4,
          }}
        >
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} style={{ display: "flex", width: `${totalWidth}px`, minWidth: "100%" }}>
              {headerGroup.headers.map((header, position) => {
                const isRowNum = header.column.id === "__row_num";
                const colIdx = isRowNum ? -1 : Number(header.column.id.replace("col_", ""));
                const isColHL = crossHighlight && activeCell != null && colIdx === activeCell.col;
                return (
                  <th
                    key={header.id}
                    class={`tablite-th${isColHL ? " tablite-col-highlight" : ""}${position < frozenCount + 1 ? " tablite-frozen-cell" : ""}`}
                    style={{
                      display: "flex",
                      width: header.getSize(),
                      minWidth: header.column.columnDef.minSize,
                      flexShrink: 0,
                      ...getPinnedStyles(header.column.id, position, true),
                    }}
                  >
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody
          style={{
            display: "grid",
            height: `${rowVirtualizer.getTotalSize()}px`,
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            return (
              <tr
                key={row.id}
                data-index={virtualRow.index}
                data-row-index={virtualRow.index}
                ref={(element) => {
                  if (element) rowVirtualizer.measureElement(element);
                }}
                style={{
                  display: "flex",
                  position: "absolute",
                  transform: `translateY(${virtualRow.start}px)`,
                  width: `${totalWidth}px`,
                  minWidth: "100%",
                }}
              >
                {row.getVisibleCells().map((cell, position) => {
                  const isRowNum = cell.column.id === "__row_num";
                  const colIdx = isRowNum ? -1 : Number(cell.column.id.replace("col_", ""));
                  const isActive = !isRowNum && activeCell?.row === virtualRow.index && activeCell?.col === colIdx;
                  const isRowHL = crossHighlight && !isRowNum && activeCell != null && activeCell.row === virtualRow.index;
                  const isColHL = crossHighlight && !isRowNum && activeCell != null && activeCell.col === colIdx;

                  let className = "tablite-td";
                  if (isActive) className += " tablite-td-active";
                  else if (isRowHL || isColHL) className += " tablite-td-cross";
                  if (position < frozenCount + 1) className += " tablite-frozen-cell";

                  return (
                    <td
                      key={cell.id}
                      data-row-index={virtualRow.index}
                      data-col-index={colIdx >= 0 ? colIdx : undefined}
                      class={className}
                      style={{
                        display: "flex",
                        width: cell.column.getSize(),
                        minWidth: cell.column.columnDef.minSize,
                        flexShrink: 0,
                        ...getPinnedStyles(cell.column.id, position, false),
                      }}
                      onClick={() => {
                        if (!isRowNum) onActiveCellChange({ row: virtualRow.index, col: colIdx });
                      }}
                      onContextMenu={(event) => onContextMenu(event as unknown as MouseEvent, virtualRow.index, colIdx)}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
