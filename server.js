import { createReadStream, existsSync, statSync, watch } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { colorsFile, iconCatalog, publicDirectory, tokenCatalog, tokensFile } from "./catalog.js";

const liveReloadClients = new Set();
const mimeTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
};

function notifyLiveReload() {
    for (const client of liveReloadClients) {
        client.write("event: reload\ndata: changed\n\n");
    }
}

function watchForChanges(target, options) {
    let debounceTimer;
    watch(target, options, () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(notifyLiveReload, 80);
    });
}

watchForChanges(publicDirectory, { recursive: true });
watchForChanges(colorsFile);
watchForChanges(tokensFile);

const server = createServer((request, response) => {
    const requestPath = request.url === "/" ? "/index.html" : request.url.split("?")[0];
    if (requestPath === "/live-reload") {
        response.writeHead(200, {
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Content-Type": "text/event-stream",
        });
        response.write("retry: 1000\n\n");
        liveReloadClients.add(response);
        request.on("close", () => liveReloadClients.delete(response));
        return;
    }

    if (requestPath === "/icons.json") {
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify(iconCatalog()));
        return;
    }

    if (requestPath === "/tokens.json") {
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify(tokenCatalog()));
        return;
    }

    const filePath = requestPath === "/colors.json"
        ? colorsFile
        : normalize(join(publicDirectory, requestPath));

    if ((!filePath.startsWith(publicDirectory) && requestPath !== "/colors.json") || !existsSync(filePath) || statSync(filePath).isDirectory()) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
    }

    response.writeHead(200, { "Content-Type": mimeTypes[extname(filePath)] ?? "application/octet-stream" });
    createReadStream(filePath).pipe(response);
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => {
    console.log(`Lumen DS is running at http://localhost:${port}`);
});