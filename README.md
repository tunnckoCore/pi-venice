# pi-venice

>  [Pi Coding Agent](https://pi.dev) extension for using Venice.AI as provider. All text, image, edit, video models and tools with support for S3 output storage.

A Pi extension that adds:

- Venice text models to Pi's `/model` picker
- Venice image/video models & media tools for image generation, image editing, upscale, background removal, and video generation
- configurable local or S3-compatible image/edit/video output storage

## Quick start

```bash
export VENICE_API_KEY="your-venice-api-key"
pi -e npm:pi-venice

# or from Github

pi -e https://github.com/tunnckoCore/pi-venice

# or direct install

pi install npm:pi-venice
```

## What it supports

### Text models
The extension fetches the Venice model catalog and registers Venice text models as a Pi provider named `venice`.

That means you can use Venice text models through Pi's normal model selection flow, eg. with `/model`

### Included tools

- `venice_list_models`
- `venice_image_generate`
- `venice_image_edit`
- `venice_image_multi_edit`
- `venice_image_upscale`
- `venice_background_remove`
- `venice_video_generate`
- `venice_video_retrieve`
- `venice_video_complete`

### Catalog families
The extension can track broader Venice catalog families such as:

- ✅ `text`
- ✅ `image`
- ✅ `edit`
- ✅ `upscale`
- ✅ `video`
- ❌ `embedding`
- ❌ `music`
- ❌ `tts`
- ❌ `asr`
- ❌ `audio`

**NOTE:** Not every catalog family has a dedicated Pi tool. Families without runtime support are still visible in catalog/config output so the extension stays honest about what Venice exposes.

## Authentication

The extension currently supports **API key authentication**.

It looks for a Venice API key in either:

- `VENICE_API_KEY`
- `~/.pi/agent/auth.json`

Example `auth.json` using an environment variable name:

```json
{
  "venice": {
    "type": "api_key",
    "key": "VENICE_API_KEY"
  }
}
```

Example `auth.json` using a literal API key:

```json
{
  "venice": {
    "type": "api_key",
    "key": "vnc_live_abc123"
  }
}
```

OAuth is **not implemented** in this extension today. If Venice exposes a stable OAuth flow in the future, it could be added through Pi's custom-provider OAuth hooks and `/login`, but that is not wired up yet.

## Make Venice your default provider

Example `~/.pi/agent/settings.json`:

```json
{
  "defaultProvider": "venice",
  "defaultModel": "zai-org-glm-5",
  "enabledModels": ["venice/*"]
}
```

## `pi-venice` settings

Extension-specific settings live under:

```json
{
  "pi-venice": {
    "...": "..."
  }
}
```

Supported locations:

- global: `~/.pi/agent/settings.json`
- project: `.pi/settings.json`

Project settings override global settings.

### Local output example

```json
{
  "pi-venice": {
    "apiKeyEnv": "VENICE_API_KEY",
    "families": {
      "enabled": ["text", "image", "edit", "video"],
      "defaults": {
        "text": "zai-org-glm-5",
        "image": "flux-2-max",
        "edit": "qwen-edit",
        "video": "seedance-2-0-text-to-video"
      }
    },
    "output": {
      "rootDir": ".pi/venice-output"
    },
    "storage": {
      "files": {
        "adapter": "local",
        "local": {
          "baseDir": ".pi/venice-output"
        }
      }
    }
  }
}
```

### S3 / R2 output example

Output generated images or videos to external S3-compatible storage:

```json
{
  "pi-venice": {
    "storage": {
      "files": {
        "adapter": "s3",
        "s3": {
          "endpoint": "https://<accountid>.r2.cloudflarestorage.com",
          "bucket": "pi-venice-artifacts",
          "region": "auto",
          "prefix": "my-project",
          "forcePathStyle": true,
          "publicBaseUrl": "https://cdn.example.com/pi-venice",
          "credentials": {
            "accessKeyId": "env:R2_ACCESS_KEY_ID",
            "secretAccessKey": "env:R2_SECRET_ACCESS_KEY"
          }
        }
      }
    }
  }
}
```

Adapter credential references support:

- `env:NAME`
- literal values - eg. you access key and secret keys inside your Pi config.

## Commands

### `/venice-refresh-models`
Refresh the Venice model catalog and re-register Venice text models.

### `/venice-status`
Show:

- enabled catalog families
- implemented provider families
- implemented tool families
- enabled but not actionable families
- file storage adapter
- defaults
- model counts
- last refresh status
- active video jobs

### `/venice-models [family|all] [limit]`
Examples:

```text
/venice-models
/venice-models text 30
/venice-models embedding 20
/venice-models video 20
```

### `/venice-defaults`
Show or set default model IDs used by the extension.

### `/venice-families`
Show or set enabled Venice catalog families.

Examples:

```text
/venice-families
/venice-families text,image,embedding,video
/venice-families tts,asr,audio
/venice-families all
```

## Tool summary

### `venice_list_models`
List Venice models from the cached catalog.

### `venice_image_generate`
Generate images with `/image/generate`.

### `venice_image_edit`
Edit a single image with `/image/edit`.

### `venice_image_multi_edit`
Edit or composite up to 3 images with `/image/multi-edit`.

### `venice_image_upscale`
Upscale or enhance an image with `/image/upscale`.

### `venice_background_remove`
Remove an image background with `/image/background-remove`.

### `venice_video_generate`
Queue a video job, optionally quote it, poll for completion, and save the result.

### `venice_video_retrieve`
Retrieve or continue polling a previously queued video job.

### `venice_video_complete`
Delete a completed remote Venice video job from Venice storage.

## Non-interactive support

The extension works in headless and non-TUI flows for core functionality, including:

- provider registration
- model refresh
- media tools
- local file output
- S3-compatible output upload
- session state restoration

UI-only features are guarded so the extension can still be used in print, JSON, and embedded agent workflows.

## Output behavior

By default, outputs are written locally under `.pi/venice-output`.

If `pi-venice.storage.files.adapter` is set to `s3`, generated outputs are uploaded to the configured S3-compatible backend instead.

## License

Apache-2.0
