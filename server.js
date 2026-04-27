const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const MAX_BODY_SIZE = 1024 * 1024;
const INDEX_KEY = "invader:designs";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

loadEnv(path.join(ROOT, ".env"));

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);

    if (!match || process.env[match[1]] !== undefined) {
      continue;
    }

    process.env[match[1]] = stripEnvQuotes(match[2]);
  }
}

function stripEnvQuotes(value) {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function getUpstashConfig() {
  const host = process.env.UPSTASH_HOST?.trim();
  const token = process.env.UPSTASH_TOKEN?.trim();

  if (!host || !token) {
    return null;
  }

  return {
    restUrl: host.startsWith("http://") || host.startsWith("https://") ? host : `https://${host}`,
    token,
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || `${HOST}:${PORT}`}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const decodedPath = decodeURIComponent(pathname);
  const filePath = path.resolve(ROOT, `.${decodedPath}`);

  if (!filePath.startsWith(ROOT) || !["/index.html", "/app.js", "/styles.css"].includes(decodedPath)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "content-type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    response.end(data);
  });
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;

      if (body.length > MAX_BODY_SIZE) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function validateDesign(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Each design must be an object.");
  }

  if (typeof input.id !== "string" || input.id.trim().length === 0 || input.id.length > 120) {
    throw new Error("Each design needs a valid id.");
  }

  const rows = input.rows;
  const cols = input.cols;

  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 2 || rows > 64 || cols < 2 || cols > 64) {
    throw new Error("Design dimensions must be between 2 and 64.");
  }

  if (!Array.isArray(input.pixels) || input.pixels.length !== rows) {
    throw new Error("Pixel data does not match the row count.");
  }

  for (const row of input.pixels) {
    if (!Array.isArray(row) || row.length !== cols || !row.every((value) => value === 0 || value === 1)) {
      throw new Error("Pixel rows must contain only 0 and 1 values.");
    }
  }

  const updatedAt = Date.parse(input.updatedAt);

  if (!Number.isFinite(updatedAt)) {
    throw new Error("Each design needs a valid updatedAt timestamp.");
  }

  return {
    schemaVersion: 1,
    id: input.id.trim(),
    name: typeof input.name === "string" && input.name.trim() ? input.name.trim().slice(0, 60) : "Untitled",
    rows,
    cols,
    pixels: input.pixels.map((row) => [...row]),
    updatedAt: new Date(updatedAt).toISOString(),
    uploadedAt: new Date().toISOString(),
    format: "INVADER1",
  };
}

function validateUploadPayload(payload) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.designs)) {
    throw new Error("Expected a designs array.");
  }

  if (payload.designs.length === 0) {
    throw new Error("Select at least one design to upload.");
  }

  if (payload.designs.length > 100) {
    throw new Error("Upload at most 100 designs at a time.");
  }

  return payload.designs.map(validateDesign);
}

async function uploadDesigns(request, response) {
  const config = getUpstashConfig();

  if (!config) {
    sendJson(response, 500, { error: "Missing UPSTASH_HOST or UPSTASH_TOKEN in .env." });
    return;
  }

  let designs;

  try {
    designs = validateUploadPayload(await readJsonBody(request));
  } catch (error) {
    sendJson(response, 400, { error: error.message });
    return;
  }

  const commands = designs.flatMap((design) => [
    ["SET", `invader:design:${design.id}`, JSON.stringify(design)],
    ["ZADD", INDEX_KEY, Date.parse(design.updatedAt), design.id],
  ]);

  try {
    const redisResponse = await fetch(`${config.restUrl.replace(/\/+$/, "")}/pipeline`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(commands),
    });
    const result = await redisResponse.json().catch(() => null);

    if (!redisResponse.ok) {
      sendJson(response, 502, { error: result?.error || `Upstash returned HTTP ${redisResponse.status}.` });
      return;
    }

    const failures = Array.isArray(result)
      ? result.filter((item) => item?.error).map((item) => item.error)
      : ["Unexpected Upstash response."];

    if (failures.length > 0) {
      sendJson(response, 502, { error: failures.join(" ") });
      return;
    }

    sendJson(response, 200, { uploaded: designs.length, ids: designs.map((design) => design.id) });
  } catch (error) {
    sendJson(response, 502, { error: `Redis upload failed: ${error.message}` });
  }
}

const server = http.createServer((request, response) => {
  const requestPath = new URL(request.url, `http://${request.headers.host || `${HOST}:${PORT}`}`).pathname;

  if (request.method === "POST" && requestPath === "/api/upload-designs") {
    uploadDesigns(request, response);
    return;
  }

  if (request.method === "GET" || request.method === "HEAD") {
    serveStatic(request, response);
    return;
  }

  response.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
  response.end("Method not allowed");
});

server.listen(PORT, HOST, () => {
  console.log(`Invader Gen is running at http://${HOST}:${PORT}`);
});
