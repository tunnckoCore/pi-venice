import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";

import {
  ASPECT_RATIOS,
  FILTER_FAMILIES,
  IMAGE_FORMATS,
  USER_CONFIGURABLE_FAMILIES,
  VIDEO_ASPECTS,
  VIDEO_DURATIONS,
  VIDEO_RESOLUTIONS,
} from "./constants.ts";

export const FamilySchema = StringEnum(FILTER_FAMILIES);
export const ConfigurableFamilySchema = StringEnum(USER_CONFIGURABLE_FAMILIES);
export const ImageFormatSchema = StringEnum(IMAGE_FORMATS);
export const AspectRatioSchema = StringEnum(ASPECT_RATIOS);
export const VideoDurationSchema = StringEnum(VIDEO_DURATIONS);
export const VideoAspectSchema = StringEnum(VIDEO_ASPECTS);
export const VideoResolutionSchema = StringEnum(VIDEO_RESOLUTIONS);

export const ListModelsParams = Type.Object({
  family: Type.Optional(FamilySchema),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
  reasoning_only: Type.Optional(Type.Boolean()),
  vision_only: Type.Optional(Type.Boolean()),
});

export const ImageGenerateParams = Type.Object({
  prompt: Type.String({ description: "Prompt for image generation." }),
  model: Type.Optional(Type.String({ description: "Venice image model id." })),
  negative_prompt: Type.Optional(Type.String()),
  width: Type.Optional(Type.Integer({ minimum: 128, maximum: 1280 })),
  height: Type.Optional(Type.Integer({ minimum: 128, maximum: 1280 })),
  format: Type.Optional(ImageFormatSchema),
  variants: Type.Optional(Type.Integer({ minimum: 1, maximum: 4 })),
  safe_mode: Type.Optional(Type.Boolean()),
  save_dir: Type.Optional(Type.String()),
});

export const ImageEditParams = Type.Object({
  image: Type.String({
    description:
      "Image input as a local file path, http(s) URL, data URL, or raw base64.",
  }),
  prompt: Type.String({ description: "Image edit instruction." }),
  model: Type.Optional(
    Type.String({ description: "Venice image edit model id." }),
  ),
  aspect_ratio: Type.Optional(AspectRatioSchema),
  save_dir: Type.Optional(Type.String()),
});

export const ImageMultiEditParams = Type.Object({
  images: Type.Array(Type.String(), {
    minItems: 1,
    maxItems: 3,
    description:
      "1 to 3 image inputs as local file paths, http(s) URLs, data URLs, or raw base64 strings.",
  }),
  prompt: Type.String({ description: "Image multi-edit instruction." }),
  model: Type.Optional(
    Type.String({ description: "Venice multi-edit model id." }),
  ),
  save_dir: Type.Optional(Type.String()),
});

export const ImageUpscaleParams = Type.Object({
  image: Type.String({
    description:
      "Image input as a local file path, http(s) URL, data URL, or raw base64.",
  }),
  scale: Type.Optional(Type.Number({ minimum: 1, maximum: 4 })),
  enhance: Type.Optional(Type.Boolean()),
  enhance_creativity: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  enhance_prompt: Type.Optional(Type.String()),
  replication: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  save_dir: Type.Optional(Type.String()),
});

export const BackgroundRemoveParams = Type.Object({
  image: Type.String({
    description:
      "Image input as a local file path, http(s) URL, data URL, or raw base64.",
  }),
  save_dir: Type.Optional(Type.String()),
});

export const VideoGenerateParams = Type.Object({
  model: Type.Optional(Type.String({ description: "Venice video model id." })),
  prompt: Type.Optional(
    Type.String({ description: "Prompt for video generation." }),
  ),
  negative_prompt: Type.Optional(Type.String()),
  duration: Type.Optional(VideoDurationSchema),
  aspect_ratio: Type.Optional(VideoAspectSchema),
  resolution: Type.Optional(VideoResolutionSchema),
  upscale_factor: Type.Optional(Type.Integer({ minimum: 1, maximum: 4 })),
  audio: Type.Optional(Type.Boolean()),
  image: Type.Optional(
    Type.String({ description: "Optional image-to-video source." }),
  ),
  end_image: Type.Optional(
    Type.String({ description: "Optional end-frame image source." }),
  ),
  audio_input: Type.Optional(
    Type.String({ description: "Optional audio source for supported models." }),
  ),
  video_input: Type.Optional(
    Type.String({
      description:
        "Optional video source for video-to-video or upscale models.",
    }),
  ),
  reference_images: Type.Optional(
    Type.Array(Type.String(), {
      maxItems: 9,
      description: "Optional reference image sources for supported models.",
    }),
  ),
  quote_only: Type.Optional(Type.Boolean()),
  wait: Type.Optional(Type.Boolean()),
  poll_interval_seconds: Type.Optional(
    Type.Integer({ minimum: 1, maximum: 60 }),
  ),
  timeout_seconds: Type.Optional(Type.Integer({ minimum: 5, maximum: 1800 })),
  cleanup: Type.Optional(Type.Boolean()),
  save_dir: Type.Optional(Type.String()),
});

export const VideoRetrieveParams = Type.Object({
  model: Type.String({ description: "Venice video model id." }),
  queue_id: Type.String({ description: "Venice video queue id." }),
  wait: Type.Optional(Type.Boolean()),
  poll_interval_seconds: Type.Optional(
    Type.Integer({ minimum: 1, maximum: 60 }),
  ),
  timeout_seconds: Type.Optional(Type.Integer({ minimum: 5, maximum: 1800 })),
  cleanup: Type.Optional(Type.Boolean()),
  save_dir: Type.Optional(Type.String()),
});

export const VideoCompleteParams = Type.Object({
  model: Type.String({ description: "Venice video model id." }),
  queue_id: Type.String({ description: "Venice video queue id." }),
});
