let tokens = [];
let toastTimeout;
let figmaIcons = [];
let updatesData = [];
let activeIconFacet = "type";
let colorCollections = {};
let activeColorCategory = "Palette";
let activeColorMode = "";
const buttonSelection = { color: "primary", shape: "slightlyRounded", style: "filled" };
const buttonVariantDefinitions = [
    "primary|none|icon|default|false", "red|slightlyRounded|text|default|false", "primary|none|text|default|false", "primary|none|icon|active|false",
    "primary|slightlyRounded|filled|default|false", "primary|slightlyRounded|outline|disabled|false", "primary|slightlyRounded|outline|default|false", "primary|fullyRounded|filled|default|false",
    "primary|fullyRounded|outline|default|false", "red|slightlyRounded|filled|default|false", "red|slightlyRounded|outline|default|false", "red|fullyRounded|filled|default|false",
    "red|fullyRounded|outline|default|false", "secondary|slightlyRounded|filled|default|false", "secondary|slightlyRounded|outline|default|false", "secondary|fullyRounded|filled|default|false",
    "secondary|fullyRounded|outline|default|false", "tertiary|slightlyRounded|filled|default|false", "tertiary|slightlyRounded|outline|default|false", "tertiary|fullyRounded|filled|default|false",
    "tertiary|fullyRounded|outline|default|false", "green|slightlyRounded|filled|default|false", "green|slightlyRounded|outline|default|false", "green|fullyRounded|filled|default|false",
    "green|fullyRounded|outline|default|false", "white|slightlyRounded|filled|default|false", "white|slightlyRounded|outline|default|false", "white|fullyRounded|filled|default|false",
    "white|fullyRounded|outline|default|false", "primary|mediumRounded|filled|default|false", "primary|mediumRounded|outline|default|false", "primary25|fullyRounded|filled|default|false",
    "primary25|fullyRounded|outline|default|false", "appPrimary|mediumRounded|filled|default|false", "appPrimary|mediumRounded|outline|default|false", "white|slightlyRounded|text|default|false",
    "secondary|mediumRounded|outline|default|false",
].map((variant) => {
    const [style, shape, type, state, rightIcon] = variant.split("|");
    return { style, shape, type, state, rightIcon: rightIcon === "true" };
});
const iconFilters = {
    type: "todos",
    filled: "todos",
    monochrome: "false",
};

if ("EventSource" in window) {
    const liveReload = new EventSource("/live-reload");
    liveReload.addEventListener("reload", () => window.location.reload());
    window.addEventListener("pagehide", () => liveReload.close());
}

function familyFrom(name) {
    if (name === "black" || name === "white") return "Base";
    return name.match(/^([a-z]+)/i)?.[1] ?? "Outros";
}

function colorTokensFrom(data, prefix = "") {
    if (!data || typeof data !== "object") return [];
    return Object.entries(data).flatMap(([name, value]) => {
        const path = prefix ? `${prefix}.${name}` : name;
        if (value && typeof value === "object" && "$type" in value && "$value" in value) {
            return [{ name: path, type: value.$type, value: value.$value }];
        }
        return colorTokensFrom(value, path);
    });
}

function colorGroupFrom(name, category) {
    if (category === "Palette") return familyFrom(name);
    const parts = name.split(".");
    if (parts.length >= 3) return parts.slice(0, 2).join(".");
    if (parts.length === 2) return parts[0];
    return name.match(/^[a-z]+/i)?.[0] ?? "Outros";
}

function colorGroupLabel(group, category) {
    if (category === "Palette") return group;
    return group
        .split(/[.-]/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" / ");
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;",
    })[character]);
}

function formatValue(value) {
    const text = String(value);
    return text.startsWith("#") ? text.toUpperCase() : text;
}

function colorReferenceValues() {
    const values = new Map();
    for (const modes of Object.values(colorCollections)) {
        for (const modeData of Object.values(modes)) {
            for (const token of colorTokensFrom(modeData)) {
                if (token.type === "color") values.set(token.name, token.value);
            }
        }
    }
    for (const token of tokens) {
        if (token.type === "color") values.set(token.name, token.value);
    }
    return values;
}

