export interface TextSegment {
  text: string;
  /** Absolute href when the segment is a link, null for plain text */
  href: string | null;
}

/**
 * Matches http(s) URLs and bare `www.` hosts. Trailing punctuation is trimmed
 * afterwards, so a URL at the end of a sentence keeps its period out of the link.
 */
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;

/** Punctuation that commonly follows a URL in prose rather than belonging to it */
const TRAILING_PUNCT = /[.,;:!?)\]}'"]+$/;

function trimTrailing(match: string): string {
  let url = match.replace(TRAILING_PUNCT, "");
  // Keep a closing paren that pairs with an opening one inside the URL (wiki links)
  if (match.endsWith(")") && countChar(url, "(") > countChar(url, ")")) {
    url += ")";
  }
  return url;
}

function countChar(text: string, char: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) if (text[i] === char) n++;
  return n;
}

/**
 * Split a cell value into plain-text and link segments. Returns a single
 * plain segment when the value holds no URL, so callers can skip link rendering.
 */
export function splitLinks(value: string): TextSegment[] {
  if (!value || (!value.includes("://") && !value.toLowerCase().includes("www."))) {
    return [{ text: value, href: null }];
  }

  const segments: TextSegment[] = [];
  let last = 0;
  URL_RE.lastIndex = 0;

  for (let m = URL_RE.exec(value); m !== null; m = URL_RE.exec(value)) {
    const url = trimTrailing(m[0]);
    if (url.length === 0) continue;
    if (m.index > last) {
      segments.push({ text: value.slice(last, m.index), href: null });
    }
    segments.push({
      text: url,
      href: url.toLowerCase().startsWith("www.") ? `https://${url}` : url,
    });
    last = m.index + url.length;
  }

  if (segments.length === 0) return [{ text: value, href: null }];
  if (last < value.length) segments.push({ text: value.slice(last), href: null });
  return segments;
}

export function hasLink(value: string): boolean {
  return splitLinks(value).some((s) => s.href !== null);
}
