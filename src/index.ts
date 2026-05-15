import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// import { applyExtensionDefaults } from "../themeMap.ts";
import { registerVeniceCommands } from "./commands.ts";
import { notify, sanitizeVeniceProviderPayload } from "./helpers.ts";
import { createVeniceRuntime } from "./runtime.ts";
import { registerVeniceTools } from "./tools/index.ts";

export default function (pi: ExtensionAPI) {
  const runtime = createVeniceRuntime(pi);

  // Eagerly register provider with cached models during extension loading.
  // This ensures Venice models are available when pi resolves its initial
  // model scope, before the async session_start event fires.
  runtime.eagerRegisterProvider();

  registerVeniceCommands(pi, runtime);
  registerVeniceTools(pi, runtime);

  pi.on("before_provider_request", (event) => {
    const model =
      event.payload &&
      typeof event.payload === "object" &&
      typeof (event.payload as { model?: unknown }).model === "string"
        ? (event.payload as { model: string }).model
        : undefined;
    if (!model || !runtime.getState().models.some((entry) => entry.id === model)) {
      return undefined;
    }

    return sanitizeVeniceProviderPayload(event.payload);
  });

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
