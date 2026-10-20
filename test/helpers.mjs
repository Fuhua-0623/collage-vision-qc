import http from "node:http";
import { once } from "node:events";

/** Start a local HTTP server on an ephemeral port. */
export async function startMockServer(handler) {
  const server = http.createServer((request, response) => {
    Promise.resolve(handler(request, response)).catch((error) => {
      if (!response.headersSent) {
        response.writeHead(500, { "content-type": "text/plain" });
      }
      response.end(error instanceof Error ? error.message : "handler failed");
    });
  });
  server.listen(0);
  await once(server, "listening");
  return server;
}

/** Build a URL for a server using only the address the server actually bound to. */
export function serverBaseUrl(server) {
  const address = server.address();
  const isIpv6 = address.family === "IPv6" || address.family === 6;
  const host = isIpv6 ? `[${address.address}]` : address.address;
  return `http://${host}:${address.port}`;
}

/** Close a mock server and any sockets it still holds open. */
export async function closeServer(server) {
  if (typeof server.closeAllConnections === "function") {
    server.closeAllConnections();
  }
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

/** Read and JSON-parse a request body. */
export async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** Build an OpenAI-compatible chat completion response body. */
export function completion(content) {
  return JSON.stringify({
    id: "chatcmpl-test",
    object: "chat.completion",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
  });
}