function resolveColorValue(value, references, seen = new Set()) {
    const text = String(value);
    const reference = /^\{([^}]+)\}$/.exec(text.trim());
    if (reference) {
        const name = reference[1];
        if (seen.has(name) || !references.has(name)) return null;
        seen.add(name);
        return resolveColorValue(references.get(name), references, seen);
    }
    return globalThis.CSS?.supports?.("color", text) ? text : null;
}

function render(query = "") {
    const groupsContainer = document.querySelector("#color-groups");
    const resultLabel = document.querySelector("#result-label");
    if (!groupsContainer) return;

    const normalized = query.trim().toLowerCase();
    const results = tokens.filter(({ name, value }) => `${name} ${value}`.toLowerCase().includes(normalized));
    const grouped = Object.groupBy(results, ({ name }) => colorGroupFrom(name, activeColorCategory));
    const references = colorReferenceValues();
    if (resultLabel) {
        resultLabel.textContent = i18n.tn("app.tokens-found", results.length);
    }

    if (!results.length) {
        groupsContainer.innerHTML = `<p class="border-t border-black/15 pt-10 text-sm text-black/55">${escapeHtml(i18n.t("app.no-tokens"))}</p>`;
        return;
    }

    groupsContainer.innerHTML = Object.entries(grouped).map(([family, entries]) => `
        <section class="scroll-mt-24" id="${escapeHtml(family.toLowerCase())}">
            <div class="mb-5 flex items-baseline justify-between pb-3">
                <h3 class="text-2xl font-medium text-black capitalize">${escapeHtml(colorGroupLabel(family, activeColorCategory))}</h3>
                <span class="font-mono text-xs text-black/45">${i18n.tn("app.tokens-count", entries.length)}</span>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                ${entries.map(({ name, value, type }) => {
                    const displayValue = formatValue(value);
                    const swatch = type === "color" ? resolveColorValue(value, references) : null;
                    const copyTitle = escapeHtml(i18n.t("app.copy-token", { name, value: displayValue }));
                    return `
                    <article class="group min-h-32 border border-black/15 bg-white text-left transition rounded-xl hover:-translate-y-1 hover:shadow-xl">
                        ${swatch
                            ? `<button class="block h-20 w-full cursor-pointer rounded-tl-xl rounded-tr-xl border-b border-black/10" type="button" style="background:${escapeHtml(swatch)}" data-copy="${escapeHtml(value)}" data-copy-kind="value" title="${copyTitle}" aria-label="${copyTitle}"></button>`
                            : `<div class="flex h-20 items-center justify-center overflow-hidden rounded-tl-xl rounded-tr-xl border-b border-black/10 bg-secondary-50 px-3 text-center font-mono text-xs text-black/55" style="overflow-wrap:anywhere">${escapeHtml(displayValue)}</div>`}
                        <button class="mt-3 block w-full cursor-pointer px-3 text-left text-[13px] font-medium hover:underline" type="button" data-copy="${escapeHtml(name)}" data-copy-kind="name" title="${escapeHtml(i18n.t("app.copy-name", { icon: name }))}">${escapeHtml(name)}</button>
                        <button class="block w-full cursor-pointer px-3 pb-3 pt-1 text-left font-mono text-[11px] text-black/50 hover:text-black hover:underline" type="button" data-copy="${escapeHtml(value)}" data-copy-kind="value" title="${copyTitle}">${escapeHtml(displayValue)}</button>
                    </article>
                `}).join("")}
            </div>
        </section>
    `).join("");
}

function updateColorTabs() {
    const tabs = document.querySelectorAll("[data-color-category]");
    tabs.forEach((tab) => {
        const selected = tab.dataset.colorCategory === activeColorCategory;
        tab.hidden = !Object.prototype.hasOwnProperty.call(colorCollections, tab.dataset.colorCategory);
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
        tab.className = `shrink-0 rounded-xl border px-4 py-2 text-xs font-medium transition ${selected
            ? "border-primary-500 bg-primary-25 text-primary-800"
            : "border-black/15 bg-white text-black/55 hover:border-black hover:text-black"}`;
    });

    const activeTab = [...tabs].find((tab) => tab.dataset.colorCategory === activeColorCategory);
    const panel = document.querySelector("#color-groups");
    if (activeTab && panel) panel.setAttribute("aria-labelledby", activeTab.id);
}

