import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

import { veniceJson } from "../api.ts";
import { resolveAsset } from "../assets.ts";
import {
  ensureToolFamilyEnabled,
  makeJobKey,
  pickDefaultModel,
  renderToolSummary,
  truncate,
} from "../helpers.ts";
import {
  VideoCompleteParams,
  VideoGenerateParams,
  VideoRetrieveParams,
} from "../schemas.ts";
import type { VeniceToolDetails } from "../types.ts";
import type { VeniceRuntime } from "../runtime.ts";

function toolFamilyError(runtime: VeniceRuntime, family: "video") {
  return ensureToolFamilyEnabled(runtime.getState(), family);
}

export function registerVeniceVideoTools(
  pi: ExtensionAPI,
  runtime: VeniceRuntime,
) {
  pi.registerTool({
    name: "venice_video_generate",
    label: "Venice Video Generate",
    description:
      "Queue a Venice video job, optionally quote it first, poll until complete, save the mp4 locally, and optionally clean up remote storage.",
    parameters: VideoGenerateParams,
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const disabled = toolFamilyError(runtime, "video");
      if (disabled) {
        return {
          content: [{ type: "text", text: disabled }],
          details: {
            status: "error",
            error: disabled,
            summary: disabled,
          } satisfies VeniceToolDetails,
          isError: true,
        };
      }

      try {
        if (params.quote_only) {
          const model =
            params.model ?? pickDefaultModel(runtime.getState(), "video");
          if (!model) throw new Error("No Venice video model available.");
          const quotePayload: Record<string, any> = { model };
          if (params.duration) quotePayload.duration = params.duration;
          if (params.aspect_ratio)
            quotePayload.aspect_ratio = params.aspect_ratio;
          if (params.resolution) quotePayload.resolution = params.resolution;
          if (params.upscale_factor)
            quotePayload.upscale_factor = params.upscale_factor;
          if (typeof params.audio === "boolean")
            quotePayload.audio = params.audio;
          if (params.video_input) {
            const video = await resolveAsset(
              params.video_input,
              "video",
              signal,
            );
            quotePayload.video_url = video.httpUrl ?? video.dataUrl;
          }
          const quote = await veniceJson(
            runtime.getState(),
            "/video/quote",
            quotePayload,
            signal,
            true,
          );
          const amount = Number(quote?.quote ?? 0);
          return {
            content: [
              { type: "text", text: `Video quote for ${model}: $${amount}` },
            ],
            details: {
              status: "done",
              model,
              family: "video",
              summary: "Video quote ready",
              quote: amount,
            } satisfies VeniceToolDetails,
          };
        }

        onUpdate?.({
          content: [{ type: "text", text: "Queueing Venice video job..." }],
          details: {
            status: "processing",
            family: "video",
            summary: "Queueing Venice video job",
          },
        });

        const queued = await runtime.queueVideo(ctx, params, signal);
        const polled = await runtime.pollForVideo(
          ctx,
          queued.model,
          queued.queueId,
          {
            wait: params.wait ?? true,
            pollIntervalSeconds: params.poll_interval_seconds,
            timeoutSeconds: params.timeout_seconds,
            cleanup: params.cleanup ?? true,
            saveDir: params.save_dir,
          },
          signal,
          onUpdate,
        );

        return {
          content: [
            {
              type: "text",
              text:
                polled.summary +
                (polled.savedFiles?.length
                  ? `\n${polled.savedFiles.map((file: any) => file.path).join("\n")}`
                  : ""),
            },
          ],
          details: {
            status: polled.status,
            model: queued.model,
            family: "video",
            queueId: queued.queueId,
            summary: polled.summary,
            savedFiles: polled.savedFiles,
          } satisfies VeniceToolDetails,
          isError: polled.status === "error",
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Video generation failed: ${error?.message ?? String(error)}`,
            },
          ],
          details: {
            status: "error",
            family: "video",
            summary: "Video generation failed",
            error: error?.message ?? String(error),
          } satisfies VeniceToolDetails,
          isError: true,
        };
      }
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("venice_video_generate "));
      if (args.model) text += theme.fg("accent", `${args.model} `);
      if (args.prompt) text += theme.fg("muted", truncate(args.prompt, 56));
      else text += theme.fg("muted", "video job");
      return new Text(text, 0, 0);
    },
    renderResult(result, options, theme) {
      return renderToolSummary(
        "video",
        result,
        options.expanded,
        options.isPartial,
        theme,
      );
    },
  });

  pi.registerTool({
    name: "venice_video_retrieve",
    label: "Venice Video Retrieve",
    description:
      "Retrieve a previously queued Venice video job, optionally poll until completion, save the mp4 locally, and optionally clean up remote storage.",
    parameters: VideoRetrieveParams,
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const disabled = toolFamilyError(runtime, "video");
      if (disabled) {
        return {
          content: [{ type: "text", text: disabled }],
          details: {
            status: "error",
            error: disabled,
            summary: disabled,
          } satisfies VeniceToolDetails,
          isError: true,
        };
      }

      try {
        const polled = await runtime.pollForVideo(
          ctx,
          params.model,
          params.queue_id,
          {
            wait: params.wait ?? true,
            pollIntervalSeconds: params.poll_interval_seconds,
            timeoutSeconds: params.timeout_seconds,
            cleanup: params.cleanup ?? true,
            saveDir: params.save_dir,
          },
          signal,
          onUpdate,
        );

        return {
          content: [
            {
              type: "text",
              text:
                polled.summary +
                (polled.savedFiles?.length
                  ? `\n${polled.savedFiles.map((file: any) => file.path).join("\n")}`
                  : ""),
            },
          ],
          details: {
            status: polled.status,
            model: params.model,
            family: "video",
            queueId: params.queue_id,
            summary: polled.summary,
            savedFiles: polled.savedFiles,
          } satisfies VeniceToolDetails,
          isError: polled.status === "error",
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Video retrieval failed: ${error?.message ?? String(error)}`,
            },
          ],
          details: {
            status: "error",
            model: params.model,
            family: "video",
            queueId: params.queue_id,
            summary: "Video retrieval failed",
            error: error?.message ?? String(error),
          } satisfies VeniceToolDetails,
          isError: true,
        };
      }
    },
    renderCall(args, theme) {
      return new Text(
        theme.fg("toolTitle", theme.bold("venice_video_retrieve ")) +
          theme.fg("accent", `${args.model} `) +
          theme.fg("muted", args.queue_id),
        0,
        0,
      );
    },
    renderResult(result, options, theme) {
      return renderToolSummary(
        "video retrieve",
        result,
        options.expanded,
        options.isPartial,
        theme,
      );
    },
  });

  pi.registerTool({
    name: "venice_video_complete",
    label: "Venice Video Complete",
    description:
      "Delete a previously retrieved Venice video job from remote storage via /video/complete.",
    parameters: VideoCompleteParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const disabled = toolFamilyError(runtime, "video");
      if (disabled) {
        return {
          content: [{ type: "text", text: disabled }],
          details: {
            status: "error",
            error: disabled,
            summary: disabled,
          } satisfies VeniceToolDetails,
          isError: true,
        };
      }

      try {
        await runtime.completeVideo(params.model, params.queue_id, signal);
        const key = makeJobKey(params.model, params.queue_id);
        const next = runtime.getState();
        if (next.videoJobs[key]) {
          next.videoJobs[key].status = "cleaned";
          next.videoJobs[key].updatedAt = Date.now();
          runtime.setState({ ...next, videoJobs: { ...next.videoJobs } });
          runtime.saveState();
          runtime.updateStatus(ctx);
        }
        return {
          content: [
            {
              type: "text",
              text: `Completed Venice video cleanup for ${params.queue_id}`,
            },
          ],
          details: {
            status: "done",
            model: params.model,
            family: "video",
            queueId: params.queue_id,
            summary: `Cleaned remote Venice video job ${params.queue_id}`,
          } satisfies VeniceToolDetails,
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Video cleanup failed: ${error?.message ?? String(error)}`,
            },
          ],
          details: {
            status: "error",
            model: params.model,
            family: "video",
            queueId: params.queue_id,
            summary: "Video cleanup failed",
            error: error?.message ?? String(error),
          } satisfies VeniceToolDetails,
          isError: true,
        };
      }
    },
    renderCall(args, theme) {
      return new Text(
        theme.fg("toolTitle", theme.bold("venice_video_complete ")) +
          theme.fg("accent", `${args.model} `) +
          theme.fg("muted", args.queue_id),
        0,
        0,
      );
    },
    renderResult(result, options, theme) {
      return renderToolSummary(
        "video cleanup",
        result,
        options.expanded,
        options.isPartial,
        theme,
      );
    },
  });
}
