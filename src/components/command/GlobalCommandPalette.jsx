import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  appendCommandPaletteAudit,
  closeCommandPalette,
  filterCommands,
  isCommandPaletteOpen,
  listCommandCategories,
  readRecentCommandIds,
  saveRecentCommandId,
  subscribeCommandPaletteStore,
} from "@tetherget/global-command-palette-core";
import { executeTethergetCommand } from "../../command/commandExecutor.js";
import { isTethergetCommandPaletteEnabled } from "../../command/commandFeatureFlags.js";
import { buildTethergetCommandRegistry } from "../../command/commandRegistry.js";
import { CommandCategoryTabs } from "./CommandCategoryTabs.jsx";
import { CommandEmptyState } from "./CommandEmptyState.jsx";
import { CommandResultItem } from "./CommandResultItem.jsx";
import { CommandSearchInput } from "./CommandSearchInput.jsx";

function subscribeOpen(onStore) {
  return subscribeCommandPaletteStore(onStore);
}

function getOpenSnapshot() {
  return isCommandPaletteOpen();
}

/**
 * @param {{ openPage: (key: string) => void, setMyInfoTab?: (tab: string) => void, openTradePush?: () => void }} props
 */
export function GlobalCommandPalette({ openPage, setMyInfoTab, openTradePush }) {
  const open = useSyncExternalStore(subscribeOpen, getOpenSnapshot, () => false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [activeIndex, setActiveIndex] = useState(0);

  const registry = useMemo(() => buildTethergetCommandRegistry(), []);
  const recentIds = useMemo(() => (open ? readRecentCommandIds() : []), [open]);

  const recentItems = useMemo(() => {
    const map = new Map(registry.map((c) => [c.id, c]));
    return recentIds.map((id) => map.get(id)).filter((c) => Boolean(c?.enabled));
  }, [registry, recentIds]);

  const filtered = useMemo(() => {
    let items = filterCommands(registry, query);
    if (category !== "all") items = items.filter((c) => c.category === category);
    return items;
  }, [registry, query, category]);

  const displayItems = useMemo(() => {
    if (query.trim() || category !== "all") return filtered;
    const recentSet = new Set(recentItems.map((r) => r.id));
    const rest = filtered.filter((c) => !recentSet.has(c.id));
    return [...recentItems, ...rest];
  }, [filtered, query, category, recentItems]);

  const categories = useMemo(() => listCommandCategories(registry), [registry]);

  const handleClose = useCallback(() => {
    closeCommandPalette("tetherget");
    setQuery("");
    setCategory("all");
    setActiveIndex(0);
  }, []);

  const runCommand = useCallback(
    (item) => {
      appendCommandPaletteAudit("command.executed", "tetherget", item.id, item.target);
      executeTethergetCommand(item, { openPage, setMyInfoTab, openTradePush });
      saveRecentCommandId("tetherget", item.id);
      handleClose();
    },
    [openPage, setMyInfoTab, openTradePush, handleClose],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, Math.max(0, displayItems.length - 1)));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" && displayItems[activeIndex]) {
        e.preventDefault();
        runCommand(displayItems[activeIndex]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, displayItems, activeIndex, runCommand, handleClose]);

  if (!isTethergetCommandPaletteEnabled() || !open) return null;

  return (
    <div className="fixed inset-0 z-[400] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        aria-label="Close command palette"
        data-testid="global-command-backdrop"
        onClick={handleClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        data-testid="global-command-palette"
        className="relative z-[401] flex max-h-[min(85dvh,32rem)] w-full flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-zinc-900 shadow-2xl sm:max-w-lg sm:rounded-2xl"
      >
        <CommandSearchInput value={query} onChange={(v) => { setQuery(v); setActiveIndex(0); }} />
        <CommandCategoryTabs
          categories={categories}
          active={category}
          onChange={(c) => { setCategory(c); setActiveIndex(0); }}
        />
        <div className="flex-1 overflow-y-auto px-2 py-2" role="listbox" aria-label="Command results">
          {!query.trim() && category === "all" && recentItems.length > 0 ? (
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">Recent</p>
          ) : null}
          {displayItems.length === 0 ? (
            <CommandEmptyState query={query} />
          ) : (
            displayItems.map((item, index) => (
              <CommandResultItem key={item.id} item={item} active={index === activeIndex} onSelect={runCommand} />
            ))
          )}
        </div>
        <div className="border-t border-white/10 px-3 py-2 text-[10px] text-zinc-600">
          <span className="hidden sm:inline">↑↓ navigate · Enter run · Esc close · </span>
          MOCK ONLY · no search API
        </div>
      </div>
    </div>
  );
}
