import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
const root = resolve("dist-e2e");
createServer(async (req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  if (!path.startsWith("/poker/")) {
    res.writeHead(404).end();
    return;
  }
  const file = resolve(root, path.slice(7) || "index.html");
  if (!file.startsWith(root + sep)) {
    res.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(file);
    res
      .writeHead(200, {
        "Content-Type": {
          ".js": "application/javascript",
          ".css": "text/css",
          ".html": "text/html",
        }[extname(file)],
      })
      .end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(5181, "127.0.0.1");
