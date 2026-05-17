import { useEffect, useRef } from "react";

export function CommandSearchInput({ value, onChange }) {
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="border-b border-white/10 px-3 py-3">
      <label className="sr-only" htmlFor="global-command-input">
        Search commands
      </label>
      <input
        ref={inputRef}
        id="global-command-input"
        type="search"
        data-testid="global-command-input"
        autoComplete="off"
        spellCheck={false}
        placeholder="Search commands…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/25"
      />
    </div>
  );
}
