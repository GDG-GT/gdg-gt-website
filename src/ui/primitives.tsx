import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Search, Inbox } from "lucide-react";
import { chapterName } from "./preview-data";
import { useContent } from "@/contexts/ContentContext";
import { useLocation } from "react-router-dom";
import type { PageCopy } from "../../shared/site-content";

export function Brand({
  inverse = false,
  compact = false,
}: {
  inverse?: boolean;
  compact?: boolean;
}) {
  return (
    <Link
      to="/"
      className={`gt-brand ${inverse ? "gt-brand-inverse" : ""}`}
      aria-label={
        compact
          ? "GDG@GT · Georgia Tech home"
          : "GDG@GT on campus · Georgia Tech home"
      }
    >
      <img src="/logo.webp" alt="" width="38" height="24" />
      <span>
        GDG<span className="gt-brand-at">@</span>GT
        {!compact && <small>on campus · Georgia Tech</small>}
      </span>
    </Link>
  );
}
export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  children: ReactNode;
}) {
  return (
    <button
      className={`gt-button gt-button-${variant} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
export function ActionLink({
  to,
  children,
  variant = "primary",
  arrow = false,
}: {
  to: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  arrow?: boolean;
}) {
  const className = `gt-button gt-button-${variant}`;
  const hasUnsafeCharacters =
    to.includes("\\") ||
    Array.from(to).some(
      (character) =>
        character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
    );
  let external: string | undefined;
  let destination = to;
  if (!hasUnsafeCharacters && !to.startsWith("/") && !to.startsWith("#")) {
    try {
      const url = new URL(to);
      if (url.protocol === "https:" && !url.username && !url.password) {
        if (
          typeof window !== "undefined" &&
          url.origin === window.location.origin
        )
          destination = url.pathname + url.search + url.hash;
        else external = url.href;
      }
    } catch {
      /* Relative routes are handled by the router below. */
    }
  }
  if (external)
    return (
      <a
        className={className}
        href={external}
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
        <ArrowUpRight size={17} aria-hidden="true" />{" "}
        <span className="sr-only">(opens a new tab)</span>
      </a>
    );
  if (
    hasUnsafeCharacters ||
    !(
      (destination.startsWith("/") && !destination.startsWith("//")) ||
      destination.startsWith("#")
    )
  )
    return (
      <span className={className} aria-disabled="true">
        {children}
      </span>
    );
  return (
    <Link className={className} to={destination}>
      {children}
      {arrow && <ArrowRight size={17} aria-hidden="true" />}
    </Link>
  );
}
export function EmptyState({
  title,
  children,
  action,
  headingLevel = 3,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  headingLevel?: 1 | 2 | 3;
}) {
  const Heading = headingLevel === 1 ? "h1" : headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="gt-empty">
      <span className="gt-empty-icon">
        <Inbox size={28} />
      </span>
      <Heading>{title}</Heading>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder = "Search",
  label = "Search",
  maxLength,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  maxLength?: number;
  disabled?: boolean;
}) {
  return (
    <label className="gt-search">
      <Search size={18} />
      <span className="sr-only">{label}</span>
      <input
        type="search"
        disabled={disabled}
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
export function PageHeader({
  title,
  accent,
  description,
  children,
}: {
  title: string;
  accent?: string;
  description: string;
  children?: ReactNode;
}) {
  const { getPageSection } = useContent(),
    { pathname } = useLocation(),
    page = pathname.split("/")[1];
  const content = (getPageSection(page, "header") ||
    getPageSection(page, "main") ||
    {}) as PageCopy;
  return (
    <header className="gt-page-hero">
      <div className="gt-container">
        <span className="gt-section-note gt-full-identity">{chapterName}</span>
        <h1>
          {content.title || title}
          {(content.accent || accent) && (
            <>
              {" "}
              <span>{content.accent || accent}</span>
            </>
          )}
        </h1>
        <p>{content.description || description}</p>
        {children}
      </div>
    </header>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "coral" | "danger";
}) {
  return <span className={`gt-badge gt-badge-${tone}`}>{children}</span>;
}
export function Field({
  label,
  children,
  hint,
  required = false,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="gt-field">
      <span>
        {label}
        {required && <span className="gt-required"> *</span>}
      </span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
