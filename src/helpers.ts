import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

import {
  CATALOG_FAMILIES,
  DEFAULTABLE_FAMILIES,
  IMPLEMENTED_PROVIDER_FAMILIES,
  IMPLEMENTED_TOOL_FAMILIES,
  USER_CONFIGURABLE_FAMILIES,
} from "./constants.ts";
import type {
  DefaultableFamily,
  ImplementedFamily,
  SavedFile,
  VeniceFamily,
  VeniceModelInfo,
  VeniceState,
  VeniceToolDetails,
} from "./types.ts";

export function truncate(value: string, max = 72): string {
  if (value.length <= max) return value;
  return value.slice(0, Math.max(1, max - 3)) + "...";
}

export function slug(value: string, max = 48): string {
  const out = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);
  return out || "venice";
}

export function makeJobKey(model: string, queueId: string): string {
  return `${model}:${queueId}`;
}

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function isDataUrl(value: string): boolean {
  return /^data:/i.test(value);
}

export function seemsBase64(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 64) return false;
  return /^[A-Za-z0-9+/=\s]+$/.test(trimmed);
}

export function familyFromRawType(type: string | undefined): VeniceFamily {
  switch (type) {
    case "text":
      return "text";
    case "image":
      return "image";
    case "inpaint":
      return "edit";
    case "upscale":
      return "upscale";
    case "video":
      return "video";
    case "music":
      return "music";
    case "tts":
      return "tts";
    case "asr":
      return "asr";
    case "embedding":
      return "embedding";
    case "audio":
      return "audio";
    default:
      return "unknown";
  }
}

export function isCatalogFamily(value: string): value is VeniceFamily {
  return (CATALOG_FAMILIES as readonly string[]).includes(value);
}

export function isUserConfigurableFamily(
  value: string,
): value is Exclude<VeniceFamily, "unknown"> {
  return (USER_CONFIGURABLE_FAMILIES as readonly string[]).includes(value);
}

export function isDefaultableFamily(value: string): value is DefaultableFamily {
  return (DEFAULTABLE_FAMILIES as readonly string[]).includes(value);
}

export function isImplementedProviderFamily(
  value: VeniceFamily,
): value is ImplementedFamily {
  return (IMPLEMENTED_PROVIDER_FAMILIES as readonly string[]).includes(value);
}

export function isImplementedToolFamily(
  value: VeniceFamily,
): value is ImplementedFamily {
  return (IMPLEMENTED_TOOL_FAMILIES as readonly string[]).includes(value);
}

export function getEnabledToolFamilies(state: VeniceState): VeniceFamily[] {
  return state.config.enabledCatalogFamilies.filter((family) =>
    isImplementedToolFamily(family),
  );
}

export function getEnabledButNotActionableFamilies(
  state: VeniceState,
): VeniceFamily[] {
  return state.config.enabledCatalogFamilies.filter(
    (family) =>
      !isImplementedToolFamily(family) && !isImplementedProviderFamily(family),
  );
}

export function ensureToolFamilyEnabled(
  state: VeniceState,
  family: VeniceFamily,
): string | undefined {
  if (!state.config.enabledCatalogFamilies.includes(family)) {
    return `Venice family '${family}' is disabled. Enable it with /venice-families.`;
  }
  if (!isImplementedToolFamily(family)) {
    return `Venice family '${family}' exists in the Venice catalog but is not implemented as a Pi tool yet.`;
  }
  return undefined;
}

export function mimeFromExtension(
  filePath: string,
  fallback = "application/octet-stream",
): string {
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg"))
    return "image/jpeg";
  if (filePath.endsWith(".webp")) return "image/webp";
  if (filePath.endsWith(".gif")) return "image/gif";
  if (filePath.endsWith(".mp4")) return "video/mp4";
  if (filePath.endsWith(".mov")) return "video/quicktime";
  if (filePath.endsWith(".webm")) return "video/webm";
  if (filePath.endsWith(".wav")) return "audio/wav";
  if (filePath.endsWith(".mp3")) return "audio/mpeg";
  if (filePath.endsWith(".ogg")) return "audio/ogg";
  if (filePath.endsWith(".flac")) return "audio/flac";
  if (filePath.endsWith(".m4a")) return "audio/mp4";
  return fallback;
}

