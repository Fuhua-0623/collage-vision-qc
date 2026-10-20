import test from "node:test";
import assert from "node:assert/strict";
import { CollageVisionQc, CollageVisionQcError, collageVisionQc } from "../dist/index.js";

const IMAGE = Buffer.from("placeholder-bytes");

function baseOptions(overrides = {}) {
  return {
    referenceImg: IMAGE,
    candidateImg: IMAGE,
    apiKey: "test-api-key",
    baseUrl: "https://api.openai.com/v1",
    ...overrides,
  };
}

async function expectInvalidInput(options) {
  await assert.rejects(collageVisionQc(options), (error) => {
    assert.ok(error instanceof CollageVisionQcError, `expected CollageVisionQcError, got ${error}`);
    assert.equal(error.code, "INVALID_INPUT");
    return true;
  });
}

test("rejects an empty or missing apiKey", async () => {
  await expectInvalidInput(baseOptions({ apiKey: "" }));
  await expectInvalidInput(baseOptions({ apiKey: "   " }));
  await expectInvalidInput(baseOptions({ apiKey: undefined }));
  await expectInvalidInput(baseOptions({ apiKey: 123 }));
});

test("rejects an invalid baseUrl", async () => {
  await expectInvalidInput(baseOptions({ baseUrl: "" }));
  await expectInvalidInput(baseOptions({ baseUrl: "not-a-url" }));
  await expectInvalidInput(baseOptions({ baseUrl: "ftp://example.com/v1" }));
  await expectInvalidInput(baseOptions({ baseUrl: undefined }));
});

test("rejects an empty model", async () => {
  await expectInvalidInput(baseOptions({ model: "" }));
  await expectInvalidInput(baseOptions({ model: "  " }));
});

test("rejects invalid attempt and timing options", async () => {
  await expectInvalidInput(baseOptions({ maxAttempts: 0 }));
  await expectInvalidInput(baseOptions({ maxAttempts: 1.5 }));
  await expectInvalidInput(baseOptions({ maxAttempts: "3" }));
  await expectInvalidInput(baseOptions({ timeoutMs: 0 }));
  await expectInvalidInput(baseOptions({ timeoutMs: -10 }));
  await expectInvalidInput(baseOptions({ retryDelayMs: -1 }));
});

test("rejects invalid image inputs before any I/O", async () => {
  await expectInvalidInput(baseOptions({ referenceImg: Buffer.alloc(0) }));
  await expectInvalidInput(baseOptions({ referenceImg: "" }));
  await expectInvalidInput(baseOptions({ referenceImg: undefined }));
  await expectInvalidInput(baseOptions({ candidateImg: 42 }));
});

test("rejects a null or undefined options object", async () => {
  await expectInvalidInput(null);
  await expectInvalidInput(undefined);
});

test("validates options before reading image files", async () => {
  await expectInvalidInput(
    baseOptions({ apiKey: "", referenceImg: "file-that-does-not-exist.png" }),
  );
});

test("accepts defaults for optional settings", async (t) => {
  // Only validation is exercised here; no network request is made because the
  // missing file fails during image loading.
  await assert.rejects(
    collageVisionQc(baseOptions({ referenceImg: "file-that-does-not-exist.png" })),
    (error) => {
      assert.ok(error instanceof CollageVisionQcError);
      assert.equal(error.code, "INVALID_IMAGE");
      return true;
    },
  );
});

test("the class constructor applies the same validation", () => {
  assert.throws(
    () => new CollageVisionQc({ apiKey: "key", baseUrl: "" }),
    (error) => error instanceof CollageVisionQcError && error.code === "INVALID_INPUT",
  );
  assert.throws(
    () => new CollageVisionQc({ apiKey: "key", baseUrl: "https://api.openai.com/v1", maxAttempts: 0 }),
    (error) => error instanceof CollageVisionQcError && error.code === "INVALID_INPUT",
  );
});
