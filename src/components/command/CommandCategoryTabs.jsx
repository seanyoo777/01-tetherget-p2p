/**
 * @param {{ categories: string[], active: string, onChange: (c: string) => void }} props
 */
export function CommandCategoryTabs({ categories, active, onChange }) {
  if (categories.length <= 1) return null;
  const tabs = ["all", ...categories];
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-white/10 px-2 py-2">
      {tabs.map((cat) => (
        <button
          key={cat}
          type="button"
          className={`shrink-0 rounded-md px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
            active === cat ? "bg-violet-500/20 text-violet-200" : "text-zinc-500 hover:text-zinc-300"
          }`}
          onClick={() => onChange(cat)}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}
