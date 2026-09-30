/**
 * Encoding helpers for reading and writing CSV bytes.
 *
 * `TextDecoder` understands many legacy encodings (GBK, Shift-JIS, ...) but
 * `TextEncoder` only produces UTF-8. To honour the encoding chosen for a file
 * we therefore build a reverse lookup table by decoding every candidate byte
 * sequence with `TextDecoder` once per encoding, then reuse that table to map
 * characters back to bytes.
 */

export const UTF8 = "utf-8";
export const UTF8_BOM = "utf-8-bom";
export const GBK = "gbk";
export const WINDOWS_1252 = "windows-1252";
export const SHIFT_JIS = "shift_jis";
export const UTF16_LE = "utf-16le";
export const UTF16_BE = "utf-16be";

export interface EncodingOption {
  value: string;
  label: string;
}

export const ENCODING_OPTIONS: EncodingOption[] = [
  { value: UTF8, label: "UTF-8" },
  { value: UTF8_BOM, label: "UTF-8 with BOM" },
  { value: GBK, label: "GBK" },
  { value: WINDOWS_1252, label: "Windows-1252" },
  { value: SHIFT_JIS, label: "Shift-JIS" },
  { value: UTF16_LE, label: "UTF-16 LE" },
];

export const ENCODING_LABELS: Record<string, string> = Object.fromEntries(
  ENCODING_OPTIONS.map((option) => [option.value, option.label]),
);

const BOMS: Array<{ bytes: number[]; encoding: string }> = [
  { bytes: [0xef, 0xbb, 0xbf], encoding: UTF8_BOM },
  { bytes: [0xff, 0xfe], encoding: UTF16_LE },
  { bytes: [0xfe, 0xff], encoding: UTF16_BE },
];

const REPLACEMENT = "\uFFFD";
const BOM_CHAR = "\uFEFF";
const UNENCODABLE = 0x3f; // "?"

/** Encoding that natively starts with a byte order mark. */
export function includesBom(encoding: string): boolean {
  return encoding === UTF8_BOM || encoding === UTF16_LE || encoding === UTF16_BE;
}

/** Encoding name understood by `TextDecoder` (drops the BOM variant). */
export function decoderLabel(encoding: string): string {
  return encoding === UTF8_BOM ? UTF8 : encoding;
}

/** Canonical encoding id, tolerating the aliases jschardet and users produce. */
export function normalizeEncodingId(value: unknown): string {
  if (typeof value !== "string") return UTF8;
  const lower = value.trim().toLowerCase();
  switch (lower.replace(/[\s_-]/g, "")) {
    case "":
      return UTF8;
    case "utf8":
      return UTF8;
    case "utf8bom":
    case "utf8sig":
      return UTF8_BOM;
    case "gb2312":
    case "gbk":
    case "gb18030":
    case "csgb2312":
    case "xgbk":
      return GBK;
    case "utf16":
    case "utf16le":
      return UTF16_LE;
    case "utf16be":
      return UTF16_BE;
    case "shiftjis":
    case "sjis":
      return SHIFT_JIS;
    case "windows1252":
    case "cp1252":
      return WINDOWS_1252;
    default:
      return lower;
  }
}

/** The encoding a file declares through its byte order mark, if any. */
export function detectBomEncoding(buffer: ArrayBuffer): string | null {
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 4));
  for (const bom of BOMS) {
    if (bom.bytes.every((byte, index) => bytes[index] === byte)) {
      return bom.encoding;
    }
  }
  return null;
}

/** Decode file bytes. The BOM, when present, is consumed rather than returned. */
export function decodeBuffer(buffer: ArrayBuffer, encoding: string): string {
  try {
    return new TextDecoder(decoderLabel(encoding)).decode(buffer);
  } catch {
    return new TextDecoder(UTF8).decode(buffer);
  }
}

function encodeUtf8Bom(text: string): Uint8Array {
  const body = new TextEncoder().encode(text);
  const out = new Uint8Array(body.length + 3);
  out[0] = 0xef;
  out[1] = 0xbb;
  out[2] = 0xbf;
  out.set(body, 3);
  return out;
}

