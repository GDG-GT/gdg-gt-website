import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Search, Inbox } from "lucide-react";
import { chapterName } from "./preview-data";

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
      aria-label="GDG at Georgia Tech home"
    >
      <img src="/logo.png" alt="" width="38" height="24" />
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
  return (
    <Link className={`gt-button gt-button-${variant}`} to={to}>
      {children}
      {arrow && <ArrowRight size={17} />}
    </Link>
  );
}
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="gt-empty">
      <span className="gt-empty-icon">
        <Inbox size={28} />
      </span>
      <h3>{title}</h3>
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
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}) {
  return (
    <label className="gt-search">
      <Search size={18} />
      <span className="sr-only">{label}</span>
      <input
        type="search"
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
  return (
    <header className="gt-page-hero">
      <div className="gt-container">
        <span className="gt-section-note gt-full-identity">{chapterName}</span>
        <h1>
          {title}
          {accent && (
            <>
              {" "}
              <span>{accent}</span>
            </>
          )}
        </h1>
        <p>{description}</p>
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
