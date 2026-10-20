import test from "node:test";
import assert from "node:assert/strict";
import { CollageVisionQcError, parseQcJson } from "../dist/index.js";

function isInvalidJson(error) {
  return error instanceof CollageVisionQcError && error.code === "INVALID_JSON";
}

test("parseQcJson accepts a plain passing verdict", () => {
  assert.deepEqual(parseQcJson('{"passed":true}'), { passed: true, reason: "" });
});

test("parseQcJson accepts a plain failing verdict", () => {
  assert.deepEqual(parseQcJson('{"passed":false,"reason":"invented a logo"}'), {
    passed: false,
    reason: "invented a logo",
  });
});

test("parseQcJson accepts markdown-fenced JSON", () => {
  assert.deepEqual(parseQcJson('```json\n{"passed":false,"reason":"extra cable"}\n```'), {
    passed: false,
    reason: "extra cable",
  });
});

test("parseQcJson accepts JSON embedded in prose", () => {
  assert.deepEqual(parseQcJson('Comparison finished. {"passed": true} Done.'), {
    passed: true,
    reason: "",
  });
});

test("parseQcJson trims the reason", () => {
  assert.deepEqual(parseQcJson('{"passed":false,"reason":"   extra cable   "}'), {
    passed: false,
    reason: "extra cable",
  });
});

test("parseQcJson rejects responses without a JSON object", () => {
  assert.throws(() => parseQcJson("The candidate looks fine."), isInvalidJson);
});

test("parseQcJson rejects malformed JSON", () => {
  assert.throws(() => parseQcJson("{passed: true}"), isInvalidJson);
});

test("parseQcJson rejects a non-boolean passed field", () => {
  assert.throws(() => parseQcJson('{"passed":"yes"}'), isInvalidJson);
});

test("parseQcJson rejects JSON that is not an object", () => {
  assert.throws(() => parseQcJson("[1, 2, 3]"), isInvalidJson);
});

test("parseQcJson does not throw away unknown fields", () => {
  assert.deepEqual(parseQcJson('{"passed":true,"reason":null,"confidence":0.9}'), {
    passed: true,
    reason: "",
  });
});
