import test from "node:test";
import assert from "node:assert/strict";
import { buildTokenCatalog } from "./token-catalog.mjs";

const leaf = (value, type = "color") => ({ $value: value, $type: type });
const fixture = () => [
    { Palette: { modes: { color: { white: leaf("#fff"), black: leaf("#000") } } } },
    { "Web Elements": { modes: {
        light: { color: { card: { background: leaf("{white}") } }, "font-size": { "text-sm": leaf(14, "float") } },
        dark: { color: { card: { background: leaf("{black}"), "dark-only": leaf("{white}") } } },
    } } },
    { "Web Components": { modes: { "Mode 1": {} } } },
];

test("catalog resolves references and retains dark-only tokens", () => {
    const tokens = buildTokenCatalog(fixture(), {}).collections.flatMap(({ tokens }) => tokens);
    const find = (name) => tokens.find((token) => token.name === name);
    assert.deepEqual(find("--pp-color-card-background"), {
        name: "--pp-color-card-background", light: "var(--pp-palette-white)", dark: "var(--pp-palette-black)", type: "color",
    });
    assert.equal(find("--pp-color-card-dark-only").light, "initial");
    assert.equal(find("--pp-color-card-dark-only").dark, "var(--pp-palette-white)");
    assert.equal(find("--pp-font-size-text-sm").light, "14px");
});

test("local overrides replace existing tokens and missing references fail", () => {
    const tokens = buildTokenCatalog(fixture(), { light: { "color.card.background": "#abc" } }).collections.flatMap(({ tokens }) => tokens);
    assert.equal(tokens.filter((token) => token.name === "--pp-color-card-background").length, 1);
    assert.equal(tokens.find((token) => token.name === "--pp-color-card-background").light, "#abc");
    const invalid = fixture();
    invalid[2]["Web Components"].modes["Mode 1"].missing = leaf("{not-exported}");
    assert.throws(() => buildTokenCatalog(invalid, {}), /referências sem destino.*\n.*--pp-palette-not-exported/s);
});
