import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../out/", import.meta.url));
const port = Number(process.env.PORT || 3017);
const types = { ".html": "text/html; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".ico": "image/x-icon" };
await stat(resolve(root, "index.html")).catch(() => { throw new Error("先に npm run build を実行してください。"); });
createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    let file = resolve(root, "." + pathname);
    if (file !== resolve(root) && !file.startsWith(resolve(root) + sep)) { response.writeHead(403); response.end(); return; }
    if (pathname.endsWith("/")) file = resolve(file, "index.html");
    else if (!extname(file)) file += ".html";
    const body = await readFile(file);
    response.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream", "X-Content-Type-Options": "nosniff" });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`Static preview: http://localhost:${port}`));
