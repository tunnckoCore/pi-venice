import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

import { veniceFetch, veniceJson } from "../api.ts";
import { resolveAsset } from "../assets.ts";
import {
  ensureToolFamilyEnabled,
  pickDefaultModel,
  renderToolSummary,
  slug,
  truncate,
} from "../helpers.ts";
import {
  BackgroundRemoveParams,
  ImageGenerateParams,
  ImageUpscaleParams,
} from "../schemas.ts";
import { saveOutputBase64, saveOutputBuffer } from "../storage.ts";
import type { SavedFile, VeniceToolDetails } from "../types.ts";
import type { VeniceRuntime } from "../runtime.ts";

function toolFamilyError(runtime: VeniceRuntime, family: "image" | "upscale") {
  return ensureToolFamilyEnabled(runtime.getState(), family);
}

export function registerVeniceImageTools(
  pi: ExtensionAPI,
  runtime: VeniceRuntime,
) {
  pi.registerTool({
    name: "venice_image_generate",
    label: "Venice Image Generate",
    description:
      "Generate one or more images with Venice /image/generate, save them locally, and return the saved file paths.",
    parameters: ImageGenerateParams,
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const disabled = toolFamilyError(runtime, "image");
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
        params.model ?? pickDefaultModel(runtime.getState(), "image");
      if (!model) {
        const message =
          "No Venice image model available. Run /venice-refresh-models first.";
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
        content: [{ type: "text", text: `Generating image with ${model}...` }],
        details: {
          status: "processing",
          model,
          summary: `Generating image with ${model}`,
        },
      });

      try {
        const payload: Record<string, any> = {
          model,
          prompt: params.prompt,
          return_binary: false,
        };
        if (params.negative_prompt)
          payload.negative_prompt = params.negative_prompt;
        if (params.width) payload.width = params.width;
        if (params.height) payload.height = params.height;
        if (params.format) payload.format = params.format;
        if (params.variants) payload.variants = params.variants;
        if (typeof params.safe_mode === "boolean") {
          payload.safe_mode = params.safe_mode;
        }

        const data = await veniceJson(
          runtime.getState(),
          "/image/generate",
          payload,
          signal,
          true,
        );
        const images = Array.isArray(data?.images) ? data.images : [];
        const format = params.format ?? "webp";
        const mimeType = `image/${format}`;
        const baseName = `${slug(model)}-${slug(params.prompt, 32) || "image"}`;
        const savedFiles: SavedFile[] = [];

        for (let index = 0; index < images.length; index++) {
          savedFiles.push(
            await saveOutputBase64(
              ctx,
              runtime.getState(),
              "images",
              `${baseName}-${index + 1}`,
              images[index],
              mimeType,
              params.save_dir,
            ),
          );
        }

        const summary = `Generated ${savedFiles.length} image(s)`;
        return {
          content: [
            {
              type: "text",
              text: `${summary} with ${model}\n${savedFiles.map((file) => file.path).join("\n")}`,
            },
          ],
          details: {
            status: "done",
            model,
            family: "image",
            summary,
            savedFiles,
            timing: data?.timing,
            count: savedFiles.length,
          } satisfies VeniceToolDetails,
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Image generation failed: ${error?.message ?? String(error)}`,
            },
          ],
          details: {
            status: "error",
            model,
            family: "image",
            summary: "Image generation failed",
            error: error?.message ?? String(error),
          } satisfies VeniceToolDetails,
          isError: true,
        };
      }
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("venice_image_generate "));
      if (args.model) text += theme.fg("accent", `${args.model} `);
      text += theme.fg("muted", truncate(args.prompt, 64));
      return new Text(text, 0, 0);
    },
    renderResult(result, options, theme) {
      return renderToolSummary(
        "image",
        result,
        options.expanded,
        options.isPartial,
        theme,
      );
    },
  });

  pi.registerTool({
    name: "venice_image_upscale",
    label: "Venice Image Upscale",
    description:
      "Upscale or enhance an image with Venice /image/upscale and save the returned image locally.",
    parameters: ImageUpscaleParams,
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const disabled = toolFamilyError(runtime, "upscale");
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

      onUpdate?.({
        content: [{ type: "text", text: "Upscaling image..." }],
        details: {
          status: "processing",
          family: "upscale",
          summary: "Upscaling image",
        },
      });

      try {
        const image = await resolveAsset(params.image, "image", signal, true);
        const payload: Record<string, any> = { image: image.rawBase64 };
        if (params.scale !== undefined) payload.scale = params.scale;
        if (params.enhance !== undefined) payload.enhance = params.enhance;
        if (params.enhance_creativity !== undefined) {
          payload.enhanceCreativity = params.enhance_creativity;
        }
        if (params.enhance_prompt)
          payload.enhancePrompt = params.enhance_prompt;
        if (params.replication !== undefined)
          payload.replication = params.replication;

        const response = await veniceFetch(
          runtime.getState(),
          "/image/upscale",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept:
                "image/png, image/jpeg, image/webp, application/octet-stream, application/json",
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
          `upscaled-${slug(params.image, 28)}`,
          Buffer.from(await response.arrayBuffer()),
          mimeType,
          params.save_dir,
        );

        return {
          content: [
            { type: "text", text: `Upscaled image saved to ${savedFile.path}` },
          ],
          details: {
            status: "done",
            family: "upscale",
            summary: "Upscaled image saved",
            savedFiles: [savedFile],
          } satisfies VeniceToolDetails,
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Image upscale failed: ${error?.message ?? String(error)}`,
            },
          ],
          details: {
            status: "error",
            family: "upscale",
            summary: "Image upscale failed",
            error: error?.message ?? String(error),
          } satisfies VeniceToolDetails,
          isError: true,
        };
      }
    },
    renderCall(_args, theme) {
      return new Text(
        theme.fg("toolTitle", theme.bold("venice_image_upscale ")) +
          theme.fg("muted", "image"),
        0,
        0,
      );
    },
    renderResult(result, options, theme) {
      return renderToolSummary(
        "image upscale",
        result,
        options.expanded,
        options.isPartial,
        theme,
      );
    },
  });

  pi.registerTool({
    name: "venice_background_remove",
    label: "Venice Background Remove",
    description:
      "Remove the background from an image with Venice /image/background-remove and save the returned image locally.",
    parameters: BackgroundRemoveParams,
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const disabled = toolFamilyError(runtime, "image");
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

      onUpdate?.({
        content: [{ type: "text", text: "Removing image background..." }],
        details: {
          status: "processing",
          summary: "Removing image background",
        },
      });

      try {
        const image = await resolveAsset(params.image, "image", signal);
        const payload: Record<string, any> = image.httpUrl
          ? { image_url: image.httpUrl }
          : { image: image.rawBase64 };

        const response = await veniceFetch(
          runtime.getState(),
          "/image/background-remove",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept:
                "image/png, image/webp, image/jpeg, application/octet-stream, application/json",
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
          `background-removed-${slug(params.image, 28)}`,
          Buffer.from(await response.arrayBuffer()),
          mimeType,
          params.save_dir,
        );

        return {
          content: [
            {
              type: "text",
              text: `Background-removed image saved to ${savedFile.path}`,
            },
          ],
          details: {
            status: "done",
            summary: "Background removed image saved",
            savedFiles: [savedFile],
          } satisfies VeniceToolDetails,
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Background removal failed: ${error?.message ?? String(error)}`,
            },
          ],
          details: {
            status: "error",
            summary: "Background removal failed",
            error: error?.message ?? String(error),
          } satisfies VeniceToolDetails,
          isError: true,
        };
      }
    },
    renderCall(_args, theme) {
      return new Text(
        theme.fg("toolTitle", theme.bold("venice_background_remove ")) +
          theme.fg("muted", "image"),
        0,
        0,
      );
    },
    renderResult(result, options, theme) {
      return renderToolSummary(
        "background remove",
        result,
        options.expanded,
        options.isPartial,
        theme,
      );
    },
  });
}