function updateColorModes() {
    const modeGroup = document.querySelector("#color-modes");
    if (!modeGroup) return;
    const modes = Object.keys(colorCollections[activeColorCategory] ?? {});
    modeGroup.replaceChildren();
    modeGroup.hidden = modes.length < 2;
    modeGroup.classList.toggle("hidden", modes.length < 2);
    modeGroup.setAttribute("aria-label", i18n.t("colors.modes"));

    for (const mode of modes) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `shrink-0 rounded-xl border px-4 py-2 text-xs font-medium transition ${mode === activeColorMode
            ? "border-primary-500 bg-primary-25 text-primary-800"
            : "border-black/15 bg-white text-black/55 hover:border-black hover:text-black"}`;
        button.dataset.colorMode = mode;
        button.setAttribute("aria-pressed", String(mode === activeColorMode));
        button.textContent = mode === "light"
            ? i18n.t("colors.mode-light")
            : mode === "dark"
                ? i18n.t("colors.mode-dark")
                : mode;
        modeGroup.append(button);
    }
}

function activateColorCategory(category) {
    if (!Object.prototype.hasOwnProperty.call(colorCollections, category)) return;
    activeColorCategory = category;
    const modes = colorCollections[category];
    if (!Object.prototype.hasOwnProperty.call(modes, activeColorMode)) {
        activeColorMode = Object.keys(modes)[0] ?? "";
    }
    tokens = colorTokensFrom(modes[activeColorMode]);
    updateColorTabs();
    updateColorModes();
    render(document.querySelector("#color-search")?.value ?? "");
}

function activateColorMode(mode) {
    if (!Object.prototype.hasOwnProperty.call(colorCollections[activeColorCategory] ?? {}, mode)) return;
    activeColorMode = mode;
    tokens = colorTokensFrom(colorCollections[activeColorCategory][mode]);
    updateColorModes();
    render(document.querySelector("#color-search")?.value ?? "");
}

function showToast(message) {
    const toast = document.querySelector("#toast");
    if (!toast) return;

    toast.textContent = message;
    toast.classList.remove("hidden");
    clearTimeout(toastTimeout);
    toastTimeout = window.setTimeout(() => toast.classList.add("hidden"), 1600);
}

function initializeColorCatalog() {
    const colorTabs = document.querySelector("#color-tabs");
    colorTabs?.addEventListener("click", (event) => {
        const tab = event.target.closest("[data-color-category]");
        if (tab) activateColorCategory(tab.dataset.colorCategory);
    });
    colorTabs?.addEventListener("keydown", (event) => {
        const tab = event.target.closest("[data-color-category]");
        if (!tab) return;
        const tabs = [...colorTabs.querySelectorAll("[data-color-category]:not([hidden])")];
        const index = tabs.indexOf(tab);
        const nextIndex = event.key === "ArrowRight"
            ? (index + 1) % tabs.length
            : event.key === "ArrowLeft"
                ? (index - 1 + tabs.length) % tabs.length
                : event.key === "Home"
                    ? 0
                    : event.key === "End"
                        ? tabs.length - 1
                        : -1;
        if (nextIndex < 0) return;
        event.preventDefault();
        tabs[nextIndex].focus();
        activateColorCategory(tabs[nextIndex].dataset.colorCategory);
    });

    document.querySelector("#color-modes")?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-color-mode]");
        if (button) activateColorMode(button.dataset.colorMode);
    });

    const groupsContainer = document.querySelector("#color-groups");
    const searchInput = document.querySelector("#color-search");

    if (groupsContainer) {
        groupsContainer.addEventListener("click", async (event) => {
            const target = event.target.closest("[data-copy]");
            if (!target) return;
            try {
                await navigator.clipboard.writeText(target.dataset.copy);
                showToast(i18n.t("app.copied", { value: formatValue(target.dataset.copy) }));
            } catch {
                showToast(i18n.t(target.dataset.copyKind === "name" ? "app.copy-name-failed" : "app.copy-value-failed"));
            }
        });
    }

    if (searchInput) {
        searchInput.addEventListener("input", (event) => render(event.target.value));
    }
}

