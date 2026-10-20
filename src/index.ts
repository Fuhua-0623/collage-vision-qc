import { buildCollage } from "./collage.js";
import { CollageVisionQcError } from "./errors.js";
import { loadImage } from "./image.js";
import { parseQcJson } from "./parse.js";
import { requestVisionVerdict } from "./vision.js";
import {
  DEFAULT_LABEL_HEIGHT,
  DEFAULT_LEFT_LABEL,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_MAX_HEIGHT,
  DEFAULT_MODEL,
  DEFAULT_PADDING,
  DEFAULT_PROMPT,
  DEFAULT_RETRY_DELAY_MS,
  DEFAULT_RIGHT_LABEL,
  DEFAULT_TIMEOUT_MS,
} from "./types.js";
import type {
  CollageImageInput,
  CollageLayout,
  CollageVisionQcOptions,
  CollageVisionQcResult,
  ResolvedCollageVisionQcOptions,
  ResolvedSharedOptions,
} from "./types.js";

type SharedConfig = Omit<CollageVisionQcOptions, "referenceImg" | "candidateImg">;

/**
 * Compare a candidate image against a reference image and return a strict JSON
 * verdict from an OpenAI-compatible vision model.
 */
export async function collageVisionQc(
  options: CollageVisionQcOptions,
): Promise<CollageVisionQcResult> {
  return runCheck(resolveOptions(options));
}

/**
 * Reusable client for repeated checks against the same endpoint and settings.
 */
export class CollageVisionQc {
  readonly #config: ResolvedSharedOptions;

  constructor(config: SharedConfig) {
    this.#config = resolveSharedOptions(config);
  }

  async check(input: {
    referenceImg: CollageImageInput;
    candidateImg: CollageImageInput;
  }): Promise<CollageVisionQcResult> {
    const referenceImg = (input as { referenceImg?: CollageImageInput } | null | undefined)
      ?.referenceImg;
    const candidateImg = (input as { candidateImg?: CollageImageInput } | null | undefined)
      ?.candidateImg;
    return runCheck({
      referenceImg: resolveImageInput(referenceImg, "referenceImg"),
      candidateImg: resolveImageInput(candidateImg, "candidateImg"),
      ...this.#config,
    });
  }
}

async function runCheck(options: ResolvedCollageVisionQcOptions): Promise<CollageVisionQcResult> {
  const reference = await loadImage(options.referenceImg);
  const candidate = await loadImage(options.candidateImg);

  let layout: CollageLayout;
  try {
    layout = await buildCollage(reference, candidate, {
      maxHeight: options.maxHeight,
      padding: options.padding,
      labelHeight: options.labelHeight,
      leftLabel: options.leftLabel,
      rightLabel: options.rightLabel,
    });
  } catch (error) {
    if (error instanceof CollageVisionQcError) {
      throw error;
    }
    throw new CollageVisionQcError(
      "INVALID_IMAGE",
      "Failed to compose the side-by-side collage from the provided images.",
      { cause: error },
    );
  }

  let lastError: CollageVisionQcError | undefined;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      const verdict = await requestVisionVerdict({
        baseUrl: options.baseUrl,
        apiKey: options.apiKey,
        model: options.model,
        prompt: options.prompt,
        image: layout.collage,
        timeoutMs: options.timeoutMs,
      });
      const parsed = parseQcJson(verdict.content);
      return {
        passed: parsed.passed,
        reason: parsed.reason,
        raw: verdict.content,
        collage: layout.collage,
        model: options.model,
        elapsedMs: verdict.elapsedMs,
        attempts: attempt,
      };
    } catch (error) {
      const qcError =
        error instanceof CollageVisionQcError
          ? error
          : new CollageVisionQcError("NETWORK_ERROR", "Vision QC request failed.", {
              cause: error,
            });
      lastError = qcError;
      if (!isRetryable(qcError) || attempt >= options.maxAttempts) {
        throw qcError;
      }
      await delay(options.retryDelayMs);
    }
  }

  throw (
    lastError ??
    new CollageVisionQcError("NO_ATTEMPTS", "Vision QC request was never attempted.")
  );
}

