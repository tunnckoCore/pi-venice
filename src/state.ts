import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  DEFAULTABLE_FAMILIES,
  STATE_ENTRY_TYPE,
  USER_CONFIGURABLE_FAMILIES,
  VENICE_BASE_URL,
} from "./constants.ts";
import {
  coercePersistedModel,
  isDefaultableFamily,
  isUserConfigurableFamily,
} from "./helpers.ts";
import { piConfigDir } from "./settings.ts";
import type { DefaultableFamily, VeniceModelInfo, VeniceState } from "./types.ts";

const MODEL_CACHE_PATH = join(
  piConfigDir(),
  "agent",
  "venice-model-cache.json",
);

export function defaultState(): VeniceState {
  return {
    config: {
      baseUrl: VENICE_BASE_URL,
      apiKeyEnv: "VENICE_API_KEY",
      enabledCatalogFamilies: [...USER_CONFIGURABLE_FAMILIES],
      defaults: {},
      output: {
        rootDir: ".pi/venice-output",
      },
      storage: {
        files: {
          adapter: "local",
          local: {
            baseDir: ".pi/venice-output",
          },
        },
      },
      lastRefreshStatus: "never",
    },
    models: [],
    videoJobs: {},
  };
}

export function persistState(pi: ExtensionAPI, state: VeniceState) {
  pi.appendEntry(STATE_ENTRY_TYPE, {
    config: state.config,
    models: state.models,
    videoJobs: state.videoJobs,
  });
  persistModelCache(state);
}

export function persistModelCache(state: VeniceState) {
  try {
    writeFileSync(MODEL_CACHE_PATH, JSON.stringify({ models: state.models }), "utf-8");
  } catch {
    // Silently ignore write failures - this is a best-effort cache
  }
}

export function loadModelCache(): VeniceModelInfo[] | null {
  try {
    if (!existsSync(MODEL_CACHE_PATH)) return null;
    const raw = JSON.parse(readFileSync(MODEL_CACHE_PATH, "utf-8"));
    if (!Array.isArray(raw?.models)) return null;
    return raw.models.map(coercePersistedModel);
  } catch {
    return null;
  }
}

export function latestStateFromEntries(ctx: ExtensionContext): VeniceState {
  let latest: any;
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "custom" && entry.customType === STATE_ENTRY_TYPE) {
      latest = entry.data;
    }
  }

  const next = defaultState();
  if (!latest || typeof latest !== "object") return next;

  const config = latest.config ?? {};

  const rawEnabledFamilies = Array.isArray(config.enabledCatalogFamilies)
    ? config.enabledCatalogFamilies
    : Array.isArray(config.enabledFamilies)
      ? config.enabledFamilies
      : next.config.enabledCatalogFamilies;

  const enabledCatalogFamilies = rawEnabledFamilies.filter((family: string) =>
    isUserConfigurableFamily(family),
  );

  const defaults: Partial<Record<DefaultableFamily, string>> = {};
  for (const family of DEFAULTABLE_FAMILIES) {
    if (typeof config.defaults?.[family] === "string" && isDefaultableFamily(family)) {
      defaults[family] = config.defaults[family];
    }
  }

  next.config = {
    baseUrl:
      typeof config.baseUrl === "string" ? config.baseUrl : next.config.baseUrl,
    apiKeyEnv:
      typeof config.apiKeyEnv === "string" ? config.apiKeyEnv : next.config.apiKeyEnv,
    enabledCatalogFamilies:
      enabledCatalogFamilies.length > 0
        ? enabledCatalogFamilies
        : next.config.enabledCatalogFamilies,
    defaults,
    output: {
      rootDir:
        typeof config.output?.rootDir === "string"
          ? config.output.rootDir
          : next.config.output.rootDir,
    },
    storage: {
      files: {
        adapter:
          config.storage?.files?.adapter === "s3"
            ? "s3"
            : next.config.storage.files.adapter,
        local: {
          baseDir:
            typeof config.storage?.files?.local?.baseDir === "string"
              ? config.storage.files.local.baseDir
              : next.config.storage.files.local.baseDir,
        },
        s3:
          config.storage?.files?.s3 && typeof config.storage.files.s3 === "object"
            ? {
                endpoint:
                  typeof config.storage.files.s3.endpoint === "string"
                    ? config.storage.files.s3.endpoint
                    : undefined,
                bucket:
                  typeof config.storage.files.s3.bucket === "string"
                    ? config.storage.files.s3.bucket
                    : undefined,
                region:
                  typeof config.storage.files.s3.region === "string"
                    ? config.storage.files.s3.region
                    : undefined,
                prefix:
                  typeof config.storage.files.s3.prefix === "string"
                    ? config.storage.files.s3.prefix
                    : undefined,
                forcePathStyle:
                  typeof config.storage.files.s3.forcePathStyle === "boolean"
                    ? config.storage.files.s3.forcePathStyle
                    : undefined,
                publicBaseUrl:
                  typeof config.storage.files.s3.publicBaseUrl === "string"
                    ? config.storage.files.s3.publicBaseUrl
                    : undefined,
                credentials: {
                  accessKeyId:
                    typeof config.storage.files.s3.credentials?.accessKeyId === "string"
                      ? config.storage.files.s3.credentials.accessKeyId
                      : undefined,
                  secretAccessKey:
                    typeof config.storage.files.s3.credentials?.secretAccessKey === "string"
                      ? config.storage.files.s3.credentials.secretAccessKey
                      : undefined,
                  sessionToken:
                    typeof config.storage.files.s3.credentials?.sessionToken === "string"
                      ? config.storage.files.s3.credentials.sessionToken
                      : undefined,
                },
              }
            : next.config.storage.files.s3,
      },
    },
    lastRefreshAt:
      typeof config.lastRefreshAt === "number" ? config.lastRefreshAt : undefined,
    lastRefreshStatus:
      config.lastRefreshStatus === "ok" ||
      config.lastRefreshStatus === "error" ||
      config.lastRefreshStatus === "never"
        ? config.lastRefreshStatus
        : next.config.lastRefreshStatus,
    lastError:
      typeof config.lastError === "string" ? config.lastError : undefined,
  };

  next.models = Array.isArray(latest.models)
    ? latest.models.map(coercePersistedModel)
    : [];

  next.videoJobs =
    latest.videoJobs && typeof latest.videoJobs === "object"
      ? latest.videoJobs
      : {};

  return next;
}