function initializeTypographySpecimens() {
    const search = document.querySelector("#type-search");
    search?.addEventListener("input", () => {
        const query = search.value.trim().toLowerCase();
        document.querySelectorAll("[data-type-specimen]").forEach((specimen) => {
            specimen.classList.toggle("hidden", !specimen.querySelector("h3")?.textContent.toLowerCase().includes(query));
        });
    });

    document.querySelectorAll("[data-type-specimen]").forEach((specimen) => {
        const preview = specimen.querySelector("[data-type-preview]");
        const weightInput = specimen.querySelector("[data-type-weight]");
        const weightLabel = specimen.querySelector("[data-weight-label]");
        if (!preview || !weightInput || !weightLabel) return;

        weightInput.addEventListener("input", () => {
            preview.style.fontWeight = weightInput.value;
            weightLabel.textContent = weightInput.value;
        });
    });
}

function renderButtonCatalog() {
    const container = document.querySelector("#button-variants");
    if (!container) return;

    const styleClasses = {
        primary: "bg-primary-500 text-white hover:bg-primary-800",
        primary25: "bg-primary-25 text-primary-800 hover:bg-primary-500",
        appPrimary: "bg-primary-800 text-white hover:bg-primary-500",
        secondary: "bg-secondary-100 text-black hover:bg-secondary-200",
        tertiary: "bg-tertiary-500 text-black hover:bg-tertiary-600",
        red: "bg-red-600 text-white hover:bg-red-700",
        green: "bg-green-600 text-white hover:bg-green-700",
        white: "bg-white text-black shadow-sm hover:bg-secondary-50",
    };
    const outlineText = {
        primary: "!text-primary-500 hover:!bg-primary-500/10",
        primary25: "!text-primary-25 hover:!bg-primary-25/10",
        appPrimary: "!text-primary-300 hover:!bg-primary-300/10",
        secondary: "!text-white hover:!bg-white/10",
        tertiary: "!text-tertiary-500 hover:!bg-tertiary-500/10",
        red: "!text-red-500 hover:!bg-red-500/10",
        green: "!text-green-500 hover:!bg-green-500/10",
        white: "!text-white hover:!bg-white/10",
    };
    const activeFilled = {
        primary: "!bg-primary-400",
        primary25: "!bg-primary-50",
        appPrimary: "!bg-primary-700",
        secondary: "!bg-secondary-200",
        tertiary: "!bg-tertiary-400",
        red: "!bg-red-500",
        green: "!bg-green-500",
        white: "!bg-secondary-50",
    };
    const activeText = {
        primary: "!text-primary-400",
        primary25: "!text-primary-700",
        appPrimary: "!text-primary-400",
        secondary: "!text-white/70",
        tertiary: "!text-tertiary-400",
        red: "!text-red-500",
        green: "!text-green-500",
        white: "!text-white/70",
    };
    const shapeClasses = {
        none: "rounded-none",
        slightlyRounded: "rounded-lg",
        mediumRounded: "rounded-xl",
        fullyRounded: "rounded-full",
    };
    const typeLabels = { icon: "+", text: i18n.t("app.button-action"), filled: i18n.t("buttons.continuar"), outline: i18n.t("buttons.continuar") };

    const options = {
        color: [...new Set(buttonVariantDefinitions.map(({ style }) => style))],
        shape: Object.keys(shapeClasses),
        style: [...new Set(buttonVariantDefinitions.map(({ type }) => type))],
    };
    const selects = { color: "#button-color", shape: "#button-shape", style: "#button-style" };
    Object.entries(selects).forEach(([key, selector]) => {
        const select = document.querySelector(selector);
        if (!select) return;
        select.innerHTML = options[key].map((value) => `<option value="${value}"${value === buttonSelection[key] ? " selected" : ""}>${value}</option>`).join("");
        if (!select.dataset.bound) {
            select.dataset.bound = "true";
            select.addEventListener("change", () => {
                buttonSelection[key] = select.value;
                renderButtonCatalog();
            });
        }
    });

    const { color, shape, style: type } = buttonSelection;
    const states = [["default", "Default"], ["active", "Active"], ["disabled", "Disabled"]];
    container.innerHTML = states.map(([state, stateLabel]) => {
        const isDisabled = state === "disabled";
        const stateClass = isDisabled ? "cursor-not-allowed opacity-40" : state === "active" ? (type === "filled" || type === "icon" ? activeFilled[color] : activeText[color]) : "";
        const typeClass = type === "outline" ? `border border-current !bg-transparent ${state === "active" ? activeText[color] : outlineText[color]}` : type === "text" ? `bg-transparent${color === "tertiary" ? " !bg-transparent !text-tertiary-700 hover:!bg-tertiary-50" : ""}` : "";
        const iconClass = type === "icon" ? "size-10 px-0" : "px-4";
        const label = `${color} / ${shape} / ${type} / ${state}`;
        return `
            <article class="min-w-0 bg-white p-5">
                <div class="flex min-h-40 items-center justify-center border border-black/10 ${type === "outline" ? "bg-black" : "bg-secondary-50"} p-4">
                    <button class="${shapeClasses[shape]} ${styleClasses[color]} ${typeClass} ${iconClass} py-2.5 text-sm font-medium transition focus:outline-2 focus:outline-offset-2 focus:outline-primary-500 ${stateClass}" type="button" ${isDisabled ? "disabled" : ""} aria-label="${label}">${typeLabels[type]}</button>
                </div>
                <p class="mt-4 break-words font-mono text-xs text-black/70">${label}</p>
                <p class="mt-2 text-[11px] uppercase tracking-wide text-black/45">State=${stateLabel}</p>
            </article>
        `;
    }).join("");
}
function renderFigmaIconCatalog(query = "") {
    const grid = document.querySelector("#figma-icon-grid");
    const facetsContainer = document.querySelector("#icon-facets");
    const optionsContainer = document.querySelector("#icon-facet-options");
    const resultLabel = document.querySelector("#icon-result-label");
    if (!grid || !facetsContainer || !optionsContainer) return;

    const facets = [
        ["type", "todos", i18n.t("app.facet-all")],
        ["filled", "false", "Style Outline"],
        ["filled", "true", "Style Filled"],
        ["monochrome", "true", "Style Monochrome"],
    ];
    const valuesFor = (facet) => {
        if (facet === "type") return [...new Set(figmaIcons.map(({ type }) => type))].sort((left, right) => left.localeCompare(right));
        return ["false", "true"];
    };
    const labelFor = (facet, value) => {
        if (value === "Todos") return "Todos os tipos";
        if (facet === "filled") return value === "true" ? "Filled" : "Outline";
        if (facet === "monochrome") return value === "true" ? "Monochrome" : "Color";
        return value;
    };

    facetsContainer.innerHTML = facets.map(([facet, value, label = facet]) => {
        const selected = facet === "type"
            ? activeIconFacet === "type"
            : activeIconFacet === facet && iconFilters[facet] === value;
        return `
        <button class="shrink-0 border px-4 py-2 text-xs font-medium transition ${selected ? "border-primary-500 bg-primary-25 text-primary-800 rounded-xl" : "border-black/15 bg-white text-black/55 hover:border-black hover:text-black rounded-xl"}" type="button" data-icon-facet="${facet}" data-icon-value="${value ?? ""}" role="tab" aria-selected="${selected}">${label}</button>
    `;
    }).join("");

    optionsContainer.classList.toggle("hidden", activeIconFacet !== "type");
    const layout = optionsContainer.parentElement;
    if (layout) {
        layout.style.gridTemplateColumns = activeIconFacet === "type" ? "" : "minmax(0, 1fr)";
    }
    optionsContainer.innerHTML = activeIconFacet === "type"
        ? ["todos", ...valuesFor("type")].map((value) => `
            <button class="block w-full border-l-2 px-3 py-2 text-left text-xs transition ${value === iconFilters.type ? "border-primary-500 bg-primary-25 font-medium text-primary-800" : "border-transparent text-black/55 hover:border-black hover:bg-black/5 hover:text-black"}" type="button" data-icon-option="${value}" aria-pressed="${value === iconFilters.type}">${value === "todos" ? i18n.t("app.option-all") : value}</button>
        `).join("")
        : "";

    const normalized = query.trim().toLowerCase();
    const results = figmaIcons
        .filter(({ type, icon, file, filled, monochrome }) => {
            const values = { icon, type, filled: String(filled), monochrome: String(monochrome) };
            const matchesFilters = Object.entries(iconFilters).every(([facet, value]) => value === "todos" || values[facet] === value);
            return matchesFilters && `${type} ${icon} ${file}`.toLowerCase().includes(normalized);
        })
        .sort((left, right) => Number(left.monochrome) - Number(right.monochrome) || left.icon.localeCompare(right.icon) || left.file.localeCompare(right.file));

    if (resultLabel) resultLabel.textContent = i18n.tn("app.icons-found", results.length);
    if (!results.length) {
        grid.innerHTML = `<p class="col-span-full bg-white p-6 text-sm text-black/55">${i18n.t("app.no-icons")}</p>`;
        return;
    }

    grid.innerHTML = results.map(({ file, type, icon, filled, monochrome }) => {
        const source = `/assets/icons/${encodeURIComponent(file)}`;
        return `
            <article class="bg-white px-3 pb-6 mb-4">
                <span class="flex items-center justify-center ${monochrome ? "bg-black" : "bg-secondary-50"} p-10 rounded-2xl" style="aspect-ratio:1 / 1">
                    <img class="block h-full w-full cursor-pointer object-contain" src="${source}" alt="${icon}" title="${i18n.t("app.copy-name", { icon })}" data-icon-name="${icon}" role="button" tabindex="0" loading="lazy" />
                </span>
                <p class="mt-4 break-words font-mono text-sm text-black/60">${icon}</p>
                <p class="mt-2 text-xs tracking-wide text-black/50">${type} · ${filled ? "filled" : "outline"} · ${monochrome ? "monochrome" : "color"}</p>
            </article>
        `;
    }).join("");
}

