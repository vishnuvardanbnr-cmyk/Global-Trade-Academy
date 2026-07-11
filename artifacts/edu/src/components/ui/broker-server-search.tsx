import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}

export function BrokerServerSearch({ value, onChange, placeholder = "Type to search or enter manually…", className }: Props) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) { setSuggestions([]); setOpen(false); return; }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/broker-servers?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json() as string[];
          setSuggestions(data);
          setOpen(data.length > 0);
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }, 250);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [value]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
      />
      {loading && (
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">searching…</div>
      )}
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground first:rounded-t-md last:rounded-b-md"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(s);
                setOpen(false);
                setSuggestions([]);
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
