import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

import { veniceFetch } from "../api.ts";
import { resolveAsset } from "../assets.ts";
import {
  ensureToolFamilyEnabled,
  pickDefaultModel,
  renderToolSummary,
  slug,
  truncate,
} from "../helpers.ts";
import { ImageEditParams, ImageMultiEditParams } from "../schemas.ts";
import { saveOutputBuffer } from "../storage.ts";
import type { VeniceToolDetails } from "../types.ts";
import type { VeniceRuntime } from "../runtime.ts";

function toolFamilyError(runtime: VeniceRuntime) {
  return ensureToolFamilyEnabled(runtime.getState(), "edit");
}

export function registerVeniceImageEditTools(
  pi: ExtensionAPI,
  runtime: VeniceRuntime,
) {
  pi.registerTool({
    name: "venice_image_edit",
    label: "Venice Image Edit",
    description:
      "Edit an image with Venice /image/edit. Accepts local file path, URL, data URL, or raw base64 and saves the returned PNG locally.",
    parameters: ImageEditParams,
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const disabled = toolFamilyError(runtime);
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

      const model =
        params.model ?? pickDefaultModel(runtime.getState(), "edit");
      if (!model) {
        const message =
          "No Venice image edit model available. Run /venice-refresh-models first.";
        return {
          content: [{ type: "text", text: message }],
          details: {
            status: "error",
            error: message,
            summary: message,
          } satisfies VeniceToolDetails,
          isError: true,
        };
      }

      onUpdate?.({
        content: [{ type: "text", text: `Editing image with ${model}...` }],
        details: {
          status: "processing",
          model,
          summary: `Editing image with ${model}`,
        },
      });

      try {
        const image = await resolveAsset(params.image, "image", signal);
        const payload: Record<string, any> = {
          model,
          prompt: params.prompt,
          image: image.httpUrl ?? image.rawBase64,
        };
        if (params.aspect_ratio) payload.aspect_ratio = params.aspect_ratio;

        const response = await veniceFetch(
          runtime.getState(),
          "/image/edit",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "image/png, application/octet-stream, application/json",
            },
            body: JSON.stringify(payload),
          },
          signal,
          true,
        );

        const mimeType = response.headers.get("content-type") ?? "image/png";
        const savedFile = await saveOutputBuffer(
          ctx,
          runtime.getState(),
          "images",
          `${slug(model)}-edit-${slug(params.prompt, 32)}`,
          Buffer.from(await response.arrayBuffer()),
          mimeType,
          params.save_dir,
        );

        return {
          content: [
            { type: "text", text: `Edited image saved to ${savedFile.path}` },
          ],
          details: {
            status: "done",
            model,
            family: "edit",
            summary: "Edited image saved",
            savedFiles: [savedFile],
          } satisfies VeniceToolDetails,
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Image edit failed: ${error?.message ?? String(error)}`,
            },
          ],
          details: {
            status: "error",
            model,
            family: "edit",
            summary: "Image edit failed",
            error: error?.message ?? String(error),
          } satisfies VeniceToolDetails,
          isError: true,
        };
      }
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("venice_image_edit "));
      if (args.model) text += theme.fg("accent", `${args.model} `);
      text += theme.fg("muted", truncate(args.prompt, 64));
      return new Text(text, 0, 0);
    },
    renderResult(result, options, theme) {
      return renderToolSummary(
        "image edit",
        result,
        options.expanded,
        options.isPartial,
        theme,
      );
    },
  });

  pi.registerTool({
    name: "venice_image_multi_edit",
    label: "Venice Image Multi Edit",
    description:
      "Edit or composite up to three images with Venice /image/multi-edit and save the returned PNG locally.",
    parameters: ImageMultiEditParams,
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const disabled = toolFamilyError(runtime);
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

      const model =
        params.model ?? pickDefaultModel(runtime.getState(), "edit");
      if (!model) {
        const message =
          "No Venice image edit model available. Run /venice-refresh-models first.";
        return {
          content: [{ type: "text", text: message }],
          details: {
            status: "error",
            error: message,
            summary: message,
          } satisfies VeniceToolDetails,
          isError: true,
        };
      }

      onUpdate?.({
        content: [
          { type: "text", text: `Running multi-edit with ${model}...` },
        ],
        details: {
          status: "processing",
          model,
          summary: `Running multi-edit with ${model}`,
        },
      });

      try {
        const images = await Promise.all(
          params.images.map((value: string) =>
            resolveAsset(value, "image", signal),
          ),
        );

        const response = await veniceFetch(
          runtime.getState(),
          "/image/multi-edit",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "image/png, application/octet-stream, application/json",
            },
            body: JSON.stringify({
              model,
              prompt: params.prompt,
              images: images.map((image) => image.httpUrl ?? image.rawBase64),
            }),
          },
          signal,
          true,
        );

        const mimeType = response.headers.get("content-type") ?? "image/png";
        const savedFile = await saveOutputBuffer(
          ctx,
          runtime.getState(),
          "images",
          `${slug(model)}-multi-edit-${slug(params.prompt, 32)}`,
          Buffer.from(await response.arrayBuffer()),
          mimeType,
          params.save_dir,
        );

        return {
          content: [
            {
              type: "text",
              text: `Multi-edit image saved to ${savedFile.path}`,
            },
          ],
          details: {
            status: "done",
            model,
            family: "edit",
            summary: "Multi-edit image saved",
            savedFiles: [savedFile],
          } satisfies VeniceToolDetails,
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Image multi-edit failed: ${error?.message ?? String(error)}`,
            },
          ],
          details: {
            status: "error",
            model,
            family: "edit",
            summary: "Image multi-edit failed",
            error: error?.message ?? String(error),
          } satisfies VeniceToolDetails,
          isError: true,
        };
      }
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("venice_image_multi_edit "));
      text += theme.fg("accent", `${args.images?.length ?? 0} images `);
      text += theme.fg("muted", truncate(args.prompt, 56));
      return new Text(text, 0, 0);
    },
    renderResult(result, options, theme) {
      return renderToolSummary(
        "image multi-edit",
        result,
        options.expanded,
        options.isPartial,
        theme,
      );
    },
  });
}
