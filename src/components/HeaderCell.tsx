import { useState, useRef, useCallback } from "preact/hooks";
import type { Column } from "@tanstack/react-table";

interface HeaderCellProps {
  name: string;
  colIndex: number;
  column: Column<string[], unknown>;
  onUpdateHeader: (colIndex: number, value: string) => void;
  onResize: (colIndex: number, width: number) => void;
}

export function HeaderCell({
  name,
  colIndex,
  column,
  onUpdateHeader,
  onResize,
}: HeaderCellProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);
  const resizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const commitEdit = useCallback(() => {
    setEditing(false);
    if (editValue !== name) {
      onUpdateHeader(colIndex, editValue);
    }
  }, [editValue, name, colIndex, onUpdateHeader]);

  const sortDir = column.getIsSorted();
  const sortIndicator = sortDir === "asc" ? " ▲" : sortDir === "desc" ? " ▼" : "";

  const onMouseDown = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      resizing.current = true;
      startX.current = e.clientX;
      startWidth.current = column.getSize();

      const onMouseMove = (e: MouseEvent) => {
        if (!resizing.current) return;
        const diff = e.clientX - startX.current;
        const newWidth = Math.max(50, startWidth.current + diff);
        onResize(colIndex, newWidth);
      };

      const onMouseUp = () => {
        resizing.current = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [column, colIndex, onResize],
  );

  if (editing) {
    return (
      <input
        ref={inputRef}
        class="tablite-header-input"
        value={editValue}
        onInput={(e) => setEditValue((e.target as HTMLInputElement).value)}
        onBlur={commitEdit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitEdit();
          if (e.key === "Escape") {
            setEditing(false);
            setEditValue(name);
          }
        }}
      />
    );
  }

  return (
    <div class="tablite-header-cell">
      <span
        class="tablite-header-name"
        onClick={() => column.toggleSorting()}
        onDblClick={() => {
          setEditValue(name);
          setEditing(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
      >
        {name}{sortIndicator}
      </span>
      <div class="tablite-resize-handle" onMouseDown={onMouseDown} />
    </div>
  );
}
