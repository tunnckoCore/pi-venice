import { veniceFetch } from "./api.ts";
import { VENICE_MODELS_ENDPOINT } from "./constants.ts";
import { normalizeModel } from "./helpers.ts";
import type { VeniceState } from "./types.ts";

export async function refreshVeniceCatalog(state: VeniceState): Promise<VeniceState> {
  const response = await veniceFetch(
    state,
    VENICE_MODELS_ENDPOINT,
    { method: "GET" },
    undefined,
    false,
  );
  const payload = await response.json();
  const models = Array.isArray(payload?.data)
    ? payload.data.map(normalizeModel)
    : [];

  return {
    ...state,
    models,
    config: {
      ...state.config,
      lastRefreshAt: Date.now(),
      lastRefreshStatus: "ok",
      lastError: undefined,
    },
  };
}
