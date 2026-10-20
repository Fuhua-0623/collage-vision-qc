import { readFile } from "node:fs/promises";
import { CollageVisionQcError } from "./errors.js";
import type { CollageImageInput } from "./types.js";

const REMOTE_URL_PATTERN = /^https?:\/\//i;
const BASE64_DATA_URI_PATTERN = /;\s*base64(?:;|$)/i;

/**
 * Resolve an image input into raw bytes.
 *
 * Buffers are returned as-is. Strings may be a base64 data URI, an absolute or
 * relative http(s) URL, or a filesystem path.
 */
export async function loadImage(input: CollageImageInput): Promise<Buffer> {
  if (Buffer.isBuffer(input)) {
    if (input.length === 0) {
      throw new CollageVisionQcError("INVALID_INPUT", "Image buffer must not be empty.");
    }
    return input;
  }

  if (typeof input !== "string") {
    throw new CollageVisionQcError(
      "INVALID_INPUT",
      "Image input must be a Buffer or a string (file path, data URI, or http(s) URL).",
    );
  }

  const source = input.trim();
  if (source.length === 0) {
    throw new CollageVisionQcError("INVALID_INPUT", "Image input string must not be empty.");
  }

  if (source.startsWith("data:")) {
    return decodeDataUri(source);
  }
  if (REMOTE_URL_PATTERN.test(source)) {
    return downloadImage(source);
  }

  let file: Buffer;
  try {
    file = await readFile(source);
  } catch (error) {
    throw new CollageVisionQcError("INVALID_IMAGE", "Failed to read the image file.", {
      cause: error,
    });
  }
  if (file.length === 0) {
    throw new CollageVisionQcError("INVALID_IMAGE", "Image file is empty.");
  }
  return file;
}

function decodeDataUri(source: string): Buffer {
  const commaIndex = source.indexOf(",");
  if (commaIndex < 0) {
    throw new CollageVisionQcError(
      "INVALID_IMAGE",
      "Image data URI is missing its payload separator.",
    );
  }

  const metadata = source.slice("data:".length, commaIndex);
  if (!BASE64_DATA_URI_PATTERN.test(metadata)) {
    throw new CollageVisionQcError(
      "INVALID_IMAGE",
      "Only base64-encoded data URIs are supported for image input.",
    );
  }

  const payload = source.slice(commaIndex + 1);
  let buffer: Buffer;
  try {
    buffer = Buffer.from(payload, "base64");
  } catch (error) {
    throw new CollageVisionQcError(
      "INVALID_IMAGE",
      "Failed to decode the image data URI payload.",
      { cause: error },
    );
  }

  if (buffer.length === 0) {
    throw new CollageVisionQcError(
      "INVALID_IMAGE",
      "Image data URI payload was empty or not valid base64.",
    );
  }
  return buffer;
}

async function downloadImage(source: string): Promise<Buffer> {
  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch(source);
  } catch (error) {
    throw new CollageVisionQcError("INVALID_IMAGE", "Failed to download the image URL.", {
      cause: error,
    });
  }

  if (!response.ok) {
    throw new CollageVisionQcError(
      "INVALID_IMAGE",
      `Image URL responded with HTTP ${response.status}.`,
    );
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    throw new CollageVisionQcError(
      "INVALID_IMAGE",
      "Failed to read the image URL response body.",
      { cause: error },
    );
  }

  if (buffer.length === 0) {
    throw new CollageVisionQcError("INVALID_IMAGE", "Image URL returned an empty body.");
  }
  return buffer;
}
