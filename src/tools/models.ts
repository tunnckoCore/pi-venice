import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

import { buildModelListing } from "../helpers.ts";
import { ListModelsParams } from "../schemas.ts";
import type { VeniceToolDetails } from "../types.ts";
import type { VeniceRuntime } from "../runtime.ts";

export function registerVeniceListModelsTool(
  pi: ExtensionAPI,
  runtime: VeniceRuntime,
) {
  pi.registerTool({
    name: "venice_list_models",
    label: "Venice List Models",
    description:
      "List Venice models from the cached Venice catalog. Supports family filters, reasoning-only, and vision-only filtering.",
    parameters: ListModelsParams,
    async execute(_toolCallId, params) {
      const family = params.family ?? "all";
      const limit = params.limit ?? 50;
      const listing = buildModelListing(
        runtime.getState().models,
        family,
        limit,
        Boolean(params.reasoning_only),
        Boolean(params.vision_only),
      );
      return {
        content: [{ type: "text", text: listing.text }],
        details: {
          status: "done",
          family,
          count: listing.count,
          summary: `Listed ${Math.min(limit, listing.count)} of ${listing.count} Venice model(s)`,
        } satisfies VeniceToolDetails,
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("venice_list_models "));
      text += theme.fg("accent", args.family ?? "all");
      if (args.limit) text += theme.fg("dim", ` · ${args.limit}`);
      return new Text(text, 0, 0);
    },
    renderResult(result, { expanded, isPartial }, theme) {
      if (isPartial) {
        return new Text(theme.fg("warning", "Listing Venice models..."), 0, 0);
      }
      const details = (result.details ?? {}) as VeniceToolDetails;
      let text = theme.fg("success", details.summary || "Listed Venice models");
      if (expanded) {
        const body =
          result.content?.[0]?.type === "text" ? result.content[0].text : "";
        text += `\n${theme.fg("muted", body)}`;
      }
      return new Text(text, 0, 0);
    },
  });
}
