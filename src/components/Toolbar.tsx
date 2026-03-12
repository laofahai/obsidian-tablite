import { useRef, useEffect } from "preact/hooks";
import type { Delimiter } from "../parser/detect";

interface ToolbarProps {
  encoding: string;
  delimiter: string;
  hasHeader: boolean;
  crossHighlight: boolean;
  rowCount: number;
  colCount: number;
  onDelimiterChange: (d: Delimiter) => void;
  onEncodingChange: (e: string) => void;
  onHasHeaderChange: (h: boolean) => void;
  onCrossHighlightChange: (v: boolean) => void;
  onSearch: (query: string) => void;
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
  onDelimiterChange,
  onEncodingChange,
  onHasHeaderChange,
  onCrossHighlightChange,
  onSearch,
  onUndo,
  onRedo,
}: ToolbarProps) {
  const undoBtnRef = useRef<HTMLButtonElement>(null);
  const redoBtnRef = useRef<HTMLButtonElement>(null);
  const delimiterRef = useRef<HTMLSelectElement>(null);
  const encodingRef = useRef<HTMLSelectElement>(null);
  const headerToggleRef = useRef<HTMLInputElement>(null);
  const crossHLRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const undoBtn = undoBtnRef.current;
    const redoBtn = redoBtnRef.current;
    const delimiterSelect = delimiterRef.current;
    const encodingSelect = encodingRef.current;
    const searchInput = searchRef.current;
    const headerToggle = headerToggleRef.current;
    const crossHLToggle = crossHLRef.current;

    const handleUndo = () => onUndo();
    const handleRedo = () => onRedo();
    const handleDelimiter = () => {
      if (delimiterSelect) onDelimiterChange(delimiterSelect.value as Delimiter);
    };
    const handleEncoding = () => {
      if (encodingSelect) onEncodingChange(encodingSelect.value);
    };
    const handleSearch = () => {
      if (searchInput) onSearch(searchInput.value);
    };
    const handleHeaderToggle = () => {
      if (headerToggle) onHasHeaderChange(headerToggle.checked);
    };
    const handleCrossHL = () => {
      if (crossHLToggle) onCrossHighlightChange(crossHLToggle.checked);
    };

    undoBtn?.addEventListener("click", handleUndo);
    redoBtn?.addEventListener("click", handleRedo);
    delimiterSelect?.addEventListener("change", handleDelimiter);
    encodingSelect?.addEventListener("change", handleEncoding);
    headerToggle?.addEventListener("change", handleHeaderToggle);
    crossHLToggle?.addEventListener("change", handleCrossHL);
    searchInput?.addEventListener("input", handleSearch);

    return () => {
      undoBtn?.removeEventListener("click", handleUndo);
      redoBtn?.removeEventListener("click", handleRedo);
      delimiterSelect?.removeEventListener("change", handleDelimiter);
      encodingSelect?.removeEventListener("change", handleEncoding);
      headerToggle?.removeEventListener("change", handleHeaderToggle);
      crossHLToggle?.removeEventListener("change", handleCrossHL);
      searchInput?.removeEventListener("input", handleSearch);
    };
  }, [onUndo, onRedo, onDelimiterChange, onEncodingChange, onHasHeaderChange, onCrossHighlightChange, onSearch]);

  return (
    <div class="tablite-toolbar">
      <div class="tablite-toolbar-left">
        <button ref={undoBtnRef} class="tablite-icon-btn" title="Undo (Ctrl+Z)" dangerouslySetInnerHTML={{
          __html: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>'
        }} />
        <button ref={redoBtnRef} class="tablite-icon-btn" title="Redo (Ctrl+Shift+Z)" dangerouslySetInnerHTML={{
          __html: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>'
        }} />

        <span class="tablite-separator" />

        <select ref={delimiterRef} class="tablite-select" value={delimiter}>
          {Object.entries(DELIMITER_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>

        <select ref={encodingRef} class="tablite-select" value={encoding}>
          <option value="utf-8">UTF-8</option>
          <option value="gbk">GBK</option>
          <option value="windows-1252">Windows-1252</option>
          <option value="shift_jis">Shift-JIS</option>
        </select>

        <span class="tablite-separator" />

        <label class="tablite-toggle-label" title="First row is header">
          <input ref={headerToggleRef} type="checkbox" checked={hasHeader} class="tablite-toggle-input" />
          <span class="tablite-toggle-track" />
          <span class="tablite-toggle-text">Header</span>
        </label>

        <label class="tablite-toggle-label" title="Cross highlight on selection">
          <input ref={crossHLRef} type="checkbox" checked={crossHighlight} class="tablite-toggle-input" />
          <span class="tablite-toggle-track" />
          <span class="tablite-toggle-text" dangerouslySetInnerHTML={{
            __html: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>'
          }} />
        </label>
      </div>

      <div class="tablite-toolbar-right">
        <span class="tablite-info">
          {rowCount} x {colCount}
        </span>
        <input
          ref={searchRef}
          class="tablite-search"
          type="text"
          placeholder="Search..."
        />
      </div>
    </div>
  );
}
