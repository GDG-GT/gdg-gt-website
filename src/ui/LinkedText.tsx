import React from "react";
import { textLinks } from "../../shared/text-links.mjs";

export default function LinkedText({ text }: { text: string }) {
  return <span className="gt-linked-text">{textLinks(text).map((part, index) =>
    part.href ? (
      <a key={index} href={part.href} target="_blank" rel="noopener noreferrer">
        {part.text}
      </a>
    ) : part.text,
  )}</span>;
}
