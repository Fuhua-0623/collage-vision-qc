import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  CollageVisionQc,
  CollageVisionQcError,
  collageVisionQc,
  DEFAULT_PROMPT,
} from "../dist/index.js";
import {
  closeServer,
  completion,
  readJsonBody,
  serverBaseUrl,
  startMockServer,
} from "./helpers.mjs";

const PNG_SIGNATURE = "89504e470d0a1a0a";

function solidPng(width, height, background) {
  return sharp({ create: { width, height, channels: 3, background } })
    .png()
    .toBuffer();
}

function hasError(code, status) {
  return (error) => {
    assert.ok(error instanceof CollageVisionQcError, `expected CollageVisionQcError, got ${error}`);
    assert.equal(error.code, code);
    if (status !== undefined) {
      assert.equal(error.status, status);
    }
    return true;
  };
}

test("collageVisionQc sends one labeled collage and maps the verdict", async (t) => {
  const reference = await solidPng(400, 300, { r: 200, g: 30, b: 30 });
  const candidate = await solidPng(300, 400, { r: 30, g: 30, b: 200 });
  const requests = [];

  const server = await startMockServer(async (request, response) => {
    requests.push({
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: await readJsonBody(request),
    });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(completion('{"passed": true}'));
  });
  t.after(() => closeServer(server));

  const result = await collageVisionQc({
    referenceImg: reference,
    candidateImg: candidate,
    apiKey: "test-api-key",
    baseUrl: serverBaseUrl(server),
    retryDelayMs: 1,
  });

  assert.equal(result.passed, true);
  assert.equal(result.reason, "");
  assert.equal(result.raw, '{"passed": true}');
  assert.equal(result.model, "gpt-4o-mini");
  assert.equal(result.attempts, 1);
  assert.equal(typeof result.elapsedMs, "number");
  assert.ok(result.elapsedMs >= 0);
  assert.equal(result.collage.subarray(0, 8).toString("hex"), PNG_SIGNATURE);
  const metadata = await sharp(result.collage).metadata();
  assert.equal(metadata.width, 1200 + 675 + 28 * 3);
  assert.equal(metadata.height, 900 + 54 + 28 * 2);

  assert.equal(requests.length, 1);
  const [request] = requests;
  assert.equal(request.method, "POST");
  assert.equal(request.url, "/chat/completions");
  assert.equal(request.headers.authorization, "Bearer test-api-key");
  assert.equal(request.headers["content-type"], "application/json");
  assert.equal(request.body.model, "gpt-4o-mini");
  assert.equal(request.body.temperature, 0);
  assert.equal(request.body.messages.length, 1);
  assert.equal(request.body.messages[0].role, "user");

  const content = request.body.messages[0].content;
  assert.ok(Array.isArray(content));
  assert.equal(content.length, 2);
  assert.equal(content[0].type, "text");
  assert.equal(content[0].text, DEFAULT_PROMPT);
  assert.equal(content[1].type, "image_url");
  assert.match(content[1].image_url.url, /^data:image\/png;base64,/);
  const sent = Buffer.from(content[1].image_url.url.split(",", 2)[1], "base64");
  assert.deepEqual(sent, result.collage);
});

test("collageVisionQc returns a failing verdict with a trimmed reason", async (t) => {
  const server = await startMockServer((request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      completion('```json\n{"passed": false, "reason": "  invented a certification badge  "}\n```'),
    );
  });
  t.after(() => closeServer(server));

  const result = await collageVisionQc({
    referenceImg: await solidPng(20, 20, "#111111"),
    candidateImg: await solidPng(20, 20, "#222222"),
    apiKey: "test-api-key",
    baseUrl: `${serverBaseUrl(server)}/`,
    retryDelayMs: 1,
  });

  assert.equal(result.passed, false);
  assert.equal(result.reason, "invented a certification badge");
  assert.match(result.raw, /invented a certification badge/);
  assert.equal(result.attempts, 1);
});

