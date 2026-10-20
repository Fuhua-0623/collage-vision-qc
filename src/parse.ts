import { CollageVisionQcError } from "./errors.js";

/**
 * Parse a model response that should contain a JSON verdict.
 *
 * Accepts plain JSON, markdown-fenced JSON, and JSON embedded in prose. The
 * substring from the first `{` to the last `}` is parsed, and `passed` must be a
 * real boolean.
 */
export function parseQcJson(content: string): { passed: boolean; reason: string } {
  if (typeof content !== "string") {
    throw new CollageVisionQcError("INVALID_JSON", "Model response must be a string.");
  }

  const cleaned = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new CollageVisionQcError(
      "INVALID_JSON",
      "Model response did not contain a JSON object.",
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
  } catch (error) {
    throw new CollageVisionQcError(
      "INVALID_JSON",
      "Model response contained malformed JSON.",
      { cause: error },
    );
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CollageVisionQcError("INVALID_JSON", "Model response JSON was not an object.");
  }

  const record = value as Record<string, unknown>;
  if (typeof record.passed !== "boolean") {
    throw new CollageVisionQcError(
      "INVALID_JSON",
      'Model response JSON must contain a boolean "passed" field.',
    );
  }

  return {
    passed: record.passed,
    reason: typeof record.reason === "string" ? record.reason.trim() : "",
  };
}