export function extensionFromMime(mimeType: string, fallback = ".bin"): string {
  if (mimeType.includes("png")) return ".png";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return ".jpg";
  if (mimeType.includes("webp")) return ".webp";
  if (mimeType.includes("gif")) return ".gif";
  if (mimeType.includes("mp4")) return ".mp4";
  if (mimeType.includes("quicktime")) return ".mov";
  if (mimeType.includes("webm")) return ".webm";
  if (mimeType.includes("json")) return ".json";
  return fallback;
}

export function parseDataUrl(value: string): {
  mimeType: string;
  base64: string;
} {
  const match = value.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) {
    throw new Error("Invalid data URL input.");
  }
  return {
    mimeType: match[1],
    base64: match[2],
  };
}

export function getCountsByFamily(
  models: VeniceModelInfo[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const model of models) {
    counts[model.family] = (counts[model.family] || 0) + 1;
  }
  return counts;
}

export function costNumber(value: any): number {
  return typeof value === "number" ? value : 0;
}

export function normalizeModel(raw: any): VeniceModelInfo {
  const spec = raw?.model_spec ?? {};
  const capabilities = spec.capabilities ?? {};

  return {
    id: String(raw?.id ?? "unknown"),
    name: String(spec?.name ?? raw?.id ?? "Unknown model"),
    type: String(raw?.type ?? "unknown"),
    family: familyFromRawType(raw?.type),
    description:
      typeof spec?.description === "string" ? spec.description : undefined,
    traits: Array.isArray(spec?.traits)
      ? spec.traits.map((trait: any) => String(trait))
      : [],
    privacy: typeof spec?.privacy === "string" ? spec.privacy : undefined,
    offline: Boolean(spec?.offline),
    beta: Boolean(spec?.betaModel),
    contextWindow:
      typeof spec?.availableContextTokens === "number"
        ? spec.availableContextTokens
        : undefined,
    maxTokens:
      typeof spec?.maxCompletionTokens === "number"
        ? spec.maxCompletionTokens
        : undefined,
    pricing:
      spec?.pricing && typeof spec.pricing === "object"
        ? spec.pricing
        : undefined,
    constraints:
      spec?.constraints && typeof spec.constraints === "object"
        ? spec.constraints
        : undefined,
    supportsVision: Boolean(capabilities?.supportsVision),
    supportsVideoInput: Boolean(capabilities?.supportsVideoInput),
    supportsAudioInput: Boolean(capabilities?.supportsAudioInput),
    supportsFunctionCalling: Boolean(capabilities?.supportsFunctionCalling),
    supportsReasoning: Boolean(capabilities?.supportsReasoning),
    supportsReasoningEffort: Boolean(capabilities?.supportsReasoningEffort),
    supportsMultipleImages: Boolean(capabilities?.supportsMultipleImages),
    supportsE2EE: Boolean(capabilities?.supportsE2EE),
    supportsTeeAttestation: Boolean(capabilities?.supportsTeeAttestation),
    optimizedForCode: Boolean(capabilities?.optimizedForCode),
  };
}

export function coercePersistedModel(raw: any): VeniceModelInfo {
  if (raw?.model_spec) return normalizeModel(raw);

  return {
    id: String(raw?.id ?? "unknown"),
    name: String(raw?.name ?? raw?.id ?? "Unknown model"),
    type: String(raw?.type ?? raw?.family ?? "unknown"),
    family:
      typeof raw?.family === "string"
        ? familyFromRawType(raw.family === "edit" ? "inpaint" : raw.family)
        : familyFromRawType(raw?.type),
    description:
      typeof raw?.description === "string" ? raw.description : undefined,
    traits: Array.isArray(raw?.traits)
      ? raw.traits.map((trait: any) => String(trait))
      : [],
    privacy: typeof raw?.privacy === "string" ? raw.privacy : undefined,
    offline: Boolean(raw?.offline),
    beta: Boolean(raw?.beta),
    contextWindow:
      typeof raw?.contextWindow === "number" ? raw.contextWindow : undefined,
    maxTokens: typeof raw?.maxTokens === "number" ? raw.maxTokens : undefined,
    pricing:
      raw?.pricing && typeof raw.pricing === "object" ? raw.pricing : undefined,
    constraints:
      raw?.constraints && typeof raw.constraints === "object"
        ? raw.constraints
        : undefined,
    supportsVision: Boolean(raw?.supportsVision),
    supportsVideoInput: Boolean(raw?.supportsVideoInput),
    supportsAudioInput: Boolean(raw?.supportsAudioInput),
    supportsFunctionCalling: Boolean(raw?.supportsFunctionCalling),
    supportsReasoning: Boolean(raw?.supportsReasoning),
    supportsReasoningEffort: Boolean(raw?.supportsReasoningEffort),
    supportsMultipleImages: Boolean(raw?.supportsMultipleImages),
    supportsE2EE: Boolean(raw?.supportsE2EE),
    supportsTeeAttestation: Boolean(raw?.supportsTeeAttestation),
    optimizedForCode: Boolean(raw?.optimizedForCode),
  };
}

