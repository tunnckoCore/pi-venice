import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// import { applyExtensionDefaults } from "../themeMap.ts";
import { registerVeniceCommands } from "./commands.ts";
import { notify } from "./helpers.ts";
import { createVeniceRuntime } from "./runtime.ts";
import { registerVeniceTools } from "./tools/index.ts";

export default function (pi: ExtensionAPI) {
  const runtime = createVeniceRuntime(pi);
  runtime.registerProvider();

  registerVeniceCommands(pi, runtime);
  registerVeniceTools(pi, runtime);

  const restoreAndUpdate = async (ctx: any) => {
    // applyExtensionDefaults(import.meta.url, ctx);
    runtime.restoreState(ctx);
  };

  pi.on("session_start", async (event: any, ctx) => {
    await restoreAndUpdate(ctx);

    const reason = event?.reason;
    const shouldRefreshCatalog =
      reason === undefined || reason === "startup" || reason === "reload";

    if (!shouldRefreshCatalog) return;

    try {
      await runtime.refreshModels(ctx, true);
    } catch (error: any) {
      runtime.setState({
        ...runtime.getState(),
        config: {
          ...runtime.getState().config,
          lastRefreshStatus: "error",
          lastError: error?.message ?? String(error),
        },
      });
      runtime.saveState();
      runtime.updateStatus(ctx);
      notify(
        ctx,
        `Venice model refresh failed: ${runtime.getState().config.lastError}`,
        "error",
      );
    }
  });

  pi.on("session_tree", async (_event, ctx) => {
    await restoreAndUpdate(ctx);
  });
}
