import type { RefObject } from "preact";
import { useRef, useEffect, useMemo } from "preact/hooks";
import type { Delimiter } from "../parser/detect";
import { ENCODING_OPTIONS } from "../parser/encoding";

interface ToolbarProps {
  encoding: string;
  delimiter: string;
  hasHeader: boolean;
  crossHighlight: boolean;
  rowCount: number;
  colCount: number;
  headers: string[];
  columnOrder: number[];
  hiddenColumns: number[];
  frozenCount: number;
  searchQuery: string;
  searchMatchIndex: number;
  searchMatchCount: number;
  searchInputRef: RefObject<HTMLInputElement>;
  loading?: boolean;
  loadProgress?: number;
  onDelimiterChange: (delimiter: Delimiter) => void;
  onEncodingChange: (encoding: string) => void;
  onReloadEncoding: () => void;
  onHasHeaderChange: (value: boolean) => void;
  onCrossHighlightChange: (value: boolean) => void;
  onSearch: (query: string) => void;
  onSearchNext: () => void;
  onSearchPrev: () => void;
  onToggleColumnVisibility: (colIndex: number) => void;
  onShowAllColumns: () => void;
  onFrozenCountChange: (count: number) => void;
  onUndo: () => void;
  onRedo: () => void;
}

const DELIMITER_LABELS: Record<string, string> = {
  ",": "Comma (,)",
  ";": "Semicolon (;)",
  "\t": "Tab",
  "|": "Pipe (|)",
};

