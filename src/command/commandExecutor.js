import { createDefaultCommandExecutor } from "@tetherget/global-command-palette-core";

/**
 * @param {import('@tetherget/global-command-palette-core').CommandItem} item
 * @param {{ openPage: (key: string) => void, setMyInfoTab?: (tab: string) => void, openTradePush?: () => void }} ctx
 */
export function executeTethergetCommand(item, ctx) {
  if (item.target.startsWith("p2p:")) {
    const rest = item.target.slice(4);
    const [page, tab] = rest.split(":");
    if (page) ctx.openPage(page);
    if (tab && ctx.setMyInfoTab) ctx.setMyInfoTab(tab);
    return;
  }

  const base = createDefaultCommandExecutor({
    external_mock: (target) => {
      if (target.startsWith("http")) {
        window.open(target, "_blank", "noopener,noreferrer");
      }
    },
    open_drawer: (target) => {
      if (target === "trade-push-panel" && ctx.openTradePush) {
        ctx.openTradePush();
        return;
      }
      document.querySelector('[aria-label^="거래푸시"]')?.click();
    },
  });
  base(item);
}
