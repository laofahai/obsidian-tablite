import { useState, useRef, useCallback, useEffect } from "preact/hooks";
import type { Column } from "@tanstack/react-table";

interface HeaderCellProps {
  name: string;
  colIndex: number;
  column: Column<string[], unknown>;
  onUpdateHeader: (colIndex: number, value: string) => void;
  onResize: (colIndex: number, width: number) => void;
  onMoveColumn: (sourceIndex: number, targetIndex: number) => void;
}

export function HeaderCell({
  name,
  colIndex,
  column,
  onUpdateHeader,
  onResize,
  onMoveColumn,
}: HeaderCellProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);
  const resizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const commitEdit = useCallback(() => {
    setEditing(false);
    if (editValue !== name) onUpdateHeader(colIndex, editValue);
  }, [colIndex, editValue, name, onUpdateHeader]);

  const sortDir = column.getIsSorted();
  const sortIndicator = sortDir === "asc" ? " ▲" : sortDir === "desc" ? " ▼" : "";
  const meta = (column.columnDef.meta as {
    dataType?: string;
    filterVariant?: "text" | "select" | "numberRange" | "dateRange";
  } | undefined) ?? { dataType: "string", filterVariant: "text" };
  const dataType = String(meta.dataType ?? "string");

  const onMouseDown = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      resizing.current = true;
      startX.current = event.clientX;
      startWidth.current = column.getSize();

      const onMouseMove = (nextEvent: MouseEvent) => {
        if (!resizing.current) return;
        const diff = nextEvent.clientX - startX.current;
        onResize(colIndex, Math.max(50, startWidth.current + diff));
      };

      const onMouseUp = () => {
        resizing.current = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [colIndex, column, onResize],
  );

  if (editing) {
    return (
      <input
        ref={inputRef}
        class="tablite-header-input"
        value={editValue}
        onInput={(event) => setEditValue((event.target as HTMLInputElement).value)}
        onBlur={commitEdit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commitEdit();
          if (event.key === "Escape") {
            setEditing(false);
            setEditValue(name);
          }
        }}
      />
    );
  }

  const rawFilterValue = column.getFilterValue();
  const filterValue = typeof rawFilterValue === "string" ? rawFilterValue : "";
  const rangeValue = (typeof rawFilterValue === "object" && rawFilterValue != null
    ? rawFilterValue
    : {}) as { min?: string; max?: string };
  const facetedValues = Array.from(column.getFacetedUniqueValues().keys())
    .map((value) => String(value))
    .filter((value) => value.trim().length > 0)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

  return (
    <div
      class="tablite-header-cell"
      draggable
      onDragStart={(event) => {
        event.dataTransfer?.setData("text/tablite-column", String(colIndex));
        event.dataTransfer!.effectAllowed = "move";
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer!.dropEffect = "move";
      }}
      onDrop={(event) => {
        event.preventDefault();
        const sourceIndex = Number(event.dataTransfer?.getData("text/tablite-column"));
        if (!Number.isNaN(sourceIndex)) onMoveColumn(sourceIndex, colIndex);
      }}
    >
      <div class="tablite-header-top">
        <span
          class="tablite-header-name"
          onClick={() => column.toggleSorting(undefined, true)}
          onDblClick={() => {
            setEditValue(name);
            setEditing(true);
          }}
        >
          {name}
          {sortIndicator}
        </span>
        <span class="tablite-header-type">{dataType}</span>
        <div class="tablite-resize-handle" onMouseDown={onMouseDown} />
      </div>
      {meta.filterVariant === "select" ? (
        <select
          class="tablite-column-filter tablite-column-filter-select"
          value={filterValue}
          onInput={(event) => {
            column.setFilterValue((event.target as HTMLSelectElement).value || undefined);
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <option value="">All</option>
          {facetedValues.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      ) : meta.filterVariant === "numberRange" || meta.filterVariant === "dateRange" ? (
        <div class="tablite-range-filter" onClick={(event) => event.stopPropagation()}>
          <input
            class="tablite-column-filter tablite-range-input"
            type={meta.filterVariant === "numberRange" ? "number" : "date"}
            placeholder="Min"
            value={rangeValue.min ?? ""}
            onInput={(event) => {
              column.setFilterValue({
                min: (event.target as HTMLInputElement).value || undefined,
                max: rangeValue.max || undefined,
              });
            }}
          />
          <span class="tablite-range-sep">-</span>
          <input
            class="tablite-column-filter tablite-range-input"
            type={meta.filterVariant === "numberRange" ? "number" : "date"}
            placeholder="Max"
            value={rangeValue.max ?? ""}
            onInput={(event) => {
              column.setFilterValue({
                min: rangeValue.min || undefined,
                max: (event.target as HTMLInputElement).value || undefined,
              });
            }}
          />
        </div>
      ) : (
        <input
          class="tablite-column-filter"
          type="text"
          placeholder="Filter..."
          value={filterValue}
          onInput={(event) => {
            column.setFilterValue((event.target as HTMLInputElement).value || undefined);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.stopPropagation();
          }}
          onClick={(event) => event.stopPropagation()}
        />
      )}
    </div>
  );
}
