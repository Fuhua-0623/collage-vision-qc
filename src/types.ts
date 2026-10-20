/**
 * Public types for collage-vision-qc.
 *
 * The package compares a candidate image against a reference image by compositing
 * both into a single, labeled side-by-side collage and asking a vision model for a
 * strict JSON verdict. Keeping everything in one image avoids the multi-image
 * confusion that multimodal models frequently exhibit.
 */

/** An image can be provided as a raw Buffer or as a string. */
export type CollageImageInput = Buffer | string;

export interface CollageVisionQcOptions {
  /** Reference image: the ground truth the candidate is compared against. */
  referenceImg: CollageImageInput;
  /** Candidate image: the image that should be checked for invented or missing content. */
  candidateImg: CollageImageInput;
  /** API key sent as `Authorization: Bearer <apiKey>`. */
  apiKey: string;
  /** OpenAI-compatible base URL, for example `https://api.openai.com/v1`. Trailing slashes are stripped. */
  baseUrl: string;
  /** Model name. Defaults to `gpt-4o-mini`. */
  model?: string;
  /** Vision prompt. Defaults to {@link DEFAULT_PROMPT}. */
  prompt?: string;
  /** Per-attempt request timeout in milliseconds. Defaults to 180000. */
  timeoutMs?: number;
  /** Maximum number of attempts, including the first one. Defaults to 3. */
  maxAttempts?: number;
  /** Delay between attempts in milliseconds. Defaults to 2000. */
  retryDelayMs?: number;
  /** Height each half is resized to before compositing. Defaults to 900. */
  maxHeight?: number;
  /** Whitespace between and around the halves, and under the label bar. Defaults to 28. */
  padding?: number;
  /** Height of the dark label bar at the top of the collage. Defaults to 54. */
  labelHeight?: number;
  /** Label rendered above the reference half. Defaults to `REFERENCE`. */
  leftLabel?: string;
  /** Label rendered above the candidate half. Defaults to `CANDIDATE`. */
  rightLabel?: string;
}

export interface CollageVisionQcResult {
  /** Verdict returned by the vision model. */
  passed: boolean;
  /** Trimmed explanation. Empty string when the model did not provide one. */
  reason: string;
  /** Unmodified model response content. */
  raw: string;
  /** The exact PNG collage that was sent to the model. */
  collage: Buffer;
  /** Model name that was used. */
  model: string;
  /** Duration of the successful vision request in milliseconds. */
  elapsedMs: number;
  /** Number of attempts used to obtain this result. */
  attempts: number;
}

export interface CollageLayout {
  /** Composed PNG collage. */
  collage: Buffer;
  /** Total canvas width in pixels. */
  width: number;
  /** Total canvas height in pixels. */
  height: number;
  /** X offset of the reference half. */
  leftX: number;
  /** X offset of the candidate half. */
  rightX: number;
  /** Width of the resized reference half. */
  referenceWidth: number;
  /** Width of the resized candidate half. */
  candidateWidth: number;
}

export interface BuildCollageOptions {
  maxHeight?: number;
  padding?: number;
  labelHeight?: number;
  leftLabel?: string;
  rightLabel?: string;
}

/** Fully resolved options used internally after defaults and validation are applied. */
export interface ResolvedCollageVisionQcOptions {
  referenceImg: CollageImageInput;
  candidateImg: CollageImageInput;
  apiKey: string;
  baseUrl: string;
  model: string;
  prompt: string;
  timeoutMs: number;
  maxAttempts: number;
  retryDelayMs: number;
  maxHeight: number;
  padding: number;
  labelHeight: number;
  leftLabel: string;
  rightLabel: string;
}

/** Resolved options without the per-check images. */
export type ResolvedSharedOptions = Omit<
  ResolvedCollageVisionQcOptions,
  "referenceImg" | "candidateImg"
>;

export const DEFAULT_MODEL = "gpt-4o-mini";
export const DEFAULT_TIMEOUT_MS = 180_000;
export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_RETRY_DELAY_MS = 2_000;
export const DEFAULT_MAX_HEIGHT = 900;
export const DEFAULT_PADDING = 28;
export const DEFAULT_LABEL_HEIGHT = 54;
export const DEFAULT_LEFT_LABEL = "REFERENCE";
export const DEFAULT_RIGHT_LABEL = "CANDIDATE";

/**
 * Default vision prompt. Generic English, no project-specific wording, and no
 * markdown fences in the requested output.
 */
export const DEFAULT_PROMPT = [
  "The attached image contains two labeled halves.",
  "The LEFT half is the REFERENCE image and is the ground truth.",
  "The RIGHT half is the CANDIDATE image that must be checked against the reference.",
  "",
  "Compare the two halves and decide whether the candidate stays faithful to the reference.",
  "",
  "Fail the candidate if it introduces any element, object, feature, text, logo, certification, accessory, or claim that is not present or clearly supported by the reference.",
  "Also fail the candidate if it removes or materially alters something that is visible in the reference.",
  "",
  "Do not fail the candidate for differences in layout, background, lighting, crop, resolution, or watermark.",
  "",
  "Respond with JSON only, without markdown fences and without any other text.",
  "Use one of these two shapes:",
  '{"passed": true}',
  '{"passed": false, "reason": "<one concise sentence>"}',
].join("\n");
