import { useMemo, useRef, useCallback, useState, useEffect } from "preact/hooks";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
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
  onUpdateCell: (rowIndex: number, colIndex: number, value: string) => void;
  onUpdateHeader: (colIndex: number, value: string) => void;
  onInsertRow: (afterIndex: number) => void;
  onDeleteRow: (index: number) => void;
  onInsertColumn: (afterIndex: number) => void;
  onDeleteColumn: (index: number) => void;
}

export function Table({
  headers,
  data,
  searchQuery,
  crossHighlight,
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
  const [columnSizing, setColumnSizing] = useState<Record<string, number>>({});
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);

  // Use refs for values that Cell needs but shouldn't cause column rebuild
  const searchQueryRef = useRef(searchQuery);
  searchQueryRef.current = searchQuery;

  const onUpdateCellRef = useRef(onUpdateCell);
  onUpdateCellRef.current = onUpdateCell;

  const onUpdateHeaderRef = useRef(onUpdateHeader);
  onUpdateHeaderRef.current = onUpdateHeader;

  const columnSizingRef = useRef(columnSizing);
  columnSizingRef.current = columnSizing;

  // Columns only depend on headers (structural changes)
  const columns = useMemo<ColumnDef<string[], string>[]>(
    () => [
      {
        id: "__row_num",
        header: () => <div class="tablite-row-num">#</div>,
        size: 50,
        minSize: 40,
        enableSorting: false,
        cell: ({ row }) => (
          <div class="tablite-row-num">{row.index + 1}</div>
        ),
      },
      ...headers.map(
        (h, i): ColumnDef<string[], string> => ({
          id: `col_${i}`,
          accessorFn: (row) => row[i] ?? "",
          size: columnSizingRef.current[`col_${i}`] ?? 150,
          minSize: 50,
          header: ({ column }) => (
            <HeaderCell
              name={h}
              colIndex={i}
              column={column}
              onUpdateHeader={(ci, v) => onUpdateHeaderRef.current(ci, v)}
              onResize={(colIdx, width) => {
                setColumnSizing((prev) => ({
                  ...prev,
                  [`col_${colIdx}`]: width,
                }));
              }}
            />
          ),
          cell: ({ row }) => (
            <Cell
              value={row.original[i] ?? ""}
              rowIndex={row.index}
              colIndex={i}
              searchQueryRef={searchQueryRef}
              onUpdate={(r, c, v) => onUpdateCellRef.current(r, c, v)}
            />
          ),
        }),
      ),
    ],
    [headers],
  );

  // Force re-render when searchQuery changes so Cell picks up new ref value
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    forceUpdate((n) => n + 1);
  }, [searchQuery]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const { rows } = table.getRowModel();

  const totalWidth = table.getHeaderGroups()[0]?.headers.reduce(
    (sum, header) => sum + header.getSize(), 0
  ) ?? 0;

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 32,
    overscan: 20,
  });

  const onContextMenu = useCallback(
    (e: MouseEvent, rowIndex: number, colIndex: number) => {
      e.preventDefault();
      const menu = document.createElement("div");
      menu.className = "tablite-context-menu";

      const items = [
        { action: "insert-row-above", label: "Insert Row Above" },
        { action: "insert-row-below", label: "Insert Row Below" },
        { action: "delete-row", label: "Delete Row" },
        { action: "separator", label: "" },
        { action: "insert-col-left", label: "Insert Column Left" },
        { action: "insert-col-right", label: "Insert Column Right" },
        { action: "delete-col", label: "Delete Column" },
      ];
      for (const item of items) {
        if (item.action === "separator") {
          menu.appendChild(document.createElement("hr"));
        } else {
          const div = document.createElement("div");
          div.className = "tablite-menu-item";
          div.dataset.action = item.action;
          div.textContent = item.label;
          menu.appendChild(div);
        }
      }
      menu.setCssProps({
        "--tablite-menu-left": `${e.clientX}px`,
        "--tablite-menu-top": `${e.clientY}px`,
      });

      const handleClick = (ev: Event) => {
        const target = ev.target as HTMLElement;
        const action = target.dataset.action;
        switch (action) {
          case "insert-row-above": onInsertRow(rowIndex - 1); break;
          case "insert-row-below": onInsertRow(rowIndex); break;
          case "delete-row": onDeleteRow(rowIndex); break;
          case "insert-col-left": onInsertColumn(colIndex - 1); break;
          case "insert-col-right": onInsertColumn(colIndex); break;
          case "delete-col": onDeleteColumn(colIndex); break;
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
    [onInsertRow, onDeleteRow, onInsertColumn, onDeleteColumn],
  );

  return (
    <div
      ref={tableContainerRef}
      class="tablite-table-container"
    >
      <table class="tablite-table" style={{ display: "grid" }}>
        <thead
          style={{
            display: "grid",
            position: "sticky",
            top: 0,
            zIndex: 2,
          }}
        >
          {table.getHeaderGroups().map((headerGroup) => (
            <tr
              key={headerGroup.id}
              style={{ display: "flex", width: `${totalWidth}px`, minWidth: "100%" }}
            >
              {headerGroup.headers.map((header) => {
                const colIdx = Number(header.column.id.replace("col_", ""));
                const isColHL = crossHighlight && activeCell != null && colIdx === activeCell.col;
                return (
                <th
                  key={header.id}
                  class={`tablite-th${isColHL ? " tablite-col-highlight" : ""}`}
                  style={{
                    display: "flex",
                    width: header.getSize(),
                    minWidth: header.column.columnDef.minSize,
                    flexShrink: 0,
                  }}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
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
                ref={(el) => { if (el) rowVirtualizer.measureElement(el); }}
                style={{
                  display: "flex",
                  position: "absolute",
                  transform: `translateY(${virtualRow.start}px)`,
                  width: `${totalWidth}px`,
                  minWidth: "100%",
                }}
              >
                {row.getVisibleCells().map((cell) => {
                  const colIdx = Number(cell.column.id.replace("col_", ""));
                  const isRowNum = cell.column.id === "__row_num";
                  const isActive = !isRowNum && activeCell?.row === virtualRow.index && activeCell?.col === colIdx;
                  const isRowHL = crossHighlight && !isRowNum && activeCell != null && activeCell.row === virtualRow.index;
                  const isColHL = crossHighlight && !isRowNum && activeCell != null && activeCell.col === colIdx;

                  let cls = "tablite-td";
                  if (isActive) cls += " tablite-td-active";
                  else if (isRowHL || isColHL) cls += " tablite-td-cross";

                  return (
                  <td
                    key={cell.id}
                    class={cls}
                    style={{
                      display: "flex",
                      width: cell.column.getSize(),
                      minWidth: cell.column.columnDef.minSize,
                      flexShrink: 0,
                    }}
                    onClick={() => {
                      if (!isRowNum) setActiveCell({ row: virtualRow.index, col: colIdx });
                    }}
                    onContextMenu={(e) =>
                      onContextMenu(
                        e.nativeEvent as MouseEvent,
                        virtualRow.index,
                        colIdx,
                      )
                    }
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