function initializeFigmaIconCatalog() {
    const facetsContainer = document.querySelector("#icon-facets");
    const optionsContainer = document.querySelector("#icon-facet-options");
    const grid = document.querySelector("#figma-icon-grid");
    const searchInput = document.querySelector("#icon-search");
    if (!facetsContainer || !optionsContainer || !grid || !searchInput) return;

    searchInput.addEventListener("input", () => renderFigmaIconCatalog(searchInput.value));
    facetsContainer.addEventListener("click", (event) => {
        const facet = event.target.closest("[data-icon-facet]");
        if (!facet) return;
        activeIconFacet = facet.dataset.iconFacet;
        iconFilters.type = "todos";
        iconFilters.filled = "todos";
        iconFilters.monochrome = "todos";
        if (activeIconFacet === "type") {
            iconFilters.monochrome = "todos";
        } else if (activeIconFacet === "filled") {
            iconFilters.filled = facet.dataset.iconValue;
        } else if (activeIconFacet === "monochrome") {
            iconFilters.monochrome = facet.dataset.iconValue;
        }
        renderFigmaIconCatalog(searchInput.value);
    });
    optionsContainer.addEventListener("click", (event) => {
        const option = event.target.closest("[data-icon-option]");
        if (!option) return;
        iconFilters[activeIconFacet] = option.dataset.iconOption;
        renderFigmaIconCatalog(searchInput.value);
    });
    grid.addEventListener("click", async (event) => {
        const icon = event.target.closest("[data-icon-name]");
        if (!icon) return;
        try {
            await navigator.clipboard.writeText(icon.dataset.iconName);
            showToast(i18n.t("app.copied", { value: icon.dataset.iconName }));
        } catch {
            showToast(i18n.t("app.copy-name-failed"));
        }
    });
}

