import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, resolve, join } from "node:path";

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

import {
  extensionFromMime,
  isDataUrl,
  isHttpUrl,
  mimeFromExtension,
  parseDataUrl,
  seemsBase64,
} from "./helpers.ts";
import type { AssetResolution, SavedFile } from "./types.ts";

export function outputDir(
  ctx: ExtensionContext,
  bucket: string,
  custom?: string,
): string {
  if (custom) {
    return isAbsolute(custom) ? custom : resolve(ctx.cwd, custom);
  }
  return resolve(ctx.cwd, ".pi", "venice-output", bucket);
}

export async function ensureDir(path: string): Promise<string> {
  await mkdir(path, { recursive: true });
  return path;
}

export async function saveBufferFile(
  ctx: ExtensionContext,
  bucket: string,
  fileNameBase: string,
  data: Buffer,
  mimeType: string,
  customDir?: string,
): Promise<SavedFile> {
  const dir = await ensureDir(outputDir(ctx, bucket, customDir));
  const filePath = join(dir, `${fileNameBase}${extensionFromMime(mimeType)}`);
  await writeFile(filePath, data);
  return { path: filePath, mimeType };
}

export async function saveBase64File(
  ctx: ExtensionContext,
  bucket: string,
  fileNameBase: string,
  base64: string,
  mimeType: string,
  customDir?: string,
): Promise<SavedFile> {
  return saveBufferFile(
    ctx,
    bucket,
    fileNameBase,
    Buffer.from(base64, "base64"),
    mimeType,
    customDir,
  );
}

export async function resolveAsset(
  input: string,
  kind: "image" | "video" | "audio",
  signal?: AbortSignal,
  forceRemoteDownload = false,
): Promise<AssetResolution> {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Empty asset input.");

  if (existsSync(trimmed)) {
    const data = await readFile(trimmed);
    const mimeType = mimeFromExtension(trimmed, `${kind}/octet-stream`);
    const base64 = data.toString("base64");
    return {
      rawBase64: base64,
      dataUrl: `data:${mimeType};base64,${base64}`,
      mimeType,
      sourceLabel: trimmed,
    };
  }

  if (isDataUrl(trimmed)) {
    const parsed = parseDataUrl(trimmed);
    return {
      rawBase64: parsed.base64,
      dataUrl: trimmed,
      mimeType: parsed.mimeType,
      sourceLabel: `${kind} data URL`,
    };
  }

  if (isHttpUrl(trimmed) && !forceRemoteDownload) {
    return {
      rawBase64: "",
      dataUrl: trimmed,
      httpUrl: trimmed,
      mimeType: `${kind}/octet-stream`,
      sourceLabel: trimmed,
    };
  }

  if (isHttpUrl(trimmed) && forceRemoteDownload) {
    const response = await fetch(trimmed, { signal });
    if (!response.ok) {
      throw new Error(`Failed to fetch remote asset: ${trimmed}`);
    }
    const mimeType =
      response.headers.get("content-type") ?? `${kind}/octet-stream`;
    const buffer = Buffer.from(await response.arrayBuffer());
    const base64 = buffer.toString("base64");
    return {
      rawBase64: base64,
      dataUrl: `data:${mimeType};base64,${base64}`,
      httpUrl: trimmed,
      mimeType,
      sourceLabel: trimmed,
    };
  }

  if (seemsBase64(trimmed)) {
    const mimeType = `${kind}/octet-stream`;
    const normalized = trimmed.replace(/\s+/g, "");
    return {
      rawBase64: normalized,
      dataUrl: `data:${mimeType};base64,${normalized}`,
      mimeType,
      sourceLabel: `${kind} base64`,
    };
  }

  throw new Error(
    `Unsupported ${kind} input: expected a local file path, http(s) URL, data URL, or raw base64 string.`,
  );
}
