import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// import { applyExtensionDefaults } from "../themeMap.ts";
import { registerVeniceCommands } from "./commands.ts";
import { notify } from "./helpers.ts";
import { createVeniceRuntime } from "./runtime.ts";
import { registerVeniceTools } from "./tools/index.ts";

export default function (pi: ExtensionAPI) {
  const runtime = createVeniceRuntime(pi);

  registerVeniceCommands(pi, runtime);
  registerVeniceTools(pi, runtime);

  const restoreAndUpdate = async (_event: any, ctx: any) => {
    // applyExtensionDefaults(import.meta.url, ctx);
    runtime.restoreState(ctx);
  };

  pi.on("session_start", async (_event, ctx) => {
    restoreAndUpdate(_event, ctx);
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

  (pi as any).on("session_switch", restoreAndUpdate);
  (pi as any).on("session_fork", restoreAndUpdate);
  (pi as any).on("session_tree", restoreAndUpdate);
}
