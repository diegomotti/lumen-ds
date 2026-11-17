(() => {
    const SUPPORTED = ["pt-BR", "en"];
    const DEFAULT_LANGUAGE = "pt-BR";
    const STORAGE_KEY = "lumen-lang";
    const cache = {};
    let fallbackMessages = {};
    let messages = {};
    let current = DEFAULT_LANGUAGE;

    async function loadLocale(language) {
        if (cache[language]) return cache[language];
        const response = await fetch(`/locales/${language}.json`);
        if (!response.ok) throw new Error(`Locale unavailable: ${language}`);
        cache[language] = await response.json();
        return cache[language];
    }

    function detectLanguage() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (SUPPORTED.includes(saved)) return saved;
        return navigator.language?.toLowerCase().startsWith("en") ? "en" : DEFAULT_LANGUAGE;
    }

    function interpolate(value, vars) {
        return value.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? vars[name] : match));
    }

    function t(key, vars = {}) {
        const value = messages[key] ?? fallbackMessages[key];
        if (value === undefined) return key;
        return typeof value === "string" ? interpolate(value, vars) : value;
    }

    function tn(key, count, vars = {}) {
        return t(`${key}.${count === 1 ? "one" : "other"}`, { count, ...vars });
    }

    function apply(root = document) {
        root.querySelectorAll("[data-i18n]").forEach((element) => {
            const vars = element.dataset.i18nVars ? JSON.parse(element.dataset.i18nVars) : {};
            element.textContent = t(element.dataset.i18n, vars);
        });
        root.querySelectorAll("[data-i18n-attr]").forEach((element) => {
            element.dataset.i18nAttr.split(";").forEach((pair) => {
                const separator = pair.indexOf(":");
                element.setAttribute(pair.slice(0, separator), t(pair.slice(separator + 1)));
            });
        });
        document.documentElement.lang = current;
        document.querySelectorAll("[data-lang-switch]").forEach((button) => {
            button.setAttribute("aria-pressed", String(button.dataset.langSwitch === current));
        });
    }

    async function setLanguage(language) {
        if (!SUPPORTED.includes(language)) return;
        messages = language === DEFAULT_LANGUAGE ? fallbackMessages : await loadLocale(language).catch(() => fallbackMessages);
        current = language;
        localStorage.setItem(STORAGE_KEY, language);
        apply();
        document.dispatchEvent(new CustomEvent("lumen:languagechange", { detail: { language } }));
    }

    const ready = (async () => {
        fallbackMessages = await loadLocale(DEFAULT_LANGUAGE);
        current = detectLanguage();
        messages = current === DEFAULT_LANGUAGE ? fallbackMessages : await loadLocale(current).catch(() => fallbackMessages);
    })();

    document.addEventListener("click", (event) => {
        const button = event.target.closest("[data-lang-switch]");
        if (button) setLanguage(button.dataset.langSwitch);
    });

    window.i18n = { ready, t, tn, apply, setLanguage, get language() { return current; } };
})();
