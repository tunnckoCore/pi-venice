import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import {
  DEFAULTABLE_FAMILIES,
  FILTER_FAMILIES,
  IMPLEMENTED_PROVIDER_FAMILIES,
  IMPLEMENTED_TOOL_FAMILIES,
  USER_CONFIGURABLE_FAMILIES,
} from "./constants.ts";
import {
  buildModelListing,
  buildStatusSummary,
  getEnabledButNotActionableFamilies,
  isDefaultableFamily,
  isUserConfigurableFamily,
  notify,
  pickDefaultModel,
} from "./helpers.ts";
import type { DefaultableFamily } from "./types.ts";
import type { VeniceRuntime } from "./runtime.ts";

export function registerVeniceCommands(pi: ExtensionAPI, runtime: VeniceRuntime) {
  pi.registerCommand("venice-refresh-models", {
    description: "Fetch Venice model catalog and re-register the Venice text provider",
    handler: async (_args, ctx) => {
      try {
        await runtime.refreshModels(ctx);
        notify(ctx, `Venice models refreshed: ${runtime.getState().models.length} total`, "success");
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
        notify(ctx, `Venice refresh failed: ${runtime.getState().config.lastError}`, "error");
      }
    },
  });

  pi.registerCommand("venice-status", {
    description: "Show Venice provider status, defaults, model counts, and future families",
    handler: async (_args, ctx) => {
      notify(ctx, buildStatusSummary(runtime.getState()), "info");
      runtime.updateStatus(ctx);
    },
  });

  pi.registerCommand("venice-models", {
    description: "Show Venice models: /venice-models [family|all] [limit]",
    handler: async (args, ctx) => {
      const parts = (args ?? "").trim().split(/\s+/).filter(Boolean);
      const family =
        parts[0] && (FILTER_FAMILIES as readonly string[]).includes(parts[0])
          ? parts[0]
          : "all";
      const limit = parts[1] ? Number(parts[1]) || 40 : 40;
      const listing = buildModelListing(runtime.getState().models, family, limit);
      notify(ctx, listing.text, "info");
    },
  });

  pi.registerCommand("venice-defaults", {
    description:
      "Show or set Venice default models: /venice-defaults or /venice-defaults <text|image|edit|upscale|video> <model-id|none>",
    handler: async (args, ctx) => {
      const state = runtime.getState();
      const parts = (args ?? "").trim().split(/\s+/).filter(Boolean);
      if (parts.length === 0) {
        const summary = DEFAULTABLE_FAMILIES.map((family) => {
          return `${family}: ${pickDefaultModel(state, family) ?? "none"}`;
        }).join("\n");
        notify(ctx, summary, "info");
        return;
      }

      if (parts.length < 2 || !isDefaultableFamily(parts[0])) {
        notify(
          ctx,
          "Usage: /venice-defaults <text|image|edit|upscale|video> <model-id|none>",
          "error",
        );
        return;
      }

      const family = parts[0] as DefaultableFamily;
      const modelId = parts.slice(1).join(" ");
      if (modelId === "none") {
        delete state.config.defaults[family];
      } else if (
        !state.models.some((model) => model.family === family && model.id === modelId)
      ) {
        notify(ctx, `Unknown Venice ${family} model: ${modelId}`, "error");
        return;
      } else {
        state.config.defaults[family] = modelId;
      }

      runtime.setState({ ...state, config: { ...state.config, defaults: { ...state.config.defaults } } });
      runtime.saveState();
      runtime.registerProvider();
      runtime.updateStatus(ctx);
      notify(
        ctx,
        `Venice default ${family}: ${pickDefaultModel(runtime.getState(), family) ?? "none"}`,
        "success",
      );
    },
  });

  pi.registerCommand("venice-families", {
    description:
      "Show or set enabled Venice catalog families: /venice-families or /venice-families text,image,embedding,video or /venice-families all",
    handler: async (args, ctx) => {
      const raw = (args ?? "").trim();
      if (!raw) {
        const future = getEnabledButNotActionableFamilies(runtime.getState());
        notify(
          ctx,
          [
            `Enabled Venice catalog families: ${runtime.getState().config.enabledCatalogFamilies.join(", ")}`,
            `Implemented provider families: ${IMPLEMENTED_PROVIDER_FAMILIES.join(", ")}`,
            `Implemented tool families: ${IMPLEMENTED_TOOL_FAMILIES.join(", ")}`,
            `Enabled but not actionable yet: ${future.length ? future.join(", ") : "none"}`,
          ].join("\n"),
          "info",
        );
        return;
      }

      const parsed = raw
        .split(/[\s,]+/)
        .map((item) => item.trim())
        .filter(Boolean);
      const nextFamilies = parsed.includes("all")
        ? [...USER_CONFIGURABLE_FAMILIES]
        : parsed.filter((item): item is Exclude<typeof USER_CONFIGURABLE_FAMILIES[number], never> =>
            isUserConfigurableFamily(item),
          );

      if (nextFamilies.length === 0) {
        notify(
          ctx,
          `No valid families provided. Use any of: ${USER_CONFIGURABLE_FAMILIES.join(", ")}`,
          "error",
        );
        return;
      }

      runtime.setState({
        ...runtime.getState(),
        config: {
          ...runtime.getState().config,
          enabledCatalogFamilies: nextFamilies,
        },
      });
      runtime.saveState();
      runtime.registerProvider();
      runtime.updateStatus(ctx);

      const future = getEnabledButNotActionableFamilies(runtime.getState());
      notify(
        ctx,
        `Enabled Venice catalog families: ${runtime.getState().config.enabledCatalogFamilies.join(", ")}${future.length ? `\nEnabled but not actionable yet: ${future.join(", ")}` : ""}`,
        "success",
      );
    },
  });
}
