import { createHmac, createHash } from "node:crypto";
import { URL } from "node:url";

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

import {
  saveBase64File as saveLocalBase64File,
  saveBufferFile as saveLocalBufferFile,
} from "./assets.ts";
import { resolveSecretReference } from "./settings.ts";
import type { SavedFile, VeniceS3FilesConfig, VeniceState } from "./types.ts";

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function encodeRfc3986(path: string): string {
  return path
    .split("/")
    .map((segment) =>
      encodeURIComponent(segment).replace(
        /[!'()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    .join("/");
}

function isoNow(date = new Date()): { amzDate: string; dateStamp: string } {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  };
}

function normalizePrefix(prefix?: string): string {
  if (!prefix) return "";
  return prefix.replace(/^\/+|\/+$/g, "");
}

function s3ObjectKey(
  bucketName: string,
  fileName: string,
  prefix?: string,
): string {
  const parts = [normalizePrefix(prefix), bucketName, fileName].filter(Boolean);
  return parts.join("/");
}

function buildS3Url(config: VeniceS3FilesConfig, objectKey: string): URL {
  if (!config.endpoint || !config.bucket) {
    throw new Error("Missing S3 endpoint or bucket in pi-venice settings.");
  }

  const endpoint = new URL(config.endpoint);
  const pathStyle = config.forcePathStyle !== false;
  if (pathStyle) {
    endpoint.pathname = `/${config.bucket}/${objectKey}`;
    return endpoint;
  }

  endpoint.hostname = `${config.bucket}.${endpoint.hostname}`;
  endpoint.pathname = `/${objectKey}`;
  return endpoint;
}

async function putObjectS3(
  config: VeniceS3FilesConfig,
  objectKey: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  if (!config.endpoint || !config.bucket) {
    throw new Error("Missing S3 endpoint or bucket in pi-venice settings.");
  }

  const accessKeyId =
    resolveSecretReference(config.credentials?.accessKeyId) ||
    process.env.AWS_ACCESS_KEY_ID ||
    process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey =
    resolveSecretReference(config.credentials?.secretAccessKey) ||
    process.env.AWS_SECRET_ACCESS_KEY ||
    process.env.R2_SECRET_ACCESS_KEY;
  const sessionToken =
    resolveSecretReference(config.credentials?.sessionToken) ||
    process.env.AWS_SESSION_TOKEN;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "Missing S3 credentials. Configure pi-venice.storage.files.s3.credentials or AWS/R2 env vars.",
    );
  }

  const region = config.region || "auto";
  const url = buildS3Url(config, objectKey);
  const { amzDate, dateStamp } = isoNow();
  const payloadHash = sha256Hex(body);
  const canonicalUri = encodeRfc3986(url.pathname);
  const canonicalHeaders = [
    `content-type:${contentType}`,
    `host:${url.host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
  ];
  const signedHeaderNames = [
    "content-type",
    "host",
    "x-amz-content-sha256",
    "x-amz-date",
  ];

  if (sessionToken) {
    canonicalHeaders.push(`x-amz-security-token:${sessionToken}`);
    signedHeaderNames.push("x-amz-security-token");
  }

  const canonicalRequest = [
    "PUT",
    canonicalUri,
    "",
    canonicalHeaders.join("\n") + "\n",
    signedHeaderNames.join(";"),
    payloadHash,
  ].join("\n");

  const service = "s3";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning)
    .update(stringToSign)
    .digest("hex");

  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaderNames.join(";")}`,
    `Signature=${signature}`,
  ].join(", ");

  const headers: Record<string, string> = {
    "content-type": contentType,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    Authorization: authorization,
  };
  if (sessionToken) headers["x-amz-security-token"] = sessionToken;

  const response = await fetch(url, {
    method: "PUT",
    headers,
    body: new Uint8Array(body),
  });

  if (!response.ok) {
    throw new Error(
      `S3 upload failed (${response.status}): ${await response.text()}`,
    );
  }

  const publicBase = config.publicBaseUrl?.replace(/\/+$/, "");
  return publicBase ? `${publicBase}/${objectKey}` : url.toString();
}

function localBucketName(bucket: string): string {
  return bucket.replace(/^\/+|\/+$/g, "");
}

export async function saveOutputBuffer(
  ctx: ExtensionContext,
  state: VeniceState,
  bucket: string,
  fileNameBase: string,
  data: Buffer,
  mimeType: string,
  customDir?: string,
): Promise<SavedFile> {
  if (state.config.storage.files.adapter === "s3") {
    const extension = mimeType.includes("png")
      ? ".png"
      : mimeType.includes("jpeg") || mimeType.includes("jpg")
        ? ".jpg"
        : mimeType.includes("webp")
          ? ".webp"
          : mimeType.includes("mp4")
            ? ".mp4"
            : ".bin";
    const fileName = `${fileNameBase}${extension}`;
    const objectKey = s3ObjectKey(
      localBucketName(bucket),
      fileName,
      state.config.storage.files.s3?.prefix,
    );
    const remoteUrl = await putObjectS3(
      state.config.storage.files.s3 || {},
      objectKey,
      data,
      mimeType,
    );
    return { path: remoteUrl, mimeType };
  }

  const localDir =
    customDir ||
    state.config.storage.files.local.baseDir ||
    state.config.output.rootDir;
  return saveLocalBufferFile(
    ctx,
    bucket,
    fileNameBase,
    data,
    mimeType,
    localDir,
  );
}

export async function saveOutputBase64(
  ctx: ExtensionContext,
  state: VeniceState,
  bucket: string,
  fileNameBase: string,
  base64: string,
  mimeType: string,
  customDir?: string,
): Promise<SavedFile> {
  if (state.config.storage.files.adapter === "s3") {
    return saveOutputBuffer(
      ctx,
      state,
      bucket,
      fileNameBase,
      Buffer.from(base64, "base64"),
      mimeType,
      customDir,
    );
  }

  const localDir =
    customDir ||
    state.config.storage.files.local.baseDir ||
    state.config.output.rootDir;
  return saveLocalBase64File(
    ctx,
    bucket,
    fileNameBase,
    base64,
    mimeType,
    localDir,
  );
}
