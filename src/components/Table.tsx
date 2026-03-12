import { useMemo, useRef, useCallback, useState } from "preact/hooks";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Cell } from "./Cell";
import { HeaderCell } from "./HeaderCell";

interface TableProps {
  headers: string[];
  data: string[][];
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
  onUpdateCell,
  onUpdateHeader,
  onInsertRow,
  onDeleteRow,
  onInsertColumn,
  onDeleteColumn,
}: TableProps) {
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [activeCell, setActiveCell] = useState<[number, number] | null>(null);
  const [columnSizing, setColumnSizing] = useState<Record<string, number>>({});

  const columns = useMemo<ColumnDef<string[], string>[]>(
    () => [
      // Row number column
      {
        id: "__row_num",
        header: "#",
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
          size: columnSizing[`col_${i}`] ?? 150,
          minSize: 50,
          header: ({ column }) => (
            <HeaderCell
              name={h}
              colIndex={i}
              column={column}
              onUpdateHeader={onUpdateHeader}
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
              isActive={
                activeCell !== null &&
                activeCell[0] === row.index &&
                activeCell[1] === i
              }
              onActivate={(r, c) => setActiveCell([r, c])}
              onUpdate={onUpdateCell}
            />
          ),
        }),
      ),
    ],
    [headers, onUpdateCell, onUpdateHeader, activeCell, columnSizing],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const { rows } = table.getRowModel();

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
      menu.style.left = `${e.clientX}px`;
      menu.style.top = `${e.clientY}px`;
      menu.style.zIndex = "1000";

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
      style={{ overflow: "auto", position: "relative", height: "100%" }}
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
              style={{ display: "flex", width: "100%" }}
            >
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  class="tablite-th"
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
              ))}
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
                  width: "100%",
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    class="tablite-td"
                    style={{
                      display: "flex",
                      width: cell.column.getSize(),
                      minWidth: cell.column.columnDef.minSize,
                      flexShrink: 0,
                    }}
                    onContextMenu={(e) =>
                      onContextMenu(
                        e as any,
                        virtualRow.index,
                        Number(cell.column.id.replace("col_", "")),
                      )
                    }
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
