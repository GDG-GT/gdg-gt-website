import { emailText, emailInlineText } from "./email.mjs";

export function newsletterBlocks(content) {
  const blocks = [];
  let paragraph = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", text: paragraph.join("\n") });
    paragraph = [];
  };
  for (const line of String(content ?? "").split(/\r?\n/)) {
    const text = line.trim();
    const explicit = /^#{1,3}\s+(.+)$/.exec(text);
    const capitals = text.length <= 100 && /[A-Z]/.test(text) && text === text.toUpperCase() && !/[.!?:;,]$/.test(text);
    if (!text) flush();
    else if (explicit || capitals) {
      flush();
      blocks.push({ type: "heading", text: explicit ? explicit[1] : text });
    } else paragraph.push(line);
  }
  flush();
  return blocks;
}

export function newsletterBodyHtml(content) {
  return newsletterBlocks(content).map(block => block.type === "heading"
    ? `<h2 style="margin:28px 0 12px;font:bold 19px/1.35 Arial,Helvetica,sans-serif;color:#9b3326">${emailInlineText(block.text)}</h2>`
    : emailText(block.text)).join("");
}
