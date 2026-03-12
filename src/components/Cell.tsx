import { useState, useRef, useCallback } from "preact/hooks";

interface CellProps {
  value: string;
  rowIndex: number;
  colIndex: number;
  isActive: boolean;
  onActivate: (rowIndex: number, colIndex: number) => void;
  onUpdate: (rowIndex: number, colIndex: number, value: string) => void;
}

export function Cell({
  value,
  rowIndex,
  colIndex,
  isActive,
  onActivate,
  onUpdate,
}: CellProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = useCallback(() => {
    setEditValue(value);
    setEditing(true);
    onActivate(rowIndex, colIndex);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [value, rowIndex, colIndex, onActivate]);

  const commitEdit = useCallback(() => {
    setEditing(false);
    if (editValue !== value) {
      onUpdate(rowIndex, colIndex, editValue);
    }
  }, [editValue, value, rowIndex, colIndex, onUpdate]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setEditValue(value);
  }, [value]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        class="tablite-cell-input"
        value={editValue}
        onInput={(e) => setEditValue((e.target as HTMLInputElement).value)}
        onBlur={commitEdit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitEdit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancelEdit();
          }
        }}
      />
    );
  }

  return (
    <div
      class={`tablite-cell ${isActive ? "tablite-cell-active" : ""}`}
      onDblClick={startEdit}
      onClick={() => onActivate(rowIndex, colIndex)}
    >
      {value || "\u00A0"}
    </div>
  );
}
