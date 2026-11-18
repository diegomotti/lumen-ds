import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const publicDirectory = join(process.cwd(), "public");
export const colorsFile = join(process.cwd(), "resources", "tokens.json");
export const tokensFile = join(process.cwd(), "src", "tokens.css");
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

function tokenTypeFor(name) {
    if (name.startsWith("--pp-palette-") || name.startsWith("--pp-color-")) return "color";
    if (name.includes("font-family")) return "font-family";
    if (name.includes("font-size")) return "font-size";
    if (name.includes("font-weight")) return "font-weight";
    if (name.includes("line-height")) return "line-height";
    if (name.includes("tracking") || name.includes("letter-spacing")) return "tracking";
    if (name.startsWith("--pp-shape-")) return "shape";
    if (name.startsWith("--pp-component-")) return "component";
    return "other";
}

function tokenCollectionFor(name, fallback) {
    if (name.startsWith("--pp-palette-")) return "Palette";
    if (name.startsWith("--pp-component-")) return "Web Components";
    if (name.startsWith("--pp-color-") || name.startsWith("--pp-font-") || name.startsWith("--pp-shape-") || name.startsWith("--pp-line-") || name.startsWith("--pp-heading-")) {
        return "Web Elements";
    }
    return fallback ?? "Web Elements";
}

function parseTokenDeclarations(source) {
    const declarations = [];
    let collection = "Web Elements";
    for (const line of source.split(/\r?\n/)) {
        const comment = /^\s*\/\*\s*(.+?)\s*\*\/\s*$/.exec(line);
        if (comment) {
            const label = comment[1].replace(/\s+[—-].*$/, "").trim();
            if (["Palette", "Web Elements", "Web Components"].includes(label)) collection = label;
            continue;
        }
        const declaration = /^\s*(--[a-z0-9-]+)\s*:\s*(.+?);\s*$/i.exec(line);
        if (declaration) {
            declarations.push({ name: declaration[1], value: declaration[2], collection });
        }
    }
    return declarations;
}

export function tokenCatalog() {
    const source = readFileSync(tokensFile, "utf8");
    const lightSource = /:root\s*\{([\s\S]*?)\n\}/.exec(source)?.[1] ?? "";
    const darkSource = /\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/.exec(source)?.[1] ?? "";
    const lightTokens = parseTokenDeclarations(lightSource);
    const darkValues = new Map(parseTokenDeclarations(darkSource).map(({ name, value }) => [name, value]));
    const collections = new Map();

    for (const token of lightTokens) {
        const collection = tokenCollectionFor(token.name, token.collection);
        if (!collections.has(collection)) collections.set(collection, []);
        collections.get(collection).push({
            name: token.name,
            light: token.value,
            dark: darkValues.get(token.name) ?? token.value,
            type: tokenTypeFor(token.name),
        });
    }

    return {
        collections: [...collections].map(([name, tokens]) => ({ name, tokens })),
    };
}
