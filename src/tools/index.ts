import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import type { VeniceRuntime } from "../runtime.ts";
import { registerVeniceImageEditTools } from "./image-edit.ts";
import { registerVeniceImageTools } from "./image.ts";
import { registerVeniceListModelsTool } from "./models.ts";
import { registerVeniceVideoTools } from "./video.ts";

export function registerVeniceTools(pi: ExtensionAPI, runtime: VeniceRuntime) {
  registerVeniceListModelsTool(pi, runtime);
  registerVeniceImageTools(pi, runtime);
  registerVeniceImageEditTools(pi, runtime);
  registerVeniceVideoTools(pi, runtime);
}
