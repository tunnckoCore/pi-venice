export const VENICE_PROVIDER = "venice";
export const VENICE_BASE_URL = "https://api.venice.ai/api/v1";
export const VENICE_MODELS_ENDPOINT = "/models?type=all";
export const STATE_ENTRY_TYPE = "venice-state";

export const CATALOG_FAMILIES = [
  "text",
  "image",
  "edit",
  "upscale",
  "video",
  "music",
  "tts",
  "asr",
  "embedding",
  "audio",
  "unknown",
] as const;

export const USER_CONFIGURABLE_FAMILIES = CATALOG_FAMILIES.filter(
  (family) => family !== "unknown",
) as Exclude<(typeof CATALOG_FAMILIES)[number], "unknown">[];

export const DEFAULTABLE_FAMILIES = [
  "text",
  "image",
  "edit",
  "upscale",
  "video",
] as const;

export const IMPLEMENTED_PROVIDER_FAMILIES = ["text"] as const;
export const IMPLEMENTED_TOOL_FAMILIES = [
  "image",
  "edit",
  "upscale",
  "video",
] as const;
export const IMPLEMENTED_FAMILIES = [
  ...IMPLEMENTED_PROVIDER_FAMILIES,
  ...IMPLEMENTED_TOOL_FAMILIES,
] as const;

export const FILTER_FAMILIES = ["all", ...CATALOG_FAMILIES] as const;
export const IMAGE_FORMATS = ["jpeg", "png", "webp"] as const;
export const ASPECT_RATIOS = [
  "auto",
  "1:1",
  "3:2",
  "16:9",
  "21:9",
  "9:16",
  "2:3",
  "3:4",
  "4:5",
] as const;
export const VIDEO_DURATIONS = [
  "2s",
  "3s",
  "4s",
  "5s",
  "6s",
  "7s",
  "8s",
  "9s",
  "10s",
  "11s",
  "12s",
  "13s",
  "14s",
  "15s",
  "16s",
  "18s",
  "20s",
  "25s",
  "30s",
  "Auto",
] as const;
export const VIDEO_ASPECTS = [
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "9:16",
  "16:9",
  "21:9",
] as const;
export const VIDEO_RESOLUTIONS = [
  "256p",
  "360p",
  "480p",
  "540p",
  "580p",
  "720p",
  "1080p",
  "1440p",
  "2160p",
  "4k",
  "2x",
  "4x",
] as const;
