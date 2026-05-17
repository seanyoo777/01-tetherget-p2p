/**
 * @param {{ item: import('@tetherget/global-command-palette-core').CommandItem, active: boolean, onSelect: (item: import('@tetherget/global-command-palette-core').CommandItem) => void }} props
 */
export function CommandResultItem({ item, active, onSelect }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      data-testid={`global-command-result-${item.id}`}
      className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition ${
        active ? "bg-violet-500/15 text-white ring-1 ring-violet-500/40" : "text-zinc-200 hover:bg-white/[0.06]"
      }`}
      onClick={() => onSelect(item)}
    >
      <span className="mt-0.5 shrink-0 rounded border border-white/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
        {item.platformId}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{item.title}</span>
        <span className="block truncate text-xs text-zinc-500">{item.subtitle}</span>
      </span>
      <span className="shrink-0 text-[10px] text-zinc-600">{item.category}</span>
    </button>
  );
}