async function loadFigmaIcons() {
    try {
        const response = await fetch("/icons.json");
        if (!response.ok) throw new Error(i18n.t("app.icons-unavailable"));
        figmaIcons = await response.json();
        renderFigmaIconCatalog();
        initializeFigmaIconCatalog();
    } catch (error) {
        const grid = document.querySelector("#figma-icon-grid");
        if (grid) grid.innerHTML = `<p class="col-span-full bg-white p-6 text-sm text-red-700">${error.message}</p>`;
    }
}

function updateActiveNavigation() {
    const page = document.body.dataset.page ?? "colors";
    document.querySelectorAll("[data-nav]").forEach((link) => {
        const isActive = link.dataset.nav === page;
        link.classList.toggle("border-primary-500", isActive);
        link.classList.toggle("bg-primary-25", isActive);
        link.classList.toggle("font-medium", isActive);
        link.classList.toggle("text-primary-800", isActive);
        link.classList.toggle("border-transparent", !isActive);
        link.classList.toggle("text-black/55", !isActive);
        if (isActive) {
            link.setAttribute("aria-current", "page");
        } else {
            link.removeAttribute("aria-current");
        }
    });
}

async function loadTokens() {
    try {
        const response = await fetch("/colors.json");
        if (!response.ok) throw new Error(i18n.t("app.colors-unavailable"));
        const collection = await response.json();
        colorCollections = Object.fromEntries(collection.flatMap((item) =>
            Object.entries(item).filter(([, data]) => data?.modes).map(([name, data]) => [name, data.modes]),
        ));
        if (!Object.keys(colorCollections).length) throw new Error(i18n.t("app.colors-unavailable"));
        if (!Object.prototype.hasOwnProperty.call(colorCollections, activeColorCategory)) {
            activeColorCategory = Object.keys(colorCollections)[0];
        }
        activateColorCategory(activeColorCategory);
    } catch (error) {
        const resultLabel = document.querySelector("#result-label");
        const groupsContainer = document.querySelector("#color-groups");
        if (resultLabel) resultLabel.textContent = i18n.t("app.tokens-failed");
        if (groupsContainer) groupsContainer.innerHTML = `<p class="text-sm text-red-700">${error.message}</p>`;
    }
}

