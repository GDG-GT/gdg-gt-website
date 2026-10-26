import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { safeBlogMarkdown } from "../../../shared/blog.mjs";
import { linktreeUrl } from "../../../shared/linktree.mjs";
import { ArrowUpRight } from "lucide-react";

export default function BlogMarkdown({ children }: { children: string }) {
  return (
    <div className="gt-blog-markdown">
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h4>{children}</h4>,
          h2: ({ children }) => <h5>{children}</h5>,
          h3: ({ children }) => <h6>{children}</h6>,
          h4: ({ children }) => <h6>{children}</h6>,
          h5: ({ children }) => <h6>{children}</h6>,
          h6: ({ children }) => <h6>{children}</h6>,
          a: ({ href, children }) =>
            linktreeUrl.safeParse(href).success ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
              >
                {children}
                <ArrowUpRight size={14} aria-hidden="true" />{" "}
                <span className="sr-only">(opens a new tab)</span>
              </a>
            ) : (
              <span>{children}</span>
            ),
          img: ({ alt }) => (
            <span>{alt || "Image omitted from private preview"}</span>
          ),
        }}
      >
        {safeBlogMarkdown(children)}
      </ReactMarkdown>
    </div>
  );
}
