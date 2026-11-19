import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceFile = join(root, "resources", "tokens.json");
const overridesFile = join(root, "scripts", "token-overrides.json");

const PALETTE = "Palette";
const ELEMENTS = "Web Elements";
const COMPONENTS = "Web Components";
const SKIP_PATHS = new Set(["business-name"]);

const fail = (message) => { throw new Error(`tokens: ${message}`); };

/* --------------------------------------------------------------- leitura */

export function buildTokenCatalog(
    exportData = readExport(),
    overrides = existsSync(overridesFile) ? JSON.parse(readFileSync(overridesFile, "utf8")) : {},
) {
    if (!Array.isArray(exportData)) fail("o export precisa ser um array de coleções (formato do Figma)");

    const collections = Object.fromEntries(exportData.flatMap((entry) => Object.entries(entry)));
    for (const name of [PALETTE, ELEMENTS, COMPONENTS]) {
        if (!collections[name]?.modes) fail(`coleção "${name}" ausente no export`);
    }

    /* ------------------------------------------------------------ utilitários */

    function walk(node, path = [], leaves = []) {
        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object" && "$value" in value) {
                leaves.push({ path: [...path, key], value: value.$value, type: value.$type });
            } else if (value && typeof value === "object") {
                walk(value, [...path, key], leaves);
            }
        }
        return leaves;
    }

    /** Nome da variável CSS. Paleta e componentes têm prefixos próprios. */
    function tokenName(collection, path) {
        if (collection === PALETTE) return `--pp-palette-${path.join("-")}`;
        if (collection === COMPONENTS) {
            const [group, ...rest] = path;
            if (path.length === 1) return `--pp-component-${group}`;
            if (group === "Workscale") return `--pp-component-workscale-${rest.join("-").toLowerCase()}`;
            return `--pp-component-${path.join("-")}`;
        }
        return `--pp-${path.join("-")}`;
    }

    const quote = (value) => JSON.stringify(String(value));

    /** Valor literal de uma folha do export, já no formato do CSS. */
    function formatValue(collection, path, value, type) {
        const group = collection === COMPONENTS ? null : path[0];

        if (collection === PALETTE) return String(value);
        if (group === "color" || (collection === COMPONENTS && type === "color")) return String(value);
        if (group === "font-family" || group === "font-weight") return quote(value);
        if (group === "font-tracking") return String(value) === "0" ? "0" : String(value);
        if (group === "font-size" || group === "line-height" || group === "shape" || group === "heading") {
            return typeof value === "number" ? `${value}px` : String(value);
        }
        if (collection === COMPONENTS) return typeof value === "string" ? quote(value) : String(value);
        if (type === "float") return String(value);
        return typeof value === "string" ? quote(value) : String(value);
    }

    /* ---------------------------------------------------------------- tokens */

    /** Folhas de uma coleção/modo já com nome CSS, na ordem do export. */
    function collect(collection, mode) {
        return walk(collections[collection].modes[mode])
            .filter(({ path }) => !SKIP_PATHS.has(path.join(".")))
            .map(({ path, value, type }) => ({
                path: path.join("."),
                name: tokenName(collection, path),
                value,
                type,
                format: (resolve) =>
                    typeof value === "string" && value.startsWith("{") && value.endsWith("}")
                        ? resolve(value.slice(1, -1))
                        : formatValue(collection, path, value, type),
            }));
    }

    const paletteLeaves = collect(PALETTE, "color");
    const elementLeaves = collect(ELEMENTS, "light");
    const componentLeaves = collect(COMPONENTS, "Mode 1");
    const darkLeaves = collect(ELEMENTS, "dark");

    /* Atalhos de paleta (primary-500 -> primary) mantidos por compatibilidade. */
    const PALETTE_SHORTCUTS = ["primary", "secondary", "tertiary", "cyan", "red", "green", "gray"];
    const paletteShortcuts = PALETTE_SHORTCUTS.filter((name) => paletteLeaves.some((leaf) => leaf.name === `--pp-palette-${name}-500`)).map(
        (name) => ({ name: `--pp-palette-${name}`, value: `var(--pp-palette-${name}-500)` }),
    );

    /* Resolve {alias} do export para var(--token) usando o caminho pontuado. */
    function createResolver(lookup) {
        return (reference) => {
            if (lookup.has(reference)) return `var(${lookup.get(reference)})`;
            if (!reference.includes(".")) return `var(--pp-palette-${reference})`;
            return `var(--pp-${reference.replace(/\./g, "-")})`;
        };
    }

    const lightLookup = new Map([...paletteLeaves, ...elementLeaves, ...componentLeaves].map((leaf) => [leaf.path, leaf.name]));
    const darkLookup = new Map([...lightLookup, ...darkLeaves.map((leaf) => [leaf.path, leaf.name])]);

    /* Overrides locais entram como tokens literais do tema claro. */
    const lightOverrides = Object.entries(overrides.light ?? {}).map(([path, value]) => {
        const name = `--pp-${path.replace(/\./g, "-")}`;
        lightLookup.set(path, name);
        darkLookup.set(path, name);
        return { name, value: String(value), override: true };
    });
    const darkOverrides = Object.entries(overrides.dark ?? {}).map(([path, value]) => {
        const name = `--pp-${path.replace(/\./g, "-")}`;
        darkLookup.set(path, name);
        return { name, value: String(value), override: true };
    });

    const declaration = (leaf, resolve) => `${leaf.name}: ${leaf.format(resolve)};`;

    const paletteLines = paletteLeaves.map((leaf) => declaration(leaf, createResolver(lightLookup)));
    const shortcutLines = paletteShortcuts.map((leaf) => `${leaf.name}: ${leaf.value};`);
    const elementLines = elementLeaves.map((leaf) => declaration(leaf, createResolver(lightLookup)));
    const componentLines = componentLeaves.map((leaf) => declaration(leaf, createResolver(lightLookup)));
    const lightOverrideLines = lightOverrides.map((leaf) => `${leaf.name}: ${leaf.value};`);

    const light = [...paletteLines, ...shortcutLines, ...elementLines, ...componentLines, ...lightOverrideLines];

    /* O tema escuro só declara o que muda em relação ao claro. */
    const lightValues = new Map(light.map((line) => [line.slice(0, line.indexOf(":")), line.slice(line.indexOf(":") + 1).trim()]));
    const darkLines = darkLeaves
        .map((leaf) => declaration(leaf, createResolver(darkLookup)))
        .filter((line) => lightValues.get(line.slice(0, line.indexOf(":"))) !== line.slice(line.indexOf(":") + 1).trim());
    const darkOverrideLines = darkOverrides.map((leaf) => `${leaf.name}: ${leaf.value};`);
    const dark = [...darkLines, ...darkOverrideLines];

    /* -------------------------------------------------------- validação */

    const defined = new Set(
        [
            ...paletteLeaves,
            ...paletteShortcuts,
            ...elementLeaves,
            ...componentLeaves,
            ...lightOverrides,
            ...darkLeaves,
            ...darkOverrides,
        ].map((leaf) => leaf.name),
    );

    const dangling = new Map();
    const inspect = (lines) => {
        for (const line of lines) {
            const [name, ...rest] = line.split(":");
            const value = rest.join(":");
            for (const match of value.matchAll(/var\((--pp-[a-z0-9-]+)\)/g)) {
                if (!defined.has(match[1])) {
                    if (!dangling.has(match[1])) dangling.set(match[1], []);
                    dangling.get(match[1]).push(name.trim());
                }
            }
        }
    };
    inspect(light);
    inspect(dark);

    if (dangling.size > 0) {
        const details = [...dangling].map(([missing, sources]) => `  ${missing} <- ${sources.join(", ")}`).join("\n");
        fail(`referências sem destino no export do Figma:\n${details}\ncorrija no Figma ou adicione o valor em scripts/token-overrides.json`);
    }

    const parseLine = (line) => {
        const separator = line.indexOf(":");
        return [line.slice(0, separator), line.slice(separator + 1).trim().replace(/;$/, "")];
    };
    const darkValues = new Map(dark.map(parseLine));
    const seen = new Set();
    const collectionLines = [
        [PALETTE, [...paletteLines, ...shortcutLines]],
        [ELEMENTS, [...elementLines.filter((line) => !lightOverrides.some(({ name }) => line.startsWith(`${name}:`))), ...lightOverrideLines]],
        [COMPONENTS, componentLines],
    ];
    const lightNames = new Set(collectionLines.flatMap(([, lines]) => lines.map((line) => parseLine(line)[0])));
    for (const line of dark) {
        const [name] = parseLine(line);
        if (!lightNames.has(name)) {
            collectionLines[1][1].push(`${name}: initial;`);
            lightNames.add(name);
        }
    }
    return {
        collections: collectionLines.map(([name, lines]) => ({
            name,
            tokens: lines.map(parseLine).filter(([tokenName]) => {
                if (seen.has(tokenName)) return false;
                seen.add(tokenName);
                return true;
            }).map(([tokenName, value]) => ({
                name: tokenName,
                light: value,
                dark: darkValues.get(tokenName) ?? value,
                type: tokenTypeFor(tokenName),
            })),
        })),
    };
}

function readExport() {
    if (!existsSync(sourceFile)) fail(`export não encontrado em ${sourceFile}`);
    return JSON.parse(readFileSync(sourceFile, "utf8"));
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
