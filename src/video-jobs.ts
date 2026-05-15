import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import { veniceFetch, veniceJson } from "./api.ts";
import { resolveAsset } from "./assets.ts";
import { makeJobKey, pickDefaultModel, slug } from "./helpers.ts";
import { saveOutputBuffer } from "./storage.ts";
import type { SavedFile, VeniceState } from "./types.ts";

interface VideoRuntimeDeps {
  getState(): VeniceState;
  setState(next: VeniceState): void;
  saveState(): void;
  updateStatus(ctx: ExtensionContext): void;
}

export async function queueVideoJob(
  ctx: ExtensionContext,
  params: any,
  deps: VideoRuntimeDeps,
  signal?: AbortSignal,
): Promise<{ model: string; queueId: string }> {
  const state = deps.getState();
  const model = params.model ?? pickDefaultModel(state, "video");
  if (!model) {
    throw new Error(
      "No Venice video model available. Run /venice-refresh-models first.",
    );
  }

  const payload: Record<string, any> = { model };
  if (params.prompt) payload.prompt = params.prompt;
  if (params.negative_prompt) payload.negative_prompt = params.negative_prompt;
  if (params.duration) payload.duration = params.duration;
  if (params.aspect_ratio) payload.aspect_ratio = params.aspect_ratio;
  if (params.resolution) payload.resolution = params.resolution;
  if (params.upscale_factor) payload.upscale_factor = params.upscale_factor;
  if (typeof params.audio === "boolean") payload.audio = params.audio;

  if (params.image) {
    const image = await resolveAsset(params.image, "image", signal);
    payload.image_url = image.httpUrl ?? image.dataUrl;
  }
  if (params.end_image) {
    const endImage = await resolveAsset(params.end_image, "image", signal);
    payload.end_image_url = endImage.httpUrl ?? endImage.dataUrl;
  }
  if (params.audio_input) {
    const audio = await resolveAsset(params.audio_input, "audio", signal);
    payload.audio_url = audio.httpUrl ?? audio.dataUrl;
  }
  if (params.video_input) {
    const video = await resolveAsset(params.video_input, "video", signal);
    payload.video_url = video.httpUrl ?? video.dataUrl;
  }
  if (
    Array.isArray(params.reference_images) &&
    params.reference_images.length > 0
  ) {
    payload.reference_image_urls = await Promise.all(
      params.reference_images.map(async (value: string) => {
        const image = await resolveAsset(value, "image", signal);
        return image.httpUrl ?? image.dataUrl;
      }),
    );
  }

  const data = await veniceJson(state, "/video/queue", payload, signal, true);
  const queueId = String(data?.queue_id ?? "");
  if (!queueId)
    throw new Error("Venice video queue did not return a queue_id.");

  deps.setState({
    ...deps.getState(),
    videoJobs: {
      ...deps.getState().videoJobs,
      [makeJobKey(model, queueId)]: {
        queueId,
        model,
        prompt: params.prompt,
        status: "queued",
        updatedAt: Date.now(),
      },
    },
  });
  deps.saveState();
  deps.updateStatus(ctx);

  return { model, queueId };
}

export async function completeVideoJob(
  state: VeniceState,
  model: string,
  queueId: string,
  signal?: AbortSignal,
): Promise<void> {
  await veniceJson(
    state,
    "/video/complete",
    { model, queue_id: queueId },
    signal,
    true,
  );
}

async function retrieveVideoOnce(
  state: VeniceState,
  model: string,
  queueId: string,
  signal?: AbortSignal,
): Promise<
  | { status: "processing"; data: any }
  | { status: "done"; data: Buffer; mimeType: string }
> {
  const response = await veniceFetch(
    state,
    "/video/retrieve",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, video/mp4, application/octet-stream",
      },
      body: JSON.stringify({
        model,
        queue_id: queueId,
        delete_media_on_completion: false,
      }),
    },
    signal,
    true,
  );

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return { status: "processing", data: await response.json() };
  }

  return {
    status: "done",
    data: Buffer.from(await response.arrayBuffer()),
    mimeType: contentType || "video/mp4",
  };
}

export async function pollForVideoJob(
  ctx: ExtensionContext,
  model: string,
  queueId: string,
  options: {
    wait?: boolean;
    pollIntervalSeconds?: number;
    timeoutSeconds?: number;
    cleanup?: boolean;
    saveDir?: string;
  },
  deps: VideoRuntimeDeps,
  signal?: AbortSignal,
  onUpdate?: (result: any) => void,
): Promise<{
  status: string;
  savedFiles?: SavedFile[];
  summary: string;
}> {
  const wait = options.wait ?? true;
  const pollMs = Math.max(1000, (options.pollIntervalSeconds ?? 8) * 1000);
  const timeoutMs = Math.max(5000, (options.timeoutSeconds ?? 240) * 1000);
  const started = Date.now();

  if (!wait) {
    return {
      status: "queued",
      summary: `Video queued: ${queueId}`,
    };
  }

  while (Date.now() - started < timeoutMs) {
    const currentState = deps.getState();
    const step = await retrieveVideoOnce(currentState, model, queueId, signal);
    if (step.status === "done") {
      const savedFile = await saveOutputBuffer(
        ctx,
        currentState,
        "videos",
        `${slug(model)}-${queueId}`,
        step.data,
        step.mimeType,
        options.saveDir,
      );

      deps.setState({
        ...deps.getState(),
        videoJobs: {
          ...deps.getState().videoJobs,
          [makeJobKey(model, queueId)]: {
            queueId,
            model,
            prompt:
              deps.getState().videoJobs[makeJobKey(model, queueId)]?.prompt,
            status: "done",
            savedPath: savedFile.path,
            updatedAt: Date.now(),
          },
        },
      });

      if (options.cleanup ?? true) {
        try {
          await completeVideoJob(deps.getState(), model, queueId, signal);
          const next = deps.getState();
          if (next.videoJobs[makeJobKey(model, queueId)]) {
            next.videoJobs[makeJobKey(model, queueId)].status = "cleaned";
            deps.setState({ ...next, videoJobs: { ...next.videoJobs } });
          }
        } catch {
          // keep successful download even if cleanup fails
        }
      }

      deps.saveState();
      deps.updateStatus(ctx);

      return {
        status: "done",
        savedFiles: [savedFile],
        summary: `Video ready: ${savedFile.path}`,
      };
    }

    deps.setState({
      ...deps.getState(),
      videoJobs: {
        ...deps.getState().videoJobs,
        [makeJobKey(model, queueId)]: {
          queueId,
          model,
          prompt: deps.getState().videoJobs[makeJobKey(model, queueId)]?.prompt,
          status: "processing",
          updatedAt: Date.now(),
          lastKnownEtaMs:
            typeof step.data?.average_execution_time === "number"
              ? step.data.average_execution_time
              : undefined,
        },
      },
    });
    deps.saveState();
    deps.updateStatus(ctx);

    onUpdate?.({
      content: [
        { type: "text", text: `Video job ${queueId} is still processing...` },
      ],
      details: {
        status: "processing",
        queueId,
        summary: `Video job ${queueId} is still processing`,
      },
    });

    await new Promise((resolvePromise) => setTimeout(resolvePromise, pollMs));
  }

  deps.saveState();
  deps.updateStatus(ctx);

  return {
    status: "processing",
    summary: `Video job ${queueId} is still processing. Re-run venice_video_retrieve with model=${model} queue_id=${queueId}.`,
  };
}
