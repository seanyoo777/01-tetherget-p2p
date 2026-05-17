export function CommandEmptyState({ query }) {
  return (
    <div data-testid="global-command-empty" className="px-4 py-8 text-center text-sm text-zinc-500">
      {query.trim() ? (
        <>
          No commands for <span className="font-medium text-zinc-400">&quot;{query}&quot;</span>
        </>
      ) : (
        "Type to search mock commands"
      )}
    </div>
  );
}