function encodeUtf16(text: string, littleEndian: boolean): Uint8Array {
  const out = new Uint8Array(text.length * 2 + 2);
  let offset = 0;
  if (littleEndian) {
    out[offset++] = 0xff;
    out[offset++] = 0xfe;
  } else {
    out[offset++] = 0xfe;
    out[offset++] = 0xff;
  }
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (littleEndian) {
      out[offset++] = code & 0xff;
      out[offset++] = code >> 8;
    } else {
      out[offset++] = code >> 8;
      out[offset++] = code & 0xff;
    }
  }
  return out;
}

const reverseTables = new Map<string, Map<string, number>>();

/**
 * Map every character reachable through `encoding` to its shortest byte
 * sequence. Single byte mappings win so ASCII stays one byte.
 */
function getReverseTable(label: string): Map<string, number> {
  const cached = reverseTables.get(label);
  if (cached) return cached;

  const table = new Map<string, number>();
  let decoder: TextDecoder | null = null;
  try {
    decoder = new TextDecoder(label);
  } catch {
    decoder = null;
  }
  if (!decoder) {
    reverseTables.set(label, table);
    return table;
  }

  const pair = new Uint8Array(2);
  for (let lead = 0x80; lead <= 0xff; lead++) {
    pair[0] = lead;
    for (let trail = 0x00; trail <= 0xff; trail++) {
      pair[1] = trail;
      const decoded = decoder.decode(pair);
      if (decoded.length === 1 && decoded !== REPLACEMENT && !table.has(decoded)) {
        table.set(decoded, (lead << 8) | trail);
      }
    }
  }

  const single = new Uint8Array(1);
  for (let byte = 0x00; byte <= 0xff; byte++) {
    single[0] = byte;
    const decoded = decoder.decode(single);
    if (decoded.length === 1 && decoded !== REPLACEMENT) {
      table.set(decoded, byte);
    }
  }

  reverseTables.set(label, table);
  return table;
}

function encodeWithTable(text: string, label: string): Uint8Array {
  const table = getReverseTable(label);
  if (table.size === 0) {
    // An empty table means this runtime cannot decode the label at all, so we
    // have no way to produce valid bytes. Failing the save is far better than
    // replacing every non-ASCII character with "?" and destroying content.
    throw new Error(`Tablite: "${label}" is not supported on this platform`);
  }
  // Two bytes per UTF-16 code unit is the worst case for the encodings we
  // support; characters missing from the table fall back to "?".
  const out = new Uint8Array(text.length * 2);
  let offset = 0;
  for (const char of text) {
    const mapped = char.charCodeAt(0) < 0x80 ? char.charCodeAt(0) : table.get(char);
    if (mapped === undefined) {
      out[offset++] = UNENCODABLE;
    } else if (mapped > 0xff) {
      out[offset++] = mapped >> 8;
      out[offset++] = mapped & 0xff;
    } else {
      out[offset++] = mapped;
    }
  }
  return out.slice(0, offset);
}

/**
 * Encode text for storage. Characters that the target encoding cannot
 * represent are replaced with "?" — the alternative would be silently
 * producing undecodable bytes.
 */
export function encodeText(text: string, encoding: string): ArrayBuffer {
  const normalized = normalizeEncodingId(encoding);
  const clean = text.startsWith(BOM_CHAR) ? text.slice(1) : text;

  let bytes: Uint8Array;
  if (normalized === UTF8_BOM) {
    bytes = encodeUtf8Bom(clean);
  } else if (normalized === UTF8) {
    bytes = new TextEncoder().encode(clean);
  } else if (normalized === UTF16_LE) {
    bytes = encodeUtf16(clean, true);
  } else if (normalized === UTF16_BE) {
    bytes = encodeUtf16(clean, false);
  } else {
    bytes = encodeWithTable(clean, decoderLabel(normalized));
  }
  return bytes.buffer as ArrayBuffer;
}
