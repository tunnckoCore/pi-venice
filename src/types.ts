import type {
  CATALOG_FAMILIES,
  DEFAULTABLE_FAMILIES,
  IMPLEMENTED_FAMILIES,
} from "./constants.ts";

export type VeniceFamily = (typeof CATALOG_FAMILIES)[number];
export type DefaultableFamily = (typeof DEFAULTABLE_FAMILIES)[number];
export type ImplementedFamily = (typeof IMPLEMENTED_FAMILIES)[number];

export interface VeniceModelInfo {
  id: string;
  name: string;
  type: string;
  family: VeniceFamily;
  description?: string;
  traits: string[];
  privacy?: string;
  offline?: boolean;
  beta?: boolean;
  contextWindow?: number;
  maxTokens?: number;
  pricing?: Record<string, any>;
  constraints?: Record<string, any>;
  supportsVision?: boolean;
  supportsVideoInput?: boolean;
  supportsAudioInput?: boolean;
  supportsFunctionCalling?: boolean;
  supportsReasoning?: boolean;
  supportsReasoningEffort?: boolean;
  supportsMultipleImages?: boolean;
  optimizedForCode?: boolean;
}

export interface VeniceVideoJob {
  queueId: string;
  model: string;
  prompt?: string;
  status: "queued" | "processing" | "done" | "cleaned" | "failed";
  savedPath?: string;
  lastKnownEtaMs?: number;
  updatedAt: number;
}

export interface VeniceS3FilesConfig {
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
}

export interface VeniceState {
  config: {
    baseUrl: string;
    apiKeyEnv: string;
    enabledCatalogFamilies: VeniceFamily[];
    defaults: Partial<Record<DefaultableFamily, string>>;
    output: {
      rootDir: string;
    };
    storage: {
      files: {
        adapter: "local" | "s3";
        local: {
          baseDir: string;
        };
        s3?: VeniceS3FilesConfig;
      };
    };
    lastRefreshAt?: number;
    lastRefreshStatus: "never" | "ok" | "error";
    lastError?: string;
  };
  models: VeniceModelInfo[];
  videoJobs: Record<string, VeniceVideoJob>;
}

export interface SavedFile {
  path: string;
  mimeType?: string;
}

export interface VeniceToolDetails {
  status: string;
  summary: string;
  model?: string;
  family?: string;
  queueId?: string;
  savedFiles?: SavedFile[];
  timing?: any;
  quote?: number;
  count?: number;
  error?: string;
}

export interface AssetResolution {
  rawBase64: string;
  dataUrl: string;
  httpUrl?: string;
  mimeType: string;
  sourceLabel: string;
}
