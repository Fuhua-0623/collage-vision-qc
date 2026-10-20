import sharp from "sharp";
import {
  DEFAULT_LABEL_HEIGHT,
  DEFAULT_LEFT_LABEL,
  DEFAULT_MAX_HEIGHT,
  DEFAULT_PADDING,
  DEFAULT_RIGHT_LABEL,
} from "./types.js";
import type { BuildCollageOptions, CollageLayout } from "./types.js";

const CANVAS_BACKGROUND = "#ffffff";
const LABEL_BAR_COLOR = "#111827";
const LABEL_TEXT_COLOR = "#ffffff";
const LABEL_FONT_FAMILY = "Arial, Helvetica, sans-serif";
const LABEL_FONT_SIZE = 22;
const LABEL_FONT_WEIGHT = 700;
const LABEL_BASELINE = 35;

/**
 * Compose a labeled side-by-side collage from two images.
 *
 * Both halves are resized to `maxHeight` (aspect preserved, upscaling allowed)
 * and drawn onto a white canvas. The label bar uses the dark color `#111827`
 * with white text.
 */
export async function buildCollage(
  reference: Buffer,
  candidate: Buffer,
  options: BuildCollageOptions = {},
): Promise<CollageLayout> {
  const maxHeight = options.maxHeight ?? DEFAULT_MAX_HEIGHT;
  const padding = options.padding ?? DEFAULT_PADDING;
  const labelHeight = options.labelHeight ?? DEFAULT_LABEL_HEIGHT;
  const leftLabel = options.leftLabel ?? DEFAULT_LEFT_LABEL;
  const rightLabel = options.rightLabel ?? DEFAULT_RIGHT_LABEL;

  const [referenceHalf, candidateHalf] = await Promise.all([
    resizeHalf(reference, maxHeight),
    resizeHalf(candidate, maxHeight),
  ]);

  const [referenceMeta, candidateMeta] = await Promise.all([
    sharp(referenceHalf).metadata(),
    sharp(candidateHalf).metadata(),
  ]);

  const referenceWidth = referenceMeta.width ?? maxHeight;
  const candidateWidth = candidateMeta.width ?? maxHeight;
  const imageHeight = Math.max(
    referenceMeta.height ?? maxHeight,
    candidateMeta.height ?? maxHeight,
  );

  const width = referenceWidth + candidateWidth + padding * 3;
  const height = imageHeight + labelHeight + padding * 2;
  const leftX = padding;
  const rightX = padding * 2 + referenceWidth;
  const imageTop = labelHeight + padding;

  const labelSvg = [
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`,
    `<rect x="0" y="0" width="${width}" height="${labelHeight}" fill="${LABEL_BAR_COLOR}"/>`,
    `<text x="${leftX}" y="${LABEL_BASELINE}" font-family="${LABEL_FONT_FAMILY}" font-size="${LABEL_FONT_SIZE}" font-weight="${LABEL_FONT_WEIGHT}" fill="${LABEL_TEXT_COLOR}">${escapeXmlText(leftLabel)}</text>`,
    `<text x="${rightX}" y="${LABEL_BASELINE}" font-family="${LABEL_FONT_FAMILY}" font-size="${LABEL_FONT_SIZE}" font-weight="${LABEL_FONT_WEIGHT}" fill="${LABEL_TEXT_COLOR}">${escapeXmlText(rightLabel)}</text>`,
    "</svg>",
  ].join("");

  const collage = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: CANVAS_BACKGROUND,
    },
  })
    .composite([
      { input: Buffer.from(labelSvg), top: 0, left: 0 },
      { input: referenceHalf, top: imageTop, left: leftX },
      { input: candidateHalf, top: imageTop, left: rightX },
    ])
    .png()
    .toBuffer();

  return {
    collage,
    width,
    height,
    leftX,
    rightX,
    referenceWidth,
    candidateWidth,
  };
}

function resizeHalf(image: Buffer, height: number): Promise<Buffer> {
  return sharp(image)
    .resize({ height, fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer();
}

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
