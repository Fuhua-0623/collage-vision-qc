import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { CollageVisionQcError, loadImage } from "../dist/index.js";
import { closeServer, serverBaseUrl, startMockServer } from "./helpers.mjs";

const PNG_SIGNATURE = "89504e470d0a1a0a";

function pngBuffer() {
  return sharp({ create: { width: 16, height: 16, channels: 3, background: "#336699" } })
    .png()
    .toBuffer();
}

function hasCode(code) {
  return (error) => {
    assert.ok(error instanceof CollageVisionQcError, `expected CollageVisionQcError, got ${error}`);
    assert.equal(error.code, code);
    return true;
  };
}

test("loadImage returns a Buffer input unchanged", async () => {
  const input = await pngBuffer();
  const loaded = await loadImage(input);
  assert.strictEqual(loaded, input);
  assert.equal(loaded.subarray(0, 8).toString("hex"), PNG_SIGNATURE);
});

test("loadImage decodes a base64 data URI", async () => {
  const source = await pngBuffer();
  const loaded = await loadImage(`data:image/png;base64,${source.toString("base64")}`);
  assert.deepEqual(loaded, source);
});

test("loadImage reads an image from a filesystem path", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "collage-vision-qc-"));
  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  const source = await pngBuffer();
  const file = join(directory, "reference.png");
  await writeFile(file, source);

  const loaded = await loadImage(file);
  assert.deepEqual(loaded, source);
});

test("loadImage downloads an image over http", async (t) => {
  const source = await pngBuffer();
  const server = await startMockServer((request, response) => {
    response.writeHead(200, { "content-type": "image/png" });
    response.end(source);
  });
  t.after(() => closeServer(server));

  const loaded = await loadImage(`${serverBaseUrl(server)}/image.png`);
  assert.deepEqual(loaded, source);
});

test("loadImage rejects an http error response", async (t) => {
  const server = await startMockServer((request, response) => {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  });
  t.after(() => closeServer(server));

  await assert.rejects(loadImage(`${serverBaseUrl(server)}/missing.png`), hasCode("INVALID_IMAGE"));
});

test("loadImage rejects an empty Buffer", async () => {
  await assert.rejects(loadImage(Buffer.alloc(0)), hasCode("INVALID_INPUT"));
});

test("loadImage rejects an empty string", async () => {
  await assert.rejects(loadImage("   "), hasCode("INVALID_INPUT"));
});

test("loadImage rejects a data URI without a base64 payload", async () => {
  await assert.rejects(loadImage("data:image/png,plain-text"), hasCode("INVALID_IMAGE"));
});

test("loadImage rejects a data URI with an empty payload", async () => {
  await assert.rejects(loadImage("data:image/png;base64,"), hasCode("INVALID_IMAGE"));
});

test("loadImage rejects a missing file path", async () => {
  const missing = join(tmpdir(), "collage-vision-qc-does-not-exist.png");
  await assert.rejects(loadImage(missing), hasCode("INVALID_IMAGE"));
});

test("loadImage rejects a non-image input type", async () => {
  await assert.rejects(loadImage(42), hasCode("INVALID_INPUT"));
});