export function pickDefaultModel(
  state: VeniceState,
  family: DefaultableFamily,
): string | undefined {
  const configured = state.config.defaults[family];
  if (
    configured &&
    state.models.some(
      (model) => model.family === family && model.id === configured,
    )
  ) {
    return configured;
  }

  const familyModels = state.models.filter((model) => model.family === family);
  if (familyModels.length === 0) return undefined;

  const preferred = familyModels.find((model) =>
    model.traits.some((trait) => trait.toLowerCase().includes("default")),
  );

  return preferred?.id ?? familyModels[0].id;
}

export function toProviderModels(state: VeniceState): any[] {
  if (!state.config.enabledCatalogFamilies.includes("text")) return [];

  return state.models
    .filter((model) => model.family === "text" && !model.offline)
    .map((model) => ({
      id: model.id,
      name: model.name,
      reasoning: Boolean(model.supportsReasoning),
      input:
        !model.supportsE2EE &&
        (model.supportsVision || model.supportsMultipleImages)
          ? (["text", "image"] as const)
          : (["text"] as const),
      cost: {
        input: costNumber(model.pricing?.input?.usd),
        output: costNumber(model.pricing?.output?.usd),
        cacheRead: costNumber(model.pricing?.cache_input?.usd),
        cacheWrite: costNumber(model.pricing?.cache_write?.usd),
      },
      contextWindow: model.contextWindow ?? 32768,
      maxTokens: model.maxTokens ?? 8192,
      compat: {
        supportsDeveloperRole: false,
        supportsReasoningEffort: Boolean(model.supportsReasoningEffort),
      },
    }));
}

export function renderSavedFiles(
  files: SavedFile[] | undefined,
  expanded: boolean,
  theme: any,
): string {
  if (!files || files.length === 0) return "";
  const visible = expanded ? files : files.slice(0, 1);
  let text = "";
  for (const file of visible) {
    text += `\n${theme.fg("muted", file.path)}`;
  }
  if (!expanded && files.length > 1) {
    text += `\n${theme.fg("dim", `... ${files.length - 1} more`)}`;
  }
  return text;
}

export function renderToolSummary(
  title: string,
  result: any,
  expanded: boolean,
  isPartial: boolean,
  theme: any,
): Text {
  const details = (result.details ?? {}) as VeniceToolDetails;
  if (
    isPartial ||
    details.status === "processing" ||
    details.status === "queued"
  ) {
    let text = theme.fg("warning", `${title}: ${details.status || "working"}`);
    if (details.queueId) text += theme.fg("dim", ` · ${details.queueId}`);
    return new Text(text, 0, 0);
  }

  if (details.error || result.isError) {
    const message =
      details.error || (result.content?.[0]?.text ?? "Request failed");
    return new Text(theme.fg("error", `${title}: ${message}`), 0, 0);
  }

  let text = theme.fg("success", details.summary || `${title}: done`);
  if (details.model) text += theme.fg("dim", ` · ${details.model}`);
  if (details.quote !== undefined)
    text += theme.fg("dim", ` · quote $${details.quote}`);
  if (details.queueId) text += theme.fg("dim", ` · ${details.queueId}`);
  text += renderSavedFiles(details.savedFiles, expanded, theme);
  return new Text(text, 0, 0);
}

