import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { USER_CONFIGURABLE_FAMILIES, VENICE_BASE_URL } from "./constants.ts";
import { isDefaultableFamily, isUserConfigurableFamily } from "./helpers.ts";
import type { DefaultableFamily, VeniceState } from "./types.ts";

interface PiVeniceSettings {
  apiKeyEnv?: string;
  baseUrl?: string;
  families?: {
    enabled?: string[];
    defaults?: Record<string, string>;
  };
  output?: {
    rootDir?: string;
  };
  storage?: {
    files?: {
      adapter?: "local" | "s3";
      local?: {
        baseDir?: string;
      };
      s3?: {
        endpoint?: string;
        bucket?: string;
        region?: string;
        prefix?: string;
        forcePathStyle?: boolean;
        publicBaseUrl?: string;
        credentials?: {
          accessKeyId?: string;
          secretAccessKey?: string;
          sessionToken?: string;
        };
      };
    };
  };
}

/**
 * Better default resolving that Pi's internal `getAgetnDir`
 *
 * @returns correct pi agent dir with support for XDG
 */
export function piAgentDir(): string {
  const agentDir = process.env.PI_CODING_AGENT_DIR;
  if (agentDir && agentDir.length > 0) {
    if (agentDir === "~") {
      return homedir();
    }

    const hasTilde = agentDir.startsWith("~/");
    if (hasTilde) {
      return join(homedir(), agentDir.slice(1));
    }

    return agentDir;
  }

  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg && xdg.length > 0) {
    const piDir = join(xdg, "pi", "agent");
    const hasDir = existsSync(piDir);
    if (hasDir) {
      return piDir;
    }
  }

  return join(homedir(), ".pi", "agent");
}

function readJsonIfExists(path: string): any {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return {};
  }
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepMerge<T>(base: T, override: any): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return (override ?? base) as T;
  }

  const result: Record<string, any> = { ...(base as any) };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const previous = result[key];
    if (isPlainObject(previous) && isPlainObject(value)) {
      result[key] = deepMerge(previous, value);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

function expandHome(path: string): string {
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  if (path === "~") return homedir();
  return path;
}

function resolveMaybeRelative(
  path: string | undefined,
  baseDir: string,
): string | undefined {
  if (!path) return undefined;
  const expanded = expandHome(path);
  if (expanded.startsWith("/")) return expanded;
  return resolve(baseDir, expanded);
}

export function resolveSecretReference(
  raw: string | undefined,
): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  if (trimmed.startsWith("env:")) {
    return process.env[trimmed.slice(4)] || undefined;
  }

  return trimmed;
}

function normalizeScopedSettings(
  scoped: PiVeniceSettings,
  baseDir: string,
): PiVeniceSettings {
  return {
    ...scoped,
    output: {
      ...scoped.output,
      rootDir: resolveMaybeRelative(scoped.output?.rootDir, baseDir),
    },
    storage: {
      ...scoped.storage,
      files: {
        ...scoped.storage?.files,
        local: {
          ...scoped.storage?.files?.local,
          baseDir: resolveMaybeRelative(
            scoped.storage?.files?.local?.baseDir,
            baseDir,
          ),
        },
      },
    },
  };
}

export function loadPiVeniceSettings(cwd: string): PiVeniceSettings {
  const globalAgentDir = piAgentDir();
  const globalPath = join(globalAgentDir, "settings.json");
  const projectPath = resolve(cwd, ".pi", "settings.json");

  const globalScoped = normalizeScopedSettings(
    (readJsonIfExists(globalPath)?.["pi-venice"] ?? {}) as PiVeniceSettings,
    globalAgentDir,
  );
  const projectScoped = normalizeScopedSettings(
    (readJsonIfExists(projectPath)?.["pi-venice"] ?? {}) as PiVeniceSettings,
    resolve(cwd, ".pi"),
  );

  return deepMerge(globalScoped, projectScoped);
}

export function applySettingsToState(
  state: VeniceState,
  cwd: string,
): VeniceState {
  const merged = loadPiVeniceSettings(cwd);
  const next: VeniceState = {
    ...state,
    config: {
      ...state.config,
      baseUrl: merged.baseUrl ?? state.config.baseUrl ?? VENICE_BASE_URL,
      apiKeyEnv: merged.apiKeyEnv ?? state.config.apiKeyEnv,
      enabledCatalogFamilies: Array.isArray(merged.families?.enabled)
        ? merged.families.enabled.filter(
            (
              family,
            ): family is VeniceState["config"]["enabledCatalogFamilies"][number] =>
              isUserConfigurableFamily(family),
          )
        : state.config.enabledCatalogFamilies,
      defaults: { ...state.config.defaults },
      output: {
        ...state.config.output,
        rootDir: merged.output?.rootDir ?? state.config.output.rootDir,
      },
      storage: {
        files: {
          adapter:
            merged.storage?.files?.adapter ??
            state.config.storage.files.adapter,
          local: {
            baseDir:
              merged.storage?.files?.local?.baseDir ??
              state.config.storage.files.local.baseDir,
          },
          s3: {
            ...state.config.storage.files.s3,
            endpoint:
              merged.storage?.files?.s3?.endpoint ??
              state.config.storage.files.s3?.endpoint,
            bucket:
              merged.storage?.files?.s3?.bucket ??
              state.config.storage.files.s3?.bucket,
            region:
              merged.storage?.files?.s3?.region ??
              state.config.storage.files.s3?.region,
            prefix:
              merged.storage?.files?.s3?.prefix ??
              state.config.storage.files.s3?.prefix,
            forcePathStyle:
              merged.storage?.files?.s3?.forcePathStyle ??
              state.config.storage.files.s3?.forcePathStyle,
            publicBaseUrl:
              merged.storage?.files?.s3?.publicBaseUrl ??
              state.config.storage.files.s3?.publicBaseUrl,
            credentials: {
              accessKeyId:
                merged.storage?.files?.s3?.credentials?.accessKeyId ??
                state.config.storage.files.s3?.credentials?.accessKeyId,
              secretAccessKey:
                merged.storage?.files?.s3?.credentials?.secretAccessKey ??
                state.config.storage.files.s3?.credentials?.secretAccessKey,
              sessionToken:
                merged.storage?.files?.s3?.credentials?.sessionToken ??
                state.config.storage.files.s3?.credentials?.sessionToken,
            },
          },
        },
      },
    },
  };

  if (
    Array.isArray(merged.families?.enabled) &&
    next.config.enabledCatalogFamilies.length === 0
  ) {
    next.config.enabledCatalogFamilies = [...USER_CONFIGURABLE_FAMILIES];
  }

  const defaults = merged.families?.defaults ?? {};
  for (const [family, modelId] of Object.entries(defaults)) {
    if (isDefaultableFamily(family) && typeof modelId === "string") {
      next.config.defaults[family as DefaultableFamily] = modelId;
    }
  }

  return next;
}