function isRetryable(error: CollageVisionQcError): boolean {
  switch (error.code) {
    case "TIMEOUT":
    case "NETWORK_ERROR":
    case "EMPTY_RESPONSE":
    case "INVALID_JSON":
      return true;
    case "HTTP_ERROR":
      return (
        typeof error.status === "number" && (error.status >= 500 || error.status === 429)
      );
    default:
      return false;
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function resolveOptions(options: CollageVisionQcOptions): ResolvedCollageVisionQcOptions {
  const shared = resolveSharedOptions(options);
  return {
    referenceImg: resolveImageInput(options.referenceImg, "referenceImg"),
    candidateImg: resolveImageInput(options.candidateImg, "candidateImg"),
    ...shared,
  };
}

function resolveSharedOptions(config: SharedConfig): ResolvedSharedOptions {
  if (typeof config !== "object" || config === null) {
    throw new CollageVisionQcError("INVALID_INPUT", "Options must be an object.");
  }

  if (typeof config.apiKey !== "string" || config.apiKey.trim().length === 0) {
    throw new CollageVisionQcError("INVALID_INPUT", "apiKey must be a non-empty string.");
  }

  const baseUrl = resolveBaseUrl(config.baseUrl);
  const model = resolveStringOption(config.model, DEFAULT_MODEL, "model");
  const prompt = resolveStringOption(config.prompt, DEFAULT_PROMPT, "prompt");
  const timeoutMs = resolveNumberOption(config.timeoutMs, DEFAULT_TIMEOUT_MS, "timeoutMs");
  if (timeoutMs <= 0) {
    throw new CollageVisionQcError("INVALID_INPUT", "timeoutMs must be greater than 0.");
  }
  const retryDelayMs = resolveNumberOption(
    config.retryDelayMs,
    DEFAULT_RETRY_DELAY_MS,
    "retryDelayMs",
  );
  if (retryDelayMs < 0) {
    throw new CollageVisionQcError("INVALID_INPUT", "retryDelayMs must be greater than or equal to 0.");
  }
  const maxAttempts = resolveIntegerOption(config.maxAttempts, DEFAULT_MAX_ATTEMPTS, "maxAttempts", 1);
  const maxHeight = resolveIntegerOption(config.maxHeight, DEFAULT_MAX_HEIGHT, "maxHeight", 1);
  const padding = resolveIntegerOption(config.padding, DEFAULT_PADDING, "padding", 0);
  const labelHeight = resolveIntegerOption(
    config.labelHeight,
    DEFAULT_LABEL_HEIGHT,
    "labelHeight",
    0,
  );
  const leftLabel = resolveStringOption(config.leftLabel, DEFAULT_LEFT_LABEL, "leftLabel");
  const rightLabel = resolveStringOption(config.rightLabel, DEFAULT_RIGHT_LABEL, "rightLabel");

  return {
    apiKey: config.apiKey,
    baseUrl,
    model,
    prompt,
    timeoutMs,
    maxAttempts,
    retryDelayMs,
    maxHeight,
    padding,
    labelHeight,
    leftLabel,
    rightLabel,
  };
}

function resolveBaseUrl(value: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new CollageVisionQcError("INVALID_INPUT", "baseUrl must be a non-empty http(s) URL string.");
  }

  const trimmed = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch (error) {
    throw new CollageVisionQcError("INVALID_INPUT", "baseUrl must be a valid http(s) URL.", {
      cause: error,
    });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new CollageVisionQcError("INVALID_INPUT", "baseUrl must use the http or https protocol.");
  }

  return trimmed.replace(/\/+$/, "");
}

function resolveStringOption(
  value: string | undefined,
  fallback: string,
  name: string,
): string {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new CollageVisionQcError("INVALID_INPUT", `${name} must be a non-empty string.`);
  }
  return value.trim();
}

function resolveNumberOption(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new CollageVisionQcError("INVALID_INPUT", `${name} must be a finite number.`);
  }
  return value;
}

function resolveIntegerOption(
  value: number | undefined,
  fallback: number,
  name: string,
  minimum: number,
): number {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum) {
    throw new CollageVisionQcError(
      "INVALID_INPUT",
      `${name} must be an integer greater than or equal to ${minimum}.`,
    );
  }
  return value;
}

function resolveImageInput(value: unknown, name: string): CollageImageInput {
  if (Buffer.isBuffer(value)) {
    if (value.length === 0) {
      throw new CollageVisionQcError("INVALID_INPUT", `${name} buffer must not be empty.`);
    }
    return value;
  }
  if (typeof value === "string") {
    if (value.trim().length === 0) {
      throw new CollageVisionQcError(
        "INVALID_INPUT",
        `${name} must be a non-empty string, Buffer, or URL.`,
      );
    }
    return value;
  }
  throw new CollageVisionQcError(
    "INVALID_INPUT",
    `${name} must be a Buffer or a string (file path, data URI, or http(s) URL).`,
  );
}

export { buildCollage } from "./collage.js";
export { parseQcJson } from "./parse.js";
export { loadImage } from "./image.js";
export { CollageVisionQcError } from "./errors.js";
export { DEFAULT_PROMPT } from "./types.js";
export type {
  CollageImageInput,
  CollageLayout,
  CollageVisionQcOptions,
  CollageVisionQcResult,
} from "./types.js";
export type { CollageVisionQcErrorCode } from "./errors.js";