async function loadUpdates() {
    const updatesList = document.querySelector("#updates-list");
    if (!updatesList) return;

    try {
        const response = await fetch("/updates.json");
        if (!response.ok) throw new Error(i18n.t("app.updates-unavailable"));
        updatesData = await response.json();
        renderUpdates();
    } catch (error) {
        updatesList.innerHTML = `<p class="border-t border-black/15 py-8 text-sm text-red-700">${error.message}</p>`;
    }
}

function renderUpdates() {
    const updatesList = document.querySelector("#updates-list");
    if (!updatesList || !updatesData.length) return;

    const locale = i18n.language;
    {
        const sortedUpdates = [...updatesData].sort((left, right) => {
            const leftDate = left.createdAt ?? `${left.date}T${left.time ?? "00:00"}`;
            const rightDate = right.createdAt ?? `${right.date}T${right.time ?? "00:00"}`;
            return new Date(rightDate) - new Date(leftDate);
        });
        updatesList.innerHTML = sortedUpdates.map(({ id, date, createdAt, time, href }) => {
            const prefix = `updates.items.${id}.`;
            const type = i18n.t(`${prefix}type`);
            const title = i18n.t(`${prefix}title`);
            const description = i18n.t(`${prefix}description`);
            const tags = i18n.t(`${prefix}tags`);
            const timestamp = createdAt ?? `${date}T${time ?? "00:00"}`;
            const createdDate = new Date(timestamp);
            const dateLabel = new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(createdDate);
            const timeLabel = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(createdDate);
            return `
            <article class="grid gap-5 border-t border-black/15 py-8 lg:grid-cols-[10rem_minmax(0,1fr)_10rem] lg:gap-8">
                <time class="font-mono text-xs text-black/50" datetime="${timestamp}">${dateLabel} · ${timeLabel}</time>
                <div>
                    <p class="text-xs font-medium uppercase tracking-widest text-primary-500">${type}</p>
                    <h2 class="mt-3 text-2xl font-medium tracking-tight text-black">${title}</h2>
                    <p class="mt-3 max-w-160 text-base leading-7 text-black/60">${description}</p>
                    <div class="mt-5 flex flex-wrap gap-2">
                        ${tags.map((tag) => `<span class="border border-black/15 px-2 py-1 font-mono text-[11px] text-black/55">${tag}</span>`).join("")}
                    </div>
                </div>
                ${href ? `<a class="self-start text-right text-sm font-medium text-black underline decoration-black/25 underline-offset-4 hover:decoration-black" href="${href}">${i18n.t("app.view-resource")}</a>` : ""}
            </article>
            `;
        }).join("");
    }
}

