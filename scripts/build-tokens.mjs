#!/usr/bin/env node
/*
 * Gera src/tokens.css a partir do export de variáveis do Figma.
 *
 * Entrada : resources/tokens.json  (export bruto: [{ "Palette": { modes } }, ...])
 * Overrides: scripts/token-overrides.json  (opcional, ver abaixo)
 * Saída   : src/tokens.css  (consumido por src/input.css, pelo catálogo e pelo build)
 *
 * O export é a fonte da verdade: qualquer token novo/alterado/removido no Figma
 * aparece aqui depois de rodar `npm run tokens`. O build roda esse script antes
 * de gerar o CSS, então o /tokens.json publicado nunca fica atrás do export.
 *
 * Overrides existem só para taps temporários no export — por exemplo quando um
 * alias aponta para um token que o Figma deixou de exportar. Formato:
 *
 *   {
 *     "light": { "color.card.alert-background": "rgba(252, 179, 21, 0.15)" }
 *   }
 *
 * As chaves são caminhos pontuados do export (sem o nome da coleção).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceFile = join(root, "resources", "tokens.json");
const overridesFile = join(root, "scripts", "token-overrides.json");
const outputFile = join(root, "src", "tokens.css");

const PALETTE = "Palette";
const ELEMENTS = "Web Elements";
const COMPONENTS = "Web Components";
const SKIP_PATHS = new Set(["business-name"]);

const fail = (message) => {
    console.error(`\ntokens: ${message}\n`);
    process.exit(1);
};

/* --------------------------------------------------------------- leitura */

if (!existsSync(sourceFile)) fail(`export não encontrado em ${sourceFile}`);

const exportData = JSON.parse(readFileSync(sourceFile, "utf8"));
if (!Array.isArray(exportData)) fail("o export precisa ser um array de coleções (formato do Figma)");

const collections = Object.fromEntries(exportData.flatMap((entry) => Object.entries(entry)));
for (const name of [PALETTE, ELEMENTS, COMPONENTS]) {
    if (!collections[name]?.modes) fail(`coleção "${name}" ausente no export`);
}

const overrides = existsSync(overridesFile) ? JSON.parse(readFileSync(overridesFile, "utf8")) : {};

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

/** Alias do bloco @theme inline (Tailwind CSS v4). */
function themeAlias(name) {
    if (name.startsWith("--pp-palette-")) return name.replace("--pp-palette-", "--color-pp-palette-");
    if (name.startsWith("--pp-color-")) return name.replace("--pp-color-", "--color-pp-");
    if (name.startsWith("--pp-font-family-")) return name.replace("--pp-font-family-", "--font-pp-");
    if (name.startsWith("--pp-font-size-")) return name.replace("--pp-font-size-", "--text-pp-");
    if (name.startsWith("--pp-font-tracking-")) return name.replace("--pp-font-tracking-", "--tracking-pp-");
    if (name.startsWith("--pp-shape-")) return name.replace("--pp-shape-", "--radius-pp-");
    return null;
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
    console.error("tokens: referências sem destino no export do Figma:");
    for (const [missing, sources] of dangling) console.error(`  ${missing} <- ${sources.join(", ")}`);
    fail("corrija no Figma ou adicione o valor em scripts/token-overrides.json");
}

/* --------------------------------------------------------- @theme inline */

const themeTokens = [
    ...paletteLeaves,
    ...paletteShortcuts,
    ...elementLeaves,
    ...lightOverrides,
    ...componentLeaves,
].map((leaf) => leaf.name);

const themeLines = [];
for (const name of themeTokens) {
    const alias = themeAlias(name);
    if (alias) themeLines.push(`${alias}: var(${name});`);
}

/* --------------------------------------------------------------- saída */

const block = (lines, indent = "  ") => lines.map((line) => indent + line).join("\r\n");

const output = [
    "/* Generated from the Pega Plantão Figma variables export.",
    ' * Source collections: Palette, Web Elements, Web Components.',
    ' * Theme switching: set data-theme="dark" on html or any containing element.',
    " */",
    "",
    ":root {",
    "  color-scheme: light;",
    "",
    "  /* Palette */",
    block([...paletteLines, ...shortcutLines]),
    "",
    "  /* Web Elements — light */",
    block(elementLines),
    "",
    "  /* Web Components */",
    block(componentLines),
    ...(lightOverrideLines.length > 0 ? ["", "  /* Overrides locais (ausentes no export do Figma) */", block(lightOverrideLines)] : []),
    "}",
    "",
    ':root[data-theme="dark"],',
    '[data-theme="dark"] {',
    "  color-scheme: dark;",
    "",
    block(dark),
    "}",
    "",
    "/* Tailwind CSS v4 theme aliases. */",
    "@theme inline {",
    block(themeLines),
    "}",
    "",
].join("\r\n");

writeFileSync(outputFile, output, "utf8");

console.log(
    `tokens.css: ${paletteLeaves.length} cores de paleta (+${paletteShortcuts.length} atalhos), ` +
        `${elementLeaves.length} web elements, ${componentLeaves.length} web components, ` +
        `${dark.length} overrides escuros, ${lightOverrides.length + darkOverrides.length} overrides locais, ` +
        `${themeLines.length} aliases`,
);