export function buildModelListing(
  models: VeniceModelInfo[],
  family: string,
  limit: number,
  reasoningOnly = false,
  visionOnly = false,
): { text: string; count: number } {
  let filtered = models;
  if (family !== "all")
    filtered = filtered.filter((model) => model.family === family);
  if (reasoningOnly)
    filtered = filtered.filter((model) => model.supportsReasoning);
  if (visionOnly) filtered = filtered.filter((model) => model.supportsVision);

  filtered = [...filtered].sort((a, b) => {
    if (a.family === b.family) return a.name.localeCompare(b.name);
    return a.family.localeCompare(b.family);
  });

  const total = filtered.length;
  const lines: string[] = [];
  let currentFamily = "";

  for (const model of filtered.slice(0, limit)) {
    if (model.family !== currentFamily) {
      currentFamily = model.family;
      lines.push(`\n[${currentFamily}]`);
    }

    const flags: string[] = [];
    if (model.supportsReasoning) flags.push("reasoning");
    if (model.supportsVision) flags.push("vision");
    if (model.supportsVideoInput) flags.push("video-input");
    if (model.optimizedForCode) flags.push("code");
    if (model.beta) flags.push("beta");

    const meta: string[] = [];
    if (model.contextWindow) meta.push(`${model.contextWindow} ctx`);
    if (model.maxTokens) meta.push(`${model.maxTokens} out`);
    if (flags.length > 0) meta.push(flags.join(", "));

    lines.push(
      `- ${model.id} — ${model.name}${meta.length ? ` (${meta.join(" · ")})` : ""}`,
    );
  }

  if (total > limit) lines.push(`\n... ${total - limit} more model(s)`);

  return {
    text:
      lines.length > 0
        ? lines.join("\n")
        : "No Venice models matched the requested filters.",
    count: total,
  };
}

export function buildStatusSummary(state: VeniceState): string {
  const counts = getCountsByFamily(state.models);
  const activeJobs = Object.values(state.videoJobs).filter(
    (job) => job.status === "queued" || job.status === "processing",
  ).length;
  const defaults = DEFAULTABLE_FAMILIES.map((family) => {
    return `${family}=${pickDefaultModel(state, family) ?? "none"}`;
  }).join(", ");
  const countSummary = Object.entries(counts)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([family, count]) => `${family}:${count}`)
    .join(", ");
  const refreshed = state.config.lastRefreshAt
    ? new Date(state.config.lastRefreshAt).toLocaleString()
    : "never";
  const notActionable = getEnabledButNotActionableFamilies(state);

  return [
    `Venice extension status`,
    `- base URL: ${state.config.baseUrl}`,
    `- enabled catalog families: ${state.config.enabledCatalogFamilies.join(", ")}`,
    `- implemented provider families: ${IMPLEMENTED_PROVIDER_FAMILIES.join(", ")}`,
    `- implemented tool families: ${IMPLEMENTED_TOOL_FAMILIES.join(", ")}`,
    `- enabled but not actionable yet: ${notActionable.length ? notActionable.join(", ") : "none"}`,
    `- file storage adapter: ${state.config.storage.files.adapter}`,
    `- file output root: ${state.config.storage.files.adapter === "local" ? state.config.storage.files.local.baseDir : (state.config.storage.files.s3?.bucket ?? "unconfigured-s3")}`,
    `- defaults: ${defaults}`,
    `- model counts: ${countSummary || "none"}`,
    `- active video jobs: ${activeJobs}`,
    `- last refresh: ${refreshed}`,
    `- refresh state: ${state.config.lastRefreshStatus}${state.config.lastError ? ` (${state.config.lastError})` : ""}`,
  ].join("\n");
}

export function updateStatus(ctx: ExtensionContext, state: VeniceState) {
  if (!ctx.hasUI) return;

  const activeJobs = Object.values(state.videoJobs).filter(
    (job) => job.status === "queued" || job.status === "processing",
  ).length;
  const textCount = state.models.filter(
    (model) => model.family === "text",
  ).length;
  const statusLabel =
    state.config.lastRefreshStatus === "ok"
      ? "online"
      : state.config.lastRefreshStatus === "error"
        ? "degraded"
        : "loading";
  const notActionable = getEnabledButNotActionableFamilies(state).length;

  ctx.ui.setStatus(
    "venice",
    `Venice ${statusLabel} · ${textCount} text · ${state.models.length} total · ${activeJobs} jobs${notActionable ? ` · ${notActionable} future` : ""}`,
  );
}

export function notify(
  ctx: ExtensionContext,
  message: string,
  kind: "info" | "success" | "error" = "info",
) {
  if (!ctx.hasUI) return;

  ctx.ui.notify(message, kind === "success" ? "info" : kind);
}
