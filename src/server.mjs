import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DeploymentEngine } from "./domain.mjs";

const root = fileURLToPath(new URL("../public", import.meta.url));
const engine = new DeploymentEngine();
const port = Number(process.env.PORT || 8080);
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };

function json(res, status, value) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(value));
}

async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/healthz") return json(res, 200, { status: "ok", version: "1.0.0" });
    if (url.pathname === "/api/state" && req.method === "GET") return json(res, 200, engine.snapshot());
    if (url.pathname === "/api/deploy" && req.method === "POST") { const input = await body(req); return json(res, 201, engine.deploy(input.service, input.version)); }
    if (url.pathname === "/api/advance" && req.method === "POST") { const input = await body(req); return json(res, 200, engine.advance(input.service)); }
    if (url.pathname === "/api/inject" && req.method === "POST") { const input = await body(req); return json(res, 200, engine.inject(input.service, input.fault)); }
    if (url.pathname === "/api/evaluate" && req.method === "POST") { const input = await body(req); return json(res, 200, engine.evaluate(input.service)); }
    if (url.pathname === "/api/reset" && req.method === "POST") return json(res, 200, engine.reset());
    if (url.pathname === "/metrics") {
      const lines = engine.services.flatMap((s) => [
        `deployguard_request_latency_p95_ms{service="${s.name}"} ${s.p95}`,
        `deployguard_error_rate_percent{service="${s.name}"} ${s.errorRate}`,
        `deployguard_canary_traffic_percent{service="${s.name}"} ${s.traffic}`
      ]);
      res.writeHead(200, { "content-type": "text/plain; version=0.0.4" });
      return res.end(lines.join("\n") + "\n");
    }
    const relative = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\//, "");
    if (relative.includes("..")) return json(res, 400, { error: "invalid path" });
    const file = await readFile(join(root, relative));
    res.writeHead(200, { "content-type": types[extname(relative)] || "application/octet-stream", "cache-control": "public, max-age=300" });
    res.end(file);
  } catch (error) {
    if (error.code === "ENOENT") return json(res, 404, { error: "not found" });
    json(res, 400, { error: error.message });
  }
});

server.listen(port, "0.0.0.0", () => console.log(`DeployGuard listening on http://0.0.0.0:${port}`));