function showPageLoader() {
    const loader = document.createElement("div");
    loader.id = "page-loader";
    loader.setAttribute("role", "status");
    loader.setAttribute("aria-label", "Carregando página");
    loader.style.cssText = "position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;background:#fff;transition:opacity .25s";
    loader.innerHTML = `
        <style>@keyframes page-loader-spin{to{transform:rotate(360deg)}}</style>
        <div style="width:2.5rem;height:2.5rem;border:3px solid rgba(0,0,0,.15);border-top-color:#000;border-radius:50%;animation:page-loader-spin .8s linear infinite"></div>
    `;
    document.body.appendChild(loader);
    return () => {
        loader.style.opacity = "0";
        setTimeout(() => loader.remove(), 250);
    };
}

async function fetchWithRetry(url, attempts = 3) {
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt++) {
        try {
            const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
            if (response.ok) return response;
            lastError = new Error(`Falha ao carregar ${url}`);
        } catch (error) {
            lastError = error;
        }
        await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
    throw lastError;
}

async function loadComponents() {
    const slots = [...document.querySelectorAll("[data-component]")];
    await Promise.all(slots.map(async (slot) => {
        const response = await fetchWithRetry(`/components/${slot.dataset.component}.html`);
        slot.innerHTML = await response.text();
    }));
}

function showSplash() {
    const isHome = document.body.dataset.page === "splash";
    if (!isHome) return;

    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const splash = document.createElement("div");
    splash.id = "splash";
    splash.setAttribute("aria-hidden", "true");
    splash.style.cssText = "position:fixed;inset:0;z-index:200;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.5rem;background:#fff";
    const letters = [..."LUMEN"].map((letter) => `<span style="opacity:0;display:inline-block">${letter}</span>`).join("");
    splash.innerHTML = `
        <img src="/favicon.png" alt="" width="128" height="128" style="width:6rem;height:6rem;opacity:0" />
        <div style="font-family:'Instrument Sans',sans-serif;font-size:3rem;font-weight:500;letter-spacing:.4em;margin-right:-.4em;color:#1678dc;min-height:3rem">${letters}</div>
    `;
    document.body.appendChild(splash);

    const fade = (element, from, to, duration, delay = 0) => {
        const time = reduced ? 1 : duration;
        element.animate([{ opacity: from }, { opacity: to }], { duration: time, delay: reduced ? 0 : delay, easing: "ease-out", fill: "forwards" });
        return new Promise((resolve) => setTimeout(resolve, time + (reduced ? 0 : delay)));
    };

    const run = async () => {
        await fade(splash.querySelector("img"), 0, 1, 300);
        await Promise.all([...splash.querySelectorAll("span")].map((span, index) => fade(span, 0, 1, 450, index * 180)));
        await new Promise((resolve) => setTimeout(resolve, reduced ? 100 : 300));
        await fade(splash, 1, 0, 300);
    };
    run().catch(() => {}).finally(() => window.location.replace("/updates.html"));
    setTimeout(() => window.location.replace("/updates.html"), 5000);
}

if (document.body.dataset.page === "splash") {
    showSplash();
} else {
    startPage();
}

function startPage() {
const hidePageLoader = showPageLoader();
setTimeout(hidePageLoader, 10000);

document.addEventListener("lumen:languagechange", () => {
    updateColorTabs();
    updateColorModes();
    if (document.querySelector("#color-tabs")) render(document.querySelector("#color-search")?.value ?? "");
    if (figmaIcons.length) renderFigmaIconCatalog(document.querySelector("#icon-search")?.value ?? "");
    renderButtonCatalog();
    renderUpdates();
});

i18n.ready
    .catch((error) => console.error(error))
    .then(loadComponents)
    .catch((error) => console.error(error))
    .then(async () => {
        i18n.apply();
        updateActiveNavigation();
        initializeColorCatalog();
        initializeTypographySpecimens();
        document.querySelector("#button-search")?.addEventListener("input", renderButtonCatalog);
        renderButtonCatalog();
        await Promise.allSettled([loadFigmaIcons(), loadTokens(), loadUpdates()]);
    })
    .finally(hidePageLoader);
}