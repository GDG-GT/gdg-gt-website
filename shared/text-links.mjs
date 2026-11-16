// A shared tokenizer for plain-text messages on the web and in email.
// Text remains text: only validated destinations become links.
const candidates = /https?:\/\/[^\s<>"'`]+|www\.[^\s<>"'`]+|(?<![a-z0-9.!#$%&'*+/=?^_`{|}~-])[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+/gi;

function destination(text) {
  const href = /^www\./i.test(text) ? `https://${text}` : text.includes("://") ? text : `mailto:${text}`;
  try {
    const url = new URL(href);
    if (/[\x00-\x20\x7f]/.test(href) || url.username || url.password) return null;
    if (url.protocol === "mailto:") return href;
    return ["https:", "http:"].includes(url.protocol) && url.hostname ? href : null;
  } catch {
    return null;
  }
}

export function textLinks(value) {
  const source = String(value ?? ""), parts = [];
  let cursor = 0;
  for (const match of source.matchAll(candidates)) {
    let text = match[0];
    // Sentence punctuation and unmatched closing brackets belong to the prose.
    if (/^(https?:\/\/|www\.)/i.test(text)) {
      let previous;
      do {
        previous = text;
        text = text.replace(/[.,;:!?]+$/, "");
        for (const [open, close] of [["(", ")"], ["[", "]"], ["{", "}"]]) {
          let extra = text.split(close).length - text.split(open).length;
          while (extra > 0 && text.endsWith(close)) { text = text.slice(0, -1); extra--; }
        }
      } while (text !== previous);
    }
    const href = destination(text);
    if (!href) continue;
    const start = match.index;
    if (start > cursor) parts.push({ text: source.slice(cursor, start) });
    parts.push({ text, href });
    cursor = start + text.length;
  }
  if (cursor < source.length) parts.push({ text: source.slice(cursor) });
  return parts;
}
