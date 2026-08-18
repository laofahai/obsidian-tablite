import { useEffect, useCallback } from "preact/hooks";

interface UseKeyboardOptions {
  containerRef: { current: HTMLElement | null };
  rowCount: number;
  colCount: number;
  activeCell: [number, number] | null;
  onActivate: (row: number, col: number) => void;
  onStartEdit: (row: number, col: number) => void;
  onUndo: () => void;
  onRedo: () => void;
}

export function useKeyboard({
  containerRef,
  rowCount,
  colCount,
  activeCell,
  onActivate,
  onStartEdit,
  onUndo,
  onRedo,
}: UseKeyboardOptions) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInputField =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT";

      // Undo/Redo — only when not actively editing a cell, so Ctrl+Z inside an
      // input performs the native text-undo instead of reverting the whole table.
      if (!isInputField && (e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          onRedo();
        } else {
          onUndo();
        }
        return;
      }

      if (!activeCell) return;
      const [row, col] = activeCell;

      // Skip if inside an input/textarea
      if (isInputField) {
        return;
      }

      switch (e.key) {
        case "ArrowUp":
          if (row > 0) onActivate(row - 1, col);
          break;
        case "ArrowDown":
          if (row < rowCount - 1) onActivate(row + 1, col);
          break;
        case "ArrowLeft":
          if (col > 0) onActivate(row, col - 1);
          break;
        case "ArrowRight":
          if (col < colCount - 1) onActivate(row, col + 1);
          break;
        case "Enter":
        case "F2":
          onStartEdit(row, col);
          break;
      }
    },
    [activeCell, rowCount, colCount, onActivate, onStartEdit, onUndo, onRedo],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("keydown", handleKeyDown);
    return () => el.removeEventListener("keydown", handleKeyDown);
  }, [containerRef, handleKeyDown]);
}