<p align="center"><a href="./README.md">English</a> | <a href="./README-zh-CN.md">简体中文</a></p>

# @fuhua-0623/collage-vision-qc

[![npm version](https://img.shields.io/npm/v/@fuhua-0623/collage-vision-qc.svg)](https://www.npmjs.com/package/@fuhua-0623/collage-vision-qc)
[![CI](https://github.com/Fuhua-0623/collage-vision-qc/actions/workflows/ci.yml/badge.svg)](https://github.com/Fuhua-0623/collage-vision-qc/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/Fuhua-0623/collage-vision-qc/blob/main/LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

> **Stop hallucinating when comparing multiple images with LLMs.** Send one labeled collage instead of two separate attachments, and get a strict `{ "passed": boolean, "reason"?: string }` verdict.

Detect hallucinated or inconsistent elements in a candidate image by comparing it against a reference in a single side-by-side collage.

`collage-vision-qc` is a small, dependency-light module for AI image quality control. It composites a reference image and a candidate image into one labeled PNG, sends that single image to an OpenAI-compatible vision model, and returns a strict JSON verdict about whether the candidate invented, removed, or materially changed anything relative to the reference. It ships as ESM with full TypeScript types and uses only `sharp` at runtime.

## Visual example

![Collage example: a reference product photo on the left and the same photo on the right with an invented certification badge and an extra accessory](https://raw.githubusercontent.com/Fuhua-0623/collage-vision-qc/main/assets/example.png)

The candidate on the right invents two things the reference never shows: a gold "CERTIFIED" badge and a second watch band. The model receives **one** image and answers:

```json
{ "passed": false, "reason": "The candidate adds a certification badge and a second band that are not present in the reference." }
```

The entire pipeline is one composition and one request:

```text
reference.png ─┐
               ├─▶  sharp: resize + composite  ─▶  one labelled PNG
candidate.png ─┘                                      │
                                                      ▼
                          POST {baseUrl}/chat/completions   (a single image part)
                                                      │
                                                      ▼
                 {"passed": false, "reason": "The candidate adds ..."}
```

Build the same collage yourself with the lower-level helper:

```js
import { buildCollage } from "@fuhua-0623/collage-vision-qc";

const { collage, width, height } = await buildCollage(referenceBuffer, candidateBuffer);
// `collage` is the PNG shown above. Send it as one image part instead of two attachments.
```

The demo image is synthetic and was generated with the package's own `buildCollage()`; no third-party assets are bundled.

## Why this exists

Multimodal models are unreliable when they receive several images in one request. They mix up which image is which, compare the wrong pair, or silently anchor on the first image. The result is a QC verdict you cannot trust:

- **Cross-image confusion.** The model attributes a detail from the reference to the candidate, or the other way around.
- **Element mixing.** With two attachments, models merge the two images into a single mental picture and miss invented objects.
- **Inconsistent references.** The same candidate is judged differently depending on attachment order and prompt phrasing.
- **False marketing claims.** Generated product images quietly add a certification badge, an extra accessory, a logo, a port, or a claim the reference never supported.

A single collage removes the ambiguity. There is exactly one image, and the halves are labeled in-band, so "left" and "right" in the prompt refer to pixels the model can actually see. The model only has to compare two regions of one picture, which is a much easier and far more stable task.

## How it works

1. Both inputs are loaded into memory (Buffer, filesystem path, base64 data URI, or http(s) URL).
2. Each input is resized to the configured height with its aspect ratio preserved.
3. The halves are drawn side by side on a white canvas with a dark label bar naming them.
4. The collage is sent as a single `data:image/png;base64,...` payload to `POST {baseUrl}/chat/completions`.
5. The model is asked for JSON only: `{"passed": true}` or `{"passed": false, "reason": "..."}`.
6. The response is parsed strictly (fences stripped, first `{` to last `}` extracted, `passed` must be a boolean) and returned with the collage and request metadata.

```
+---------------------------------------------------------------+
| #111827  REFERENCE                    CANDIDATE                |
+---------------------------------------------------------------+
|                    |                    |                     |
|    reference       |     candidate      |                     |
|    (resized,       |     (resized,      |                     |
|     aspect kept)   |      aspect kept)  |                     |
|                    |                    |                     |
+---------------------------------------------------------------+
   padding            padding             padding
```

The result shape is deliberately boring:

```json
{ "passed": false, "reason": "The candidate adds a certification badge that the reference does not show." }
```

## Requirements

- Node.js >= 20 (uses the built-in global `fetch` and `AbortSignal.timeout`)
- An OpenAI-compatible API endpoint with a vision-capable model
- Windows, macOS, or Linux (prebuilt `sharp` binaries are installed during `npm install`)

## Installation

```bash
npm install @fuhua-0623/collage-vision-qc
```

Until the package is published to npm, install it straight from GitHub — npm runs the `prepare` script and builds the package locally:

```bash
npm install github:Fuhua-0623/collage-vision-qc
```

```bash
pnpm add @fuhua-0623/collage-vision-qc
```

```bash
yarn add @fuhua-0623/collage-vision-qc
```

## Quick start

### TypeScript

```ts
import { collageVisionQc } from "@fuhua-0623/collage-vision-qc";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error("OPENAI_API_KEY is not set");
}

const result = await collageVisionQc({
  referenceImg: "./reference.png", // path, Buffer, data URI, or http(s) URL
  candidateImg: "./candidate.png",
  apiKey,
  baseUrl: "https://api.openai.com/v1",
});

console.log(result.passed, result.reason);
if (!result.passed) {
  // Keep the collage for human review or attach it to a report.
  await import("node:fs/promises").then((fs) => fs.writeFile("qc-collage.png", result.collage));
}
```

### JavaScript (ESM)

```js
import { collageVisionQc } from "@fuhua-0623/collage-vision-qc";

const result = await collageVisionQc({
  referenceImg: "https://cdn.example.com/reference.png",
  candidateImg: Buffer.from(await (await fetch("https://cdn.example.com/candidate.png")).arrayBuffer()),
  apiKey: process.env.OPENAI_API_KEY,
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
});

console.log(result.passed, result.reason);
```

## Reusing the client for many checks

Construct `CollageVisionQc` once when you validate a whole catalog. Configuration and defaults are resolved and validated once, and every `check()` call reuses them.

```ts
import { CollageVisionQc } from "@fuhua-0623/collage-vision-qc";

const client = new CollageVisionQc({
  apiKey: process.env.OPENAI_API_KEY ?? "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  timeoutMs: 120_000,
  maxAttempts: 3,
  retryDelayMs: 2_000,
});

for (const item of catalogItems) {
  const result = await client.check({
    referenceImg: item.reference,
    candidateImg: item.candidate,
  });

  if (!result.passed) {
    report(item.id, result.reason, result.collage);
  }
}
```

`check()` makes exactly one vision request per attempt and returns the same result shape as the functional API.

## API reference

### `collageVisionQc(options)`

Runs one complete check and resolves with a `CollageVisionQcResult`.

| Option          | Type                     | Default        | Description                                                                                          |
| --------------- | ------------------------ | -------------- | ---------------------------------------------------------------------------------------------------- |
| `referenceImg`  | `Buffer \| string`       | required       | Ground-truth image. A string may be a filesystem path, a base64 data URI, or an http(s) URL.          |
| `candidateImg`  | `Buffer \| string`       | required       | Image under test. Same accepted string forms as `referenceImg`.                                       |
| `apiKey`        | `string`                 | required       | Bearer token for the endpoint. Never logged.                                                          |
| `baseUrl`       | `string`                 | required       | API root, for example `https://api.openai.com/v1`. Trailing slashes are stripped.                     |
| `model`         | `string`                 | `"gpt-4o-mini"`| Any vision-capable model exposed by the endpoint.                                                      |
| `prompt`        | `string`                 | built-in       | Override the instruction text. The default is `DEFAULT_PROMPT`.                                       |
| `timeoutMs`     | `number`                 | `180000`       | Per-attempt request timeout in milliseconds.                                                           |
| `maxAttempts`   | `number`                 | `3`            | Total attempts, including the first one.                                                               |
| `retryDelayMs`  | `number`                 | `2000`         | Delay between retryable attempts in milliseconds.                                                      |
| `maxHeight`     | `number`                 | `900`          | Height each half is resized to (aspect ratio preserved, images may be enlarged).                       |
| `padding`       | `number`                 | `28`           | Inner and outer padding of the collage in pixels.                                                      |
| `labelHeight`   | `number`                 | `54`           | Height of the dark label bar in pixels.                                                                |
| `leftLabel`     | `string`                 | `"REFERENCE"`  | Label drawn over the reference half. XML-escaped before rendering.                                      |
| `rightLabel`    | `string`                 | `"CANDIDATE"`  | Label drawn over the candidate half. XML-escaped before rendering.                                      |

All options are validated before any file, network, or image work happens. Invalid input throws `CollageVisionQcError` with code `INVALID_INPUT`.

| Result field | Type     | Description                                            |
| ------------ | -------- | ------------------------------------------------------ |
| `passed`     | `boolean`| The model verdict.                                     |
| `reason`     | `string` | One-sentence explanation, empty when `passed` is true. |
| `raw`        | `string` | Raw assistant message, useful for debugging prompts.   |
| `collage`    | `Buffer` | The exact PNG that was sent to the model.              |
| `model`      | `string` | Model name used for this check.                        |
| `elapsedMs`  | `number` | Duration of the successful request in milliseconds.    |
| `attempts`   | `number` | Number of attempts used (1 means no retry).            |

### `new CollageVisionQc(config)`

`config` is every option except `referenceImg` and `candidateImg`. The constructor validates immediately, so a misconfigured client fails fast instead of on the first check.

### `buildCollage(reference, candidate, options?)`

Composites two image buffers and returns the layout that was used. Useful if you want to inspect or persist the collage without calling a model.

```ts
interface CollageLayout {
  collage: Buffer;
  width: number;
  height: number;
  leftX: number;
  rightX: number;
  referenceWidth: number;
  candidateWidth: number;
}
```

The options are `maxHeight`, `padding`, `labelHeight`, `leftLabel`, and `rightLabel`, with the same defaults as above. Layout math:

- `referenceWidth` and `candidateWidth` are the resized half widths.
- `width = referenceWidth + candidateWidth + padding * 3`
- `height = maxHeight + labelHeight + padding * 2`

### `parseQcJson(content)`

Parses a model response into `{ passed: boolean, reason: string }`. It strips a leading ```` ```json ```` fence and a trailing ```` ``` ````, trims the text, extracts the substring from the first `{` to the last `}`, and requires `passed` to be a boolean. Missing JSON, malformed JSON, and non-boolean verdicts throw `INVALID_JSON`.

### `loadImage(input)`

Resolves an image input to a `Buffer`. Buffers are returned as-is (empty buffers are rejected), `data:` URIs are base64-decoded, `http(s)` URLs are downloaded, and everything else is treated as a filesystem path. Failures throw `INVALID_IMAGE` and never include binary content in the message.

## Customizing prompt and model

`DEFAULT_PROMPT` is exported so you can extend it without rewriting it:

```ts
import { DEFAULT_PROMPT, collageVisionQc } from "@fuhua-0623/collage-vision-qc";

const prompt = `${DEFAULT_PROMPT}

Additional rule for this catalog: treat any visible price sticker as an invented element.`;

const result = await collageVisionQc({
  referenceImg: "./reference.png",
  candidateImg: "./candidate.png",
  apiKey: process.env.OPENAI_API_KEY ?? "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o",
  prompt,
});
```

Keep the response contract intact: the parser requires a JSON object with a boolean `passed`. If your prompt changes the output schema, parsing fails with `INVALID_JSON` and the request is retried until `maxAttempts` is exhausted.

## Error handling

Every failure is a `CollageVisionQcError` with a stable `code`, plus `status` for HTTP failures and an optional `cause`:

| Code               | When it happens                                                        | Retried |
| ------------------ | ---------------------------------------------------------------------- | ------- |
| `INVALID_INPUT`    | Bad options: empty `apiKey`, invalid `baseUrl`, `maxAttempts < 1`, etc. | No      |
| `INVALID_IMAGE`    | Image cannot be loaded, decoded, or composed into a collage.            | No      |
| `HTTP_ERROR`       | Non-2xx response. `status` holds the HTTP status code.                  | 5xx, 429 only |
| `EMPTY_RESPONSE`   | The response body or assistant message was empty.                       | Yes     |
| `INVALID_JSON`     | The model did not return a JSON object with a boolean `passed`.         | Yes     |
| `TIMEOUT`          | The request exceeded `timeoutMs`.                                       | Yes     |
| `NETWORK_ERROR`    | Transport failure before a response was received.                       | Yes     |
| `NO_ATTEMPTS`      | Defensive: the retry loop was never entered.                            | No      |

```ts
import { CollageVisionQcError, collageVisionQc } from "@fuhua-0623/collage-vision-qc";

try {
  await collageVisionQc(options);
} catch (error) {
  if (error instanceof CollageVisionQcError && error.code === "HTTP_ERROR" && error.status === 401) {
    console.error("Check the API key for this endpoint.");
  }
  throw error;
}
```

Retries stop at `maxAttempts`; the last error is rethrown unchanged. Client errors such as 400, 401, and 403 are never retried because repeating the request cannot succeed.

## Cost and performance

- **One image per check.** The collage is billed as a single image input, roughly the size of one screenshot, instead of two separate images plus attachment overhead.
- **Resize first.** `maxHeight` defaults to 900 pixels per half, which keeps the payload small. Lower it for thumbnails; raise it only when the verdict depends on small text or fine hardware details.
- **Temperature 0.** The request forces `temperature: 0` for stable, repeatable verdicts.
- **Retries are bounded.** Transient 5xx, timeouts, network errors, and bad JSON are retried up to `maxAttempts` with a fixed delay, so a flaky upstream costs at most a few extra requests.
- **Reuse the client.** Constructing `CollageVisionQc` once avoids re-validating configuration for every item in a batch.

## Limitations

- The verdict is only as good as the vision model you point it at. Prompts and models can disagree on borderline cases.
- Large or very detailed images may lose small text after resizing; keep `maxHeight` high enough for the details you care about.
- The collage height is fixed by `maxHeight`; extremely wide images produce a very wide canvas.
- The module does not verify claims against external sources. It compares the candidate with the reference you provide, nothing more.
- A passing verdict is not a guarantee of brand safety, licensing, or regulatory compliance.

## Security

- The API key is sent only in the `Authorization` header to the configured `baseUrl`. It is never logged and never embedded in the collage.
- Images you pass are base64-encoded into the request body, so treat the configured endpoint as trusted.
- The returned `collage` buffer contains both input images. Store it with the same care as the source assets.
- Use HTTPS endpoints in production; the module accepts plain HTTP only because local and private gateways are legitimate deployment targets.

## License

MIT. See [LICENSE](./LICENSE).