export function Toolbar({
  encoding,
  delimiter,
  hasHeader,
  crossHighlight,
  rowCount,
  colCount,
  headers,
  columnOrder,
  hiddenColumns,
  frozenCount,
  searchQuery,
  searchMatchIndex,
  searchMatchCount,
  searchInputRef,
  loading,
  loadProgress,
  onDelimiterChange,
  onEncodingChange,
  onReloadEncoding,
  onHasHeaderChange,
  onCrossHighlightChange,
  onSearch,
  onSearchNext,
  onSearchPrev,
  onToggleColumnVisibility,
  onShowAllColumns,
  onFrozenCountChange,
  onUndo,
  onRedo,
}: ToolbarProps) {
  const undoBtnRef = useRef<HTMLButtonElement>(null);
  const redoBtnRef = useRef<HTMLButtonElement>(null);
  const delimiterRef = useRef<HTMLSelectElement>(null);
  const encodingRef = useRef<HTMLSelectElement>(null);
  const reloadEncodingRef = useRef<HTMLButtonElement>(null);
  const headerToggleRef = useRef<HTMLInputElement>(null);
  const crossHLRef = useRef<HTMLInputElement>(null);
  const searchPrevRef = useRef<HTMLButtonElement>(null);
  const searchNextRef = useRef<HTMLButtonElement>(null);
  const freezeRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    const undoBtn = undoBtnRef.current;
    const redoBtn = redoBtnRef.current;
    const delimiterSelect = delimiterRef.current;
    const encodingSelect = encodingRef.current;
    const reloadEncodingBtn = reloadEncodingRef.current;
    const searchInput = searchInputRef.current;
    const headerToggle = headerToggleRef.current;
    const crossHLToggle = crossHLRef.current;
    const searchPrevBtn = searchPrevRef.current;
    const searchNextBtn = searchNextRef.current;
    const freezeSelect = freezeRef.current;

    const handleUndo = () => onUndo();
    const handleRedo = () => onRedo();
    const handleDelimiter = () => delimiterSelect && onDelimiterChange(delimiterSelect.value as Delimiter);
    const handleEncoding = () => encodingSelect && onEncodingChange(encodingSelect.value);
    const handleReloadEncoding = () => onReloadEncoding();
    const handleSearch = () => searchInput && onSearch(searchInput.value);
    const handleHeaderToggle = () => headerToggle && onHasHeaderChange(headerToggle.checked);
    const handleCrossHL = () => crossHLToggle && onCrossHighlightChange(crossHLToggle.checked);
    const handlePrev = () => onSearchPrev();
    const handleNext = () => onSearchNext();
    const handleFreeze = () => freezeSelect && onFrozenCountChange(Number(freezeSelect.value));
    const handleSearchKeys = (event: KeyboardEvent) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      if (event.shiftKey) onSearchPrev();
      else onSearchNext();
    };

    undoBtn?.addEventListener("click", handleUndo);
    redoBtn?.addEventListener("click", handleRedo);
    delimiterSelect?.addEventListener("change", handleDelimiter);
    encodingSelect?.addEventListener("change", handleEncoding);
    reloadEncodingBtn?.addEventListener("click", handleReloadEncoding);
    headerToggle?.addEventListener("change", handleHeaderToggle);
    crossHLToggle?.addEventListener("change", handleCrossHL);
    searchPrevBtn?.addEventListener("click", handlePrev);
    searchNextBtn?.addEventListener("click", handleNext);
    freezeSelect?.addEventListener("change", handleFreeze);
    searchInput?.addEventListener("input", handleSearch);
    searchInput?.addEventListener("keydown", handleSearchKeys);

    return () => {
      undoBtn?.removeEventListener("click", handleUndo);
      redoBtn?.removeEventListener("click", handleRedo);
      delimiterSelect?.removeEventListener("change", handleDelimiter);
      encodingSelect?.removeEventListener("change", handleEncoding);
      reloadEncodingBtn?.removeEventListener("click", handleReloadEncoding);
      headerToggle?.removeEventListener("change", handleHeaderToggle);
      crossHLToggle?.removeEventListener("change", handleCrossHL);
      searchPrevBtn?.removeEventListener("click", handlePrev);
      searchNextBtn?.removeEventListener("click", handleNext);
      freezeSelect?.removeEventListener("change", handleFreeze);
      searchInput?.removeEventListener("input", handleSearch);
      searchInput?.removeEventListener("keydown", handleSearchKeys);
    };
  }, [
    onCrossHighlightChange,
    onDelimiterChange,
    onEncodingChange,
    onReloadEncoding,
    onFrozenCountChange,
    onHasHeaderChange,
    onRedo,
    onSearch,
    onSearchNext,
    onSearchPrev,
    onUndo,
    searchInputRef,
  ]);

  const orderedHeaders = useMemo(
    () => columnOrder.map((index) => ({ index, name: headers[index] ?? `Column ${index + 1}` })),
    [columnOrder, headers],
  );

  const encodingOptions = useMemo(
    () =>
      ENCODING_OPTIONS.some((option) => option.value === encoding)
        ? ENCODING_OPTIONS
        : [...ENCODING_OPTIONS, { value: encoding, label: encoding.toUpperCase() }],
    [encoding],
  );

  return (
    <div class="tablite-toolbar">
      <div class="tablite-toolbar-left">
        <button
          ref={undoBtnRef}
          class="tablite-icon-btn"
          title="Undo (Ctrl+Z)"
          dangerouslySetInnerHTML={{
            __html: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>',
          }}
        />
        <button
          ref={redoBtnRef}
          class="tablite-icon-btn"
          title="Redo (Ctrl+Shift+Z)"
          dangerouslySetInnerHTML={{
            __html: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>',
          }}
        />

        <span class="tablite-separator" />

        <select ref={delimiterRef} class="tablite-select" value={delimiter}>
          {Object.entries(DELIMITER_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <select
          ref={encodingRef}
          class="tablite-select"
          value={encoding}
          title="File encoding. Choosing one converts the file: the text on screen is kept and written back in that encoding, so Excel opens it correctly."
        >
          {encodingOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <button
          ref={reloadEncodingRef}
          class="tablite-icon-btn"
          title="Re-read the file from disk using the selected encoding (drops unsaved edits) — use this when the text looks garbled"
          dangerouslySetInnerHTML={{
            __html: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>',
          }}
        />

        <span class="tablite-separator" />

        <label class="tablite-toggle-label" title="First row is header">
          <input ref={headerToggleRef} type="checkbox" checked={hasHeader} class="tablite-toggle-input" />
          <span class="tablite-toggle-track" />
          <span class="tablite-toggle-text">Header</span>
        </label>

        <label class="tablite-toggle-label" title="Cross highlight on selection">
          <input ref={crossHLRef} type="checkbox" checked={crossHighlight} class="tablite-toggle-input" />
          <span class="tablite-toggle-track" />
          <span
            class="tablite-toggle-text"
            dangerouslySetInnerHTML={{
              __html: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>',
            }}
          />
        </label>

        <details class="tablite-columns-panel">
          <summary class="tablite-select">Columns</summary>
          <div class="tablite-columns-menu">
            <button type="button" class="tablite-menu-button" onClick={onShowAllColumns}>
              Show all
            </button>
            {orderedHeaders.map(({ index, name }) => (
              <label key={index} class="tablite-column-option">
                <input
                  type="checkbox"
                  checked={!hiddenColumns.includes(index)}
                  onChange={() => onToggleColumnVisibility(index)}
                />
                <span>{name}</span>
              </label>
            ))}
          </div>
        </details>

        <label class="tablite-freeze-control">
          <span class="tablite-freeze-label">Freeze</span>
          <select ref={freezeRef} class="tablite-select" value={String(frozenCount)}>
            {Array.from({ length: Math.min(4, colCount) + 1 }, (_, index) => (
              <option key={index} value={String(index)}>
                {index}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div class="tablite-toolbar-right">
        <span class="tablite-info">
          {rowCount} x {colCount}
          {loading && (
            <span class="tablite-loading-badge" title={`Loading ${Math.round((loadProgress ?? 0) * 100)}%`}>
              {" "}({Math.round((loadProgress ?? 0) * 100)}%)
            </span>
          )}
        </span>
        <div class="tablite-search-group">
          <input
            ref={searchInputRef}
            class="tablite-search"
            type="text"
            value={searchQuery}
            placeholder="Search..."
          />
          <span class="tablite-search-count">
            {searchMatchCount === 0 ? "0/0" : `${searchMatchIndex}/${searchMatchCount}`}
          </span>
          <button ref={searchPrevRef} class="tablite-icon-btn" title="Previous match (Shift+Enter / Shift+F3)">
            ↑
          </button>
          <button ref={searchNextRef} class="tablite-icon-btn" title="Next match (Enter / F3)">
            ↓
          </button>
        </div>
      </div>
    </div>
  );
}
