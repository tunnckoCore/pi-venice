import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { VENICE_PROVIDER } from "./constants.ts";
import { truncate } from "./helpers.ts";
import { piAgentDir } from "./settings.ts";
import type { VeniceState } from "./types.ts";

export function resolveVeniceApiKey(apiKeyEnv: string): string | undefined {
  if (process.env[apiKeyEnv]) return process.env[apiKeyEnv];

  const authPath = join(piAgentDir(), "auth.json");
  if (!existsSync(authPath)) return undefined;

  try {
    const auth = JSON.parse(readFileSync(authPath, "utf-8"));
    const providerAuth = auth?.[VENICE_PROVIDER];
    const key = providerAuth?.key;
    if (typeof key === "string") {
      const trimmed = key.trim();
      if (!trimmed) return undefined;
      return process.env[trimmed] ?? trimmed;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

async function parseResponseError(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const data = await response.json();
      return JSON.stringify(data);
    }
    return await response.text();
  } catch {
    return response.statusText || "Unknown error";
  }
}

export async function veniceFetch(
  state: VeniceState,
  path: string,
  init: RequestInit,
  signal?: AbortSignal,
  requireAuth = true,
): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  if (!headers.has("Accept")) headers.set("Accept", "application/json");

  if (requireAuth) {
    const apiKey = resolveVeniceApiKey(state.config.apiKeyEnv);
    if (!apiKey) {
      throw new Error(
        `Missing Venice API key. Set ${state.config.apiKeyEnv} or configure ${join(piAgentDir(), "auth.json")} for provider \"venice\".`,
      );
    }
    headers.set("Authorization", `Bearer ${apiKey}`);
  }

  const response = await fetch(`${state.config.baseUrl}${path}`, {
    ...init,
    headers,
    signal,
  });

  if (!response.ok) {
    throw new Error(
      `Venice API ${response.status}: ${truncate(await parseResponseError(response), 300)}`,
    );
  }

  return response;
}

export async function veniceJson(
  state: VeniceState,
  path: string,
  body: any,
  signal?: AbortSignal,
  requireAuth = true,
): Promise<any> {
  const response = await veniceFetch(
    state,
    path,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    },
    signal,
    requireAuth,
  );
  return response.json();
}
