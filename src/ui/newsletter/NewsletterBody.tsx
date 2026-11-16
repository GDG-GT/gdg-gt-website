import React from "react";
import { newsletterBlocks } from "../../../shared/newsletter-format.mjs";
import LinkedText from "../LinkedText";

export default function NewsletterBody({ content }: { content: string }) {
  return <div className="gt-newsletter-body">{newsletterBlocks(content).map((block, index) =>
    block.type === "heading"
      ? <h5 key={index}><LinkedText text={block.text} /></h5>
      : <p key={index}><LinkedText text={block.text} /></p>,
  )}</div>;
}
