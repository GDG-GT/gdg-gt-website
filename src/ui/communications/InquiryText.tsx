import React from "react";
import { safeEmailLink } from "../../../shared/email.mjs";

export default function InquiryText({ text }: { text: string }) {
  return text.split(/(https?:\/\/[^\s<>"']+)/g).map((part, index) =>
    index % 2 && safeEmailLink(part) ? (
      <a key={index} href={part} target="_blank" rel="noopener noreferrer">
        {part}
      </a>
    ) : part,
  );
}
