import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { buildCollage } from "../dist/index.js";

const PNG_SIGNATURE = "89504e470d0a1a0a";

function solidPng(width, height, background) {
  return sharp({ create: { width, height, channels: 3, background } })
    .png()
    .toBuffer();
}

test("buildCollage composes a labeled PNG with the documented layout", async () => {
  const reference = await solidPng(400, 300, { r: 200, g: 40, b: 40 });
  const candidate = await solidPng(300, 400, { r: 40, g: 40, b: 200 });

  const layout = await buildCollage(reference, candidate);

  assert.equal(layout.collage.subarray(0, 8).toString("hex"), PNG_SIGNATURE);

  // Height 900 with aspect preserved: 400x300 -> 1200x900, 300x400 -> 675x900.
  assert.equal(layout.referenceWidth, 1200);
  assert.equal(layout.candidateWidth, 675);
  assert.equal(layout.width, 1200 + 675 + 28 * 3);
  assert.equal(layout.height, 900 + 54 + 28 * 2);
  assert.equal(layout.leftX, 28);
  assert.equal(layout.rightX, 28 + 1200 + 28);
  assert.ok(layout.leftX < layout.rightX);

  const metadata = await sharp(layout.collage).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, layout.width);
  assert.equal(metadata.height, layout.height);
});

test("buildCollage honors custom layout options and escapes labels", async () => {
  const reference = await solidPng(100, 50, { r: 10, g: 120, b: 10 });
  const candidate = await solidPng(50, 100, { r: 120, g: 10, b: 120 });

  const layout = await buildCollage(reference, candidate, {
    maxHeight: 200,
    padding: 7,
    labelHeight: 12,
    leftLabel: 'A & B <ref> "left"',
    rightLabel: "candidate 'right'",
  });

  assert.equal(layout.referenceWidth, 400);
  assert.equal(layout.candidateWidth, 100);
  assert.equal(layout.width, 400 + 100 + 21);
  assert.equal(layout.height, 200 + 12 + 14);
  assert.equal(layout.leftX, 7);
  assert.equal(layout.rightX, 7 + 400 + 7);

  const metadata = await sharp(layout.collage).metadata();
  assert.equal(metadata.width, layout.width);
  assert.equal(metadata.height, layout.height);
});

test("buildCollage resizes both halves to the requested height", async () => {
  const reference = await solidPng(800, 200, { r: 0, g: 0, b: 0 });
  const candidate = await solidPng(200, 800, { r: 255, g: 255, b: 255 });

  const layout = await buildCollage(reference, candidate, { maxHeight: 100 });

  assert.equal(layout.referenceWidth, 400);
  assert.equal(layout.candidateWidth, 25);
  assert.equal(layout.width, 400 + 25 + 28 * 3);
  assert.equal(layout.height, 100 + 54 + 28 * 2);
});
