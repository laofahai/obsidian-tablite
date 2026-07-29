import { useState, useRef, useEffect, useMemo } from "preact/hooks";
import type { RefObject } from "preact";
import { splitLinks } from "../parser/links";

/** Window in which a second click still counts as a double-click (ms) */
const DOUBLE_CLICK_DELAY = 250;

interface CellProps {
  value: string;
  rowIndex: number;
  colIndex: number;
  searchQueryRef: RefObject<string>;
  onUpdate: (rowIndex: number, colIndex: number, value: string) => void;
}

export function Cell({
  value,
  rowIndex,
  colIndex,
  searchQueryRef,
  onUpdate,
}: CellProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  // Pending link navigation, cancelled when the click turns out to be a double-click
  const linkTimerRef = useRef<number | null>(null);

  const cancelLinkOpen = () => {
    if (linkTimerRef.current !== null) {
      window.clearTimeout(linkTimerRef.current);
      linkTimerRef.current = null;
    }
  };

  useEffect(() => cancelLinkOpen, []);

  const commitValue = (nextValue: string) => {
    setEditing(false);
    setEditValue(nextValue);
    if (nextValue !== value) {
      onUpdate(rowIndex, colIndex, nextValue);
    }
  };

  // Sync value from parent when not editing
  useEffect(() => {
    if (!editing) setEditValue(value);
  }, [value, editing]);

  // Auto-focus when entering edit mode
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        class="tablite-cell-input"
        value={editValue}
        onInput={(e) => setEditValue((e.target as HTMLInputElement).value)}
        onBlur={(e) => commitValue((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setEditValue(value);
            setEditing(false);
          }
        }}
      />
    );
  }

  const sq = searchQueryRef.current ?? "";
  const isMatch = sq.length > 0 && value.toLowerCase().includes(sq.toLowerCase());

  const segments = useMemo(() => splitLinks(value), [value]);
  const hasLink = segments.some((s) => s.href !== null);

  return (
    <div
      class={`tablite-cell ${isMatch ? "tablite-cell-match" : ""}`}
      onDblClick={() => {
        cancelLinkOpen();
        setEditValue(value);
        setEditing(true);
      }}
    >
      {hasLink ? (
        // Single inline wrapper: text nodes sitting directly in the flex cell
        // become anonymous flex items and lose the spaces around a link
        <span class="tablite-cell-text">
          {segments.map((segment, i) =>
            segment.href === null ? (
              segment.text
            ) : (
              <a
                key={i}
                class="tablite-cell-link external-link"
                href={segment.href}
                target="_blank"
                rel="noopener noreferrer"
                title={segment.href}
                onMouseDown={(e) => {
                  // Let the cell keep selection on single click, but never start
                  // a native link drag that would swallow the double-click to edit
                  if ((e as MouseEvent).detail > 1) e.preventDefault();
                }}
                onClick={(e) => {
                  const evt = e as unknown as MouseEvent;
                  evt.preventDefault();
                  evt.stopPropagation();
                  // Defer the navigation: a double-click means "edit this cell",
                  // and its first click must not also open the browser
                  cancelLinkOpen();
                  const href = segment.href as string;
                  linkTimerRef.current = window.setTimeout(() => {
                    linkTimerRef.current = null;
                    window.open(href, "_blank");
                  }, DOUBLE_CLICK_DELAY);
                }}
              >
                {segment.text}
              </a>
            ),
          )}
        </span>
      ) : (
        value || "\u00A0"
      )}
    </div>
  );
}
