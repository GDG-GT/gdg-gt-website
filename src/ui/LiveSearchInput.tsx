import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { useLiveSearch } from "@/hooks/useLiveSearch";

/** URL-backed searches keep the input mounted and retain newer, uncommitted typing. */
export default function LiveSearchInput({
  value, onSearch, disabled, ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange"> & {
  value: string;
  onSearch: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value),
    [composing, setComposing] = useState(false),
    sent = useRef(value),
    input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = input.current?.form;
    const reset = () => { setDraft(value); setComposing(false); };
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [value]);
  useEffect(() => {
    if (value !== sent.current) {
      sent.current = value;
      setDraft(value);
    }
  }, [value]);
  useLiveSearch(draft, value, (next) => {
    sent.current = next;
    onSearch(next);
  }, !disabled && !composing);
  return <input ref={input} {...props} type="search" disabled={disabled} value={draft}
    onChange={(event) => setDraft(event.target.value)}
    onCompositionStart={() => setComposing(true)}
    onCompositionEnd={() => setComposing(false)} />;
}
