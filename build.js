import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { colorsFile, iconCatalog, publicDirectory, tokenCatalog } from "./catalog.js";

const dist = join(process.cwd(), "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(publicDirectory, dist, { recursive: true });
cpSync(colorsFile, join(dist, "colors.json"));
writeFileSync(join(dist, "icons.json"), JSON.stringify(iconCatalog()));
writeFileSync(join(dist, "tokens.json"), JSON.stringify(tokenCatalog()));

console.log("Static site written to dist/");
