import { readdirSync } from "node:fs";
import { join } from "node:path";
import { buildTokenCatalog } from "./scripts/token-catalog.mjs";

export const publicDirectory = join(process.cwd(), "public");
export const colorsFile = join(process.cwd(), "resources", "tokens.json");
export const tokensFile = join(process.cwd(), "src", "tokens.lumen.css");
const iconsDirectory = join(publicDirectory, "assets", "icons");

export function iconCatalog() {
    return readdirSync(iconsDirectory)
        .filter((name) => name.endsWith(".svg"))
        .map((file) => {
            const match = /^type-(?<type>.+?)--icon-(?<icon>.+?)--filled-(?<filled>true|false)--monochrome-(?<monochrome>true|false)\.svg$/.exec(file);
            if (!match) return null;
            return {
                file,
                type: match.groups.type,
                icon: match.groups.icon,
                filled: match.groups.filled === "true",
                monochrome: match.groups.monochrome === "true",
            };
        })
        .filter(Boolean)
        .sort((left, right) => `${left.type}-${left.icon}-${left.file}`.localeCompare(`${right.type}-${right.icon}-${right.file}`));
}

export const tokenCatalog = buildTokenCatalog;