test("collageVisionQc retries a 500 response and then succeeds", async (t) => {
  let requests = 0;
  const server = await startMockServer((request, response) => {
    requests += 1;
    if (requests === 1) {
      response.writeHead(500, { "content-type": "text/plain" });
      response.end("upstream failure");
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(completion('{"passed": true}'));
  });
  t.after(() => closeServer(server));

  const result = await collageVisionQc({
    referenceImg: await solidPng(20, 20, "#101010"),
    candidateImg: await solidPng(20, 20, "#202020"),
    apiKey: "test-api-key",
    baseUrl: serverBaseUrl(server),
    retryDelayMs: 1,
    maxAttempts: 3,
  });

  assert.equal(result.passed, true);
  assert.equal(result.attempts, 2);
  assert.equal(requests, 2);
});

test("collageVisionQc does not retry a 400 response", async (t) => {
  let requests = 0;
  const server = await startMockServer((request, response) => {
    requests += 1;
    response.writeHead(400, { "content-type": "text/plain" });
    response.end("bad request");
  });
  t.after(() => closeServer(server));

  await assert.rejects(
    collageVisionQc({
      referenceImg: await solidPng(20, 20, "#101010"),
      candidateImg: await solidPng(20, 20, "#202020"),
      apiKey: "test-api-key",
      baseUrl: serverBaseUrl(server),
      retryDelayMs: 1,
      maxAttempts: 3,
    }),
    hasError("HTTP_ERROR", 400),
  );
  assert.equal(requests, 1);
});

test("collageVisionQc retries malformed model output and surfaces INVALID_JSON", async (t) => {
  let requests = 0;
  const server = await startMockServer((request, response) => {
    requests += 1;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(completion("I think the candidate is fine."));
  });
  t.after(() => closeServer(server));

  await assert.rejects(
    collageVisionQc({
      referenceImg: await solidPng(20, 20, "#101010"),
      candidateImg: await solidPng(20, 20, "#202020"),
      apiKey: "test-api-key",
      baseUrl: serverBaseUrl(server),
      retryDelayMs: 1,
      maxAttempts: 3,
    }),
    hasError("INVALID_JSON"),
  );
  assert.equal(requests, 3);
});

test("collageVisionQc retries an empty model response", async (t) => {
  let requests = 0;
  const server = await startMockServer((request, response) => {
    requests += 1;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ choices: [{ message: { content: "" } }] }));
  });
  t.after(() => closeServer(server));

  await assert.rejects(
    collageVisionQc({
      referenceImg: await solidPng(20, 20, "#101010"),
      candidateImg: await solidPng(20, 20, "#202020"),
      apiKey: "test-api-key",
      baseUrl: serverBaseUrl(server),
      retryDelayMs: 1,
      maxAttempts: 2,
    }),
    hasError("EMPTY_RESPONSE"),
  );
  assert.equal(requests, 2);
});

test("collageVisionQc times out and retries within maxAttempts", async (t) => {
  let requests = 0;
  const server = await startMockServer(() => {
    requests += 1;
    // Never respond: the request is expected to time out.
  });
  t.after(() => closeServer(server));

  await assert.rejects(
    collageVisionQc({
      referenceImg: await solidPng(20, 20, "#101010"),
      candidateImg: await solidPng(20, 20, "#202020"),
      apiKey: "test-api-key",
      baseUrl: serverBaseUrl(server),
      retryDelayMs: 1,
      maxAttempts: 2,
      timeoutMs: 100,
    }),
    hasError("TIMEOUT"),
  );
  assert.equal(requests, 2);
});

test("CollageVisionQc reuses one configuration for many checks", async (t) => {
  const prompts = [];
  const models = [];
  const server = await startMockServer(async (request, response) => {
    const body = await readJsonBody(request);
    models.push(body.model);
    prompts.push(body.messages[0].content[0].text);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(completion('{"passed":true}'));
  });
  t.after(() => closeServer(server));

  const client = new CollageVisionQc({
    apiKey: "test-api-key",
    baseUrl: serverBaseUrl(server),
    model: "vision-test-model",
    prompt: "custom prompt",
    retryDelayMs: 1,
  });

  const first = await client.check({
    referenceImg: await solidPng(40, 40, "#101010"),
    candidateImg: await solidPng(40, 40, "#202020"),
  });
  const second = await client.check({
    referenceImg: await solidPng(40, 40, "#303030"),
    candidateImg: await solidPng(40, 40, "#404040"),
  });

  assert.equal(first.model, "vision-test-model");
  assert.equal(second.model, "vision-test-model");
  assert.deepEqual(models, ["vision-test-model", "vision-test-model"]);
  assert.deepEqual(prompts, ["custom prompt", "custom prompt"]);
});

test("CollageVisionQc rejects invalid constructor configuration", () => {
  assert.throws(
    () => new CollageVisionQc({ apiKey: "", baseUrl: "https://api.openai.com/v1" }),
    hasError("INVALID_INPUT"),
  );
});
