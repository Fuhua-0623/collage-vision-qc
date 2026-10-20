<p align="center"><a href="./README.md">English</a> | <a href="./README.zh-CN.md"><strong>简体中文</strong></a></p>

# @fuhua-0623/collage-vision-qc

[![npm version](https://img.shields.io/npm/v/@fuhua-0623/collage-vision-qc.svg)](https://www.npmjs.com/package/@fuhua-0623/collage-vision-qc)
[![CI](https://github.com/Fuhua-0623/collage-vision-qc/actions/workflows/ci.yml/badge.svg)](https://github.com/Fuhua-0623/collage-vision-qc/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/Fuhua-0623/collage-vision-qc/blob/main/LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

> **停止让 LLM 在比较多张图片时产生幻觉。** 与其发送两张独立的附件，不如发送一张带标签的拼接图，并获得严格的 `{ "passed": boolean, "reason"?: string }` 判定结果。

通过将候选图与参考图合成到同一张左右并排的拼接图中进行比较，检测候选图中是否出现幻觉元素或不一致元素。

`collage-vision-qc` 是一个轻量、依赖极少的 AI 图像质检模块。它把参考图和候选图合成为一张带标签的 PNG，将这一张图片发送给兼容 OpenAI 的视觉模型，并返回严格 JSON 判定结果，说明候选图是否凭空新增、删除了内容，或相对参考图做了实质性改动。它以 ESM 形式发布，附带完整 TypeScript 类型，运行时只依赖 `sharp`。

## 可视化示例

![拼接图示例：左侧为参考产品照片，右侧为同一张照片，但凭空多了一个认证徽章和一件额外配件](https://raw.githubusercontent.com/Fuhua-0623/collage-vision-qc/main/assets/example.png)

右侧的候选图凭空新增了两样参考图中从未出现的东西：一枚金色 “CERTIFIED” 徽章和第二条表带。模型只收到**一张**图片，并回答：

```json
{ "passed": false, "reason": "The candidate adds a certification badge and a second band that are not present in the reference." }
```

整个流程只包含一次合成和一次请求：

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

你也可以用更底层的辅助函数自行构建同样的拼接图：

```js
import { buildCollage } from "@fuhua-0623/collage-vision-qc";

const { collage, width, height } = await buildCollage(referenceBuffer, candidateBuffer);
// `collage` is the PNG shown above. Send it as one image part instead of two attachments.
```

示例图是合成的，由本包自身的 `buildCollage()` 生成；不包含任何第三方素材。

## 为什么需要它

当多模态模型在一次请求中收到多张图片时，结果并不可靠。它们会混淆哪张图对应哪个对象、比较错误的图片对，或者不知不觉地锚定在第一张图上。由此得到的质检判定结果无法信任：

- **跨图片混淆。** 模型会把参考图中的细节归到候选图上，或者反过来。
- **元素混合。** 面对两张附件时，模型会把两张图合并成一幅心理画面，从而漏掉凭空新增的物体。
- **参考不一致。** 同一张候选图会因附件顺序和提示词措辞不同而得到不同判定。
- **虚假营销宣称。** 生成的产品图会悄悄加上认证徽章、额外配件、logo、接口，或参考图从未支持过的宣称。

一张拼接图消除了这种歧义。这里恰好只有一张图片，而且左右两半在图片内部就有标签，因此提示词中的 “left” 和 “right” 指向的是模型真正能看到的像素。模型只需要比较同一张图片中的两个区域，这是一项简单得多、也稳定得多的任务。

## 工作原理

1. 两个输入都会被载入内存（Buffer、文件系统路径、base64 data URI 或 http(s) URL）。
2. 每个输入都会按配置的高度缩放，并保持宽高比。
3. 两半图像被并排绘制在白色画布上，顶部有一条深色标签栏标注它们。
4. 拼接图以单个 `data:image/png;base64,...` 负载发送到 `POST {baseUrl}/chat/completions`。
5. 要求模型只返回 JSON：`{"passed": true}` 或 `{"passed": false, "reason": "..."}`。
6. 响应会被严格解析（剥离代码围栏、提取第一个 `{` 到最后一个 `}` 之间的内容、`passed` 必须是布尔值），并与拼接图和请求元数据一起返回。

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

结果的形状刻意保持简单：

```json
{ "passed": false, "reason": "The candidate adds a certification badge that the reference does not show." }
```

## 环境要求

- Node.js >= 20（使用内置的全局 `fetch` 和 `AbortSignal.timeout`）
- 一个兼容 OpenAI、并支持视觉模型的 API 端点
- Windows、macOS 或 Linux（`npm install` 期间会安装预编译的 `sharp` 二进制文件）

## 安装

```bash
npm install @fuhua-0623/collage-vision-qc
```

在包发布到 npm 之前，可以直接从 GitHub 安装——npm 会运行 `prepare` 脚本并在本地构建该包：

```bash
npm install github:Fuhua-0623/collage-vision-qc
```

```bash
pnpm add @fuhua-0623/collage-vision-qc
```

```bash
yarn add @fuhua-0623/collage-vision-qc
```

## 快速开始

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

## 在多次检查中复用客户端

如果要验证整个商品目录，只需构造一次 `CollageVisionQc`。配置和默认值只解析并校验一次，之后每次 `check()` 调用都会复用它们。

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

`check()` 每次尝试只发起一次视觉请求，并返回与函数式 API 相同的结果结构。

## API 参考

### `collageVisionQc(options)`

执行一次完整检查，并以 `CollageVisionQcResult` 解析完成。

| 选项            | 类型                     | 默认值          | 说明                                                                                                 |
| --------------- | ------------------------ | --------------- | ---------------------------------------------------------------------------------------------------- |
| `referenceImg`  | `Buffer \| string`       | 必填            | 基准真值图。字符串可以是文件系统路径、base64 data URI 或 http(s) URL。                                |
| `candidateImg`  | `Buffer \| string`       | 必填            | 待测图片。接受的字符串形式与 `referenceImg` 相同。                                                    |
| `apiKey`        | `string`                 | 必填            | 端点的 Bearer 令牌。从不记录日志。                                                                    |
| `baseUrl`       | `string`                 | 必填            | API 根地址，例如 `https://api.openai.com/v1`。末尾斜杠会被去除。                                      |
| `model`         | `string`                 | `"gpt-4o-mini"` | 端点提供的任意支持视觉的模型。                                                                        |
| `prompt`        | `string`                 | 内置            | 覆盖指令文本。默认值为 `DEFAULT_PROMPT`。                                                             |
| `timeoutMs`     | `number`                 | `180000`        | 每次尝试的请求超时时间，单位为毫秒。                                                                  |
| `maxAttempts`   | `number`                 | `3`             | 总尝试次数，包含第一次。                                                                              |
| `retryDelayMs`  | `number`                 | `2000`          | 可重试尝试之间的延迟，单位为毫秒。                                                                    |
| `maxHeight`     | `number`                 | `900`           | 每一半缩放后的高度（保持宽高比，图片可能被放大）。                                                    |
| `padding`       | `number`                 | `28`            | 拼接图的内边距和外边距，单位为像素。                                                                  |
| `labelHeight`   | `number`                 | `54`            | 深色标签栏的高度，单位为像素。                                                                        |
| `leftLabel`     | `string`                 | `"REFERENCE"`   | 绘制在参考图那一半上的标签。渲染前会做 XML 转义。                                                     |
| `rightLabel`    | `string`                 | `"CANDIDATE"`   | 绘制在候选图那一半上的标签。渲染前会做 XML 转义。                                                     |

所有选项都会在任何文件、网络或图像处理发生之前完成校验。无效输入会抛出 `CollageVisionQcError`，错误码为 `INVALID_INPUT`。

| 结果字段  | 类型     | 说明                                          |
| --------- | -------- | --------------------------------------------- |
| `passed`  | `boolean`| 模型判定结果。                                |
| `reason`  | `string` | 一句话解释；当 `passed` 为 true 时为空字符串。 |
| `raw`     | `string` | 助手消息原文，便于调试提示词。                |
| `collage` | `Buffer` | 实际发送给模型的那张 PNG。                    |
| `model`   | `string` | 本次检查使用的模型名称。                      |
| `elapsedMs`| `number`| 成功请求的耗时，单位为毫秒。                  |
| `attempts`| `number` | 使用的尝试次数（1 表示没有重试）。            |

### `new CollageVisionQc(config)`

`config` 是除 `referenceImg` 和 `candidateImg` 之外的所有选项。构造函数会立即校验，因此配置错误的客户端会快速失败，而不是等到第一次检查时才失败。

### `buildCollage(reference, candidate, options?)`

合成两个图像缓冲区，并返回实际使用的布局。如果你希望在不调用模型的情况下检查或保存拼接图，这个函数很有用。

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

选项为 `maxHeight`、`padding`、`labelHeight`、`leftLabel` 和 `rightLabel`，默认值与上文相同。布局计算：

- `referenceWidth` 和 `candidateWidth` 是缩放后每一半的宽度。
- `width = referenceWidth + candidateWidth + padding * 3`
- `height = maxHeight + labelHeight + padding * 2`

### `parseQcJson(content)`

把模型响应解析为 `{ passed: boolean, reason: string }`。它会剥离开头的 ```` ```json ```` 围栏和结尾的 ```` ``` ````，修剪文本，提取从第一个 `{` 到最后一个 `}` 之间的子串，并要求 `passed` 为布尔值。缺少 JSON、JSON 格式错误或判定值不是布尔值时，会抛出 `INVALID_JSON`。

### `loadImage(input)`

将图像输入解析为 `Buffer`。Buffer 会原样返回（空 Buffer 会被拒绝），`data:` URI 会被 base64 解码，`http(s)` URL 会被下载，其余内容一律视为文件系统路径。失败时抛出 `INVALID_IMAGE`，且消息中绝不包含二进制内容。

## 自定义提示词与模型

`DEFAULT_PROMPT` 已导出，因此你可以在不重写它的情况下进行扩展：

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

保持响应契约不变：解析器要求一个 JSON 对象，且 `passed` 为布尔值。如果你的提示词改变了输出结构，解析会失败并抛出 `INVALID_JSON`，请求会一直重试到 `maxAttempts` 用尽。

## 错误处理

每次失败都是一个 `CollageVisionQcError`，带有稳定的 `code`；HTTP 失败时还会带有 `status`，并可选带有 `cause`：

| 错误码            | 触发时机                                                              | 是否重试      |
| ----------------- | ---------------------------------------------------------------------- | ------------- |
| `INVALID_INPUT`   | 选项错误：`apiKey` 为空、`baseUrl` 无效、`maxAttempts < 1` 等。        | 否            |
| `INVALID_IMAGE`   | 图像无法加载、解码，或无法合成为拼接图。                              | 否            |
| `HTTP_ERROR`      | 非 2xx 响应。`status` 保存 HTTP 状态码。                              | 仅 5xx、429   |
| `EMPTY_RESPONSE`  | 响应体或助手消息为空。                                                | 是            |
| `INVALID_JSON`    | 模型未返回包含布尔值 `passed` 的 JSON 对象。                          | 是            |
| `TIMEOUT`         | 请求超过 `timeoutMs`。                                                | 是            |
| `NETWORK_ERROR`   | 在收到响应之前发生传输失败。                                          | 是            |
| `NO_ATTEMPTS`     | 防御性错误：重试循环从未进入。                                        | 否            |

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

重试会在 `maxAttempts` 处停止；最后一个错误会原样重新抛出。400、401、403 等客户端错误永远不会重试，因为重复请求不可能成功。

## 成本与性能

- **每次检查只用一张图片。** 拼接图按单张图片输入计费，大小大致相当于一张截图，而不是两张独立图片外加附件开销。
- **先缩放。** `maxHeight` 默认每半 900 像素，可保持负载较小。处理缩略图时可调低；只有当判定结果依赖小号文字或精细硬件细节时才调高。
- **Temperature 0。** 请求强制 `temperature: 0`，以获得稳定、可重复的判定结果。
- **重试有上限。** 瞬时 5xx、超时、网络错误和错误 JSON 会以固定延迟重试，最多 `maxAttempts` 次，因此上游不稳定最多只会多花几次请求。
- **复用客户端。** 只构造一次 `CollageVisionQc`，可避免为批次中的每个条目重复校验配置。

## 局限性

- 判定结果的好坏取决于你所使用的视觉模型。对于边界情况，不同提示词和模型可能给出不一致的结论。
- 尺寸很大或细节非常丰富的图片在缩放后可能丢失小号文字；请让 `maxHeight` 足够大，以保留你关心的细节。
- 拼接图的高度由 `maxHeight` 固定；极宽的图片会生成非常宽的画布。
- 本模块不会对照外部来源核实宣称。它只将候选图与你提供的参考图进行比较，仅此而已。
- 判定通过并不保证品牌安全、授权许可或法规合规。

## 安全性

- API key 只会放在发往所配置 `baseUrl` 的 `Authorization` 请求头中。它从不记录日志，也从不嵌入拼接图。
- 你传入的图片会被 base64 编码进请求体，因此请把所配置的端点视为可信端点。
- 返回的 `collage` 缓冲区同时包含两张输入图片。请像对待源素材一样谨慎保存它。
- 生产环境中请使用 HTTPS 端点；本模块接受明文 HTTP，只是因为本地和私有网关是合理的部署目标。

## 许可证

MIT。参见 [LICENSE](./LICENSE)。
