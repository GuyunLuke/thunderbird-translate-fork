// Manual language switching.
//
// browser.i18n.getMessage() always resolves against the Thunderbird UI
// language and cannot be told to use another locale, so we load the message
// dictionaries from _locales ourselves and store the user's choice in
// browser.storage.local (key: "language", default: "zh_CN").

export type Lang = "zh_CN" | "en" | "fr";

const SUPPORTED_LANGS: Lang[] = ["zh_CN", "en", "fr"];

const messageCache: Partial<Record<Lang, Record<string, string>>> = {};

async function loadMessages(lang: Lang): Promise<Record<string, string>> {
    if (!messageCache[lang]) {
        const url = browser.runtime.getURL(`_locales/${lang}/messages.json`);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to load locale ${lang}`);
        }
        const raw: Record<string, { message: string }> = await response.json();
        const flat: Record<string, string> = {};
        for (const [key, entry] of Object.entries(raw)) {
            flat[key] = entry.message;
        }
        messageCache[lang] = flat;
    }
    return messageCache[lang]!;
}

export async function getLanguage(): Promise<Lang> {
    const storage = await browser.storage.local.get("language");
    const lang = storage.language;
    return SUPPORTED_LANGS.includes(lang) ? lang : "zh_CN";
}

export async function setLanguage(lang: Lang): Promise<void> {
    await browser.storage.local.set({ language: lang });
}

export async function getMessage(key: string): Promise<string> {
    const lang = await getLanguage();
    const messages = await loadMessages(lang);
    if (messages[key] !== undefined) {
        return messages[key];
    }
    const fallback = await loadMessages("zh_CN");
    return fallback[key] ?? key;
}
