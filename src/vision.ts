import { CollageVisionQcError } from "./errors.js";

export interface VisionRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  image: Buffer;
  timeoutMs: number;
}

export interface VisionResponse {
  /** Raw message content returned by the model. */
  content: string;
  /** Duration of this single request in milliseconds. */
  elapsedMs: number;
}

interface ChatCompletionBody {
  model: string;
  temperature: number;
  messages: Array<{
    role: "user";
    content: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;
  }>;
}

/** Build the chat completions endpoint from a base URL, stripping trailing slashes. */
export function chatCompletionsUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "") + "/chat/completions";
}

/**
 * Send one vision request to an OpenAI-compatible chat completions endpoint and
 * return the text content of the first choice.
 */
export async function requestVisionVerdict(request: VisionRequest): Promise<VisionResponse> {
  const startedAt = Date.now();
  const body: ChatCompletionBody = {
    model: request.model,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: request.prompt },
          {
            type: "image_url",
            image_url: { url: "data:image/png;base64," + request.image.toString("base64") },
          },
        ],
      },
    ],
  };

  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch(chatCompletionsUrl(request.baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${request.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(request.timeoutMs),
    });
  } catch (error) {
    throw transportError(error);
  }

  if (!response.ok) {
    throw new CollageVisionQcError(
      "HTTP_ERROR",
      `Vision API returned HTTP ${response.status}.`,
      { status: response.status },
    );
  }

  const text = await readResponseText(response);
  const payload = parseResponseBody(text);
  const content = extractContent(payload);
  return { content, elapsedMs: Date.now() - startedAt };
}

async function readResponseText(response: Awaited<ReturnType<typeof fetch>>): Promise<string> {
  try {
    return await response.text();
  } catch (error) {
    throw new CollageVisionQcError(
      "NETWORK_ERROR",
      "Failed to read the vision API response body.",
      { cause: error },
    );
  }
}

function parseResponseBody(text: string): unknown {
  if (text.trim().length === 0) {
    throw new CollageVisionQcError(
      "EMPTY_RESPONSE",
      "Vision API returned an empty response body.",
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new CollageVisionQcError(
      "INVALID_JSON",
      "Vision API response body was not valid JSON.",
      { cause: error },
    );
  }
}

function extractContent(payload: unknown): string {
  const choices = isRecord(payload) && Array.isArray(payload.choices) ? payload.choices : [];
  const first = choices[0];
  const message = isRecord(first) && isRecord(first.message) ? first.message : undefined;
  const content = message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new CollageVisionQcError(
      "EMPTY_RESPONSE",
      "Vision API response did not include any message content.",
    );
  }
  return content;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimeoutError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const name = (error as { name?: unknown }).name;
  return name === "TimeoutError" || name === "AbortError";
}

function transportError(error: unknown): CollageVisionQcError {
  if (isTimeoutError(error)) {
    return new CollageVisionQcError("TIMEOUT", "Vision API request timed out.", { cause: error });
  }
  const detail = error instanceof Error && error.message ? `: ${error.message}` : "";
  return new CollageVisionQcError(
    "NETWORK_ERROR",
    `Vision API request failed${detail}.`,
    { cause: error },
  );
}
