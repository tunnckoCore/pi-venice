import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

import { refreshVeniceCatalog } from "./catalog.ts";
import { toProviderModels, updateStatus } from "./helpers.ts";
import { streamVenice, VENICE_CHAT_API } from "./transport.ts";
import { VENICE_PROVIDER } from "./constants.ts";
import {
  applySettingsToState,
} from "./settings.ts";
import {
  defaultState,
  latestStateFromEntries,
  persistState,
} from "./state.ts";
import type { VeniceState } from "./types.ts";
import {
  completeVideoJob,
  pollForVideoJob,
  queueVideoJob,
} from "./video-jobs.ts";

export interface VeniceRuntime {
  getState(): VeniceState;
  setState(next: VeniceState): void;
  saveState(): void;
  restoreState(ctx: ExtensionContext): void;
  registerProvider(): void;
  updateStatus(ctx: ExtensionContext): void;
  refreshModels(ctx?: ExtensionContext, silent?: boolean): Promise<number>;
  queueVideo(
    ctx: ExtensionContext,
    params: any,
    signal?: AbortSignal,
  ): Promise<{ model: string; queueId: string }>;
  pollForVideo(
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
    signal?: AbortSignal,
    onUpdate?: (result: any) => void,
  ): Promise<{ status: string; summary: string; savedFiles?: any[] }>;
  completeVideo(
    model: string,
    queueId: string,
    signal?: AbortSignal,
  ): Promise<void>;
}

export function createVeniceRuntime(pi: ExtensionAPI): VeniceRuntime {
  let state = defaultState();

  const runtime: VeniceRuntime = {
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    saveState: () => {
      persistState(pi, state);
    },
    restoreState: (ctx) => {
      state = latestStateFromEntries(ctx);
      state = applySettingsToState(state, ctx.cwd);
      runtime.registerProvider();
      runtime.updateStatus(ctx);
    },
    registerProvider: () => {
      pi.registerProvider(VENICE_PROVIDER, {
        baseUrl: state.config.baseUrl,
        apiKey: state.config.apiKeyEnv,
        authHeader: true,
        api: VENICE_CHAT_API,
        streamSimple: streamVenice,
        models: toProviderModels(state),
      });
    },
    updateStatus: (ctx) => {
      updateStatus(ctx, state);
    },
    refreshModels: async (ctx, silent = false) => {
      state = await refreshVeniceCatalog(state);
      runtime.registerProvider();
      runtime.saveState();
      if (ctx) runtime.updateStatus(ctx);
      return state.models.length;
    },
    queueVideo: async (ctx, params, signal) =>
      queueVideoJob(
        ctx,
        params,
        {
          getState: () => state,
          setState: (next) => {
            state = next;
          },
          saveState: runtime.saveState,
          updateStatus: runtime.updateStatus,
        },
        signal,
      ),
    pollForVideo: async (ctx, model, queueId, options, signal, onUpdate) =>
      pollForVideoJob(
        ctx,
        model,
        queueId,
        options,
        {
          getState: () => state,
          setState: (next) => {
            state = next;
          },
          saveState: runtime.saveState,
          updateStatus: runtime.updateStatus,
        },
        signal,
        onUpdate,
      ),
    completeVideo: async (model, queueId, signal) =>
      completeVideoJob(state, model, queueId, signal),
  };

  return runtime;
}
