import DOMPurify from "dompurify";
import { getLanguage, getMessage } from "../i18n";

if (messenger === undefined) {
    console.warn("Messenger API not available!");
}

// load and sanitize bannerHTML
let sanitizedBannerHTML: string | null;
(async () => {
    const url = browser.runtime.getURL("src/banner/banner.html");
    const response = await fetch(url);
    if (!response.ok) {
        console.warn("Failed to fetch banner.html:", response.status);
        return;
    }
    const raw = await response.text();
    sanitizedBannerHTML = DOMPurify.sanitize(raw);
})();

messenger.messageDisplayAction.onClicked.addListener(async (tab) => {
    if (tab.id === undefined) {
        console.warn("No tab ID.");
        return;
    }
    messenger.tabs
        .sendMessage(tab.id, {
            action: "showLoading",
            bannerTemplate: sanitizedBannerHTML,
        })
        .catch(() => {});
    const message = await messenger.messageDisplay.getDisplayedMessage(tab.id);
    if (message == null) {
        console.warn("Failed to get displayed message.");
        return;
    }
    await translateEmail(message, tab.id);
});

async function translateEmail(
    message: messenger.messages.MessageHeader,
    tabID: number,
): Promise<void> {
    const fullMessage = await messenger.messages.getFull(message.id);
    let { content, html } = extractTextFromMessage(fullMessage);

    // Translate the plain-text body. Full-HTML translation of heavy
    // newsletter templates is slow and token-hungry; extracting the text
    // keeps the request small and the response fast.
    if (html && content) {
        content = htmlToPlainText(content);
        html = false;
    }

    if (content === undefined) {
        console.warn("Failed to get message content");
        messenger.tabs
            .sendMessage(tabID, {
                action: "showBanner",
                content: await getMessage("failedToGetContent"),
                status: "error",
                html: false,
            })
            .catch(() => {});
        return;
    }

    try {
        let translatedContent = await callTranslationAPI(content);
        if (html) {
            translatedContent = DOMPurify.sanitize(translatedContent);
        }

        // Send a message to the content script to display the banner
        messenger.tabs
            .sendMessage(tabID, {
                action: "showBanner",
                content: translatedContent,
                status: "success",
                html: html,
            })
            .catch(() => {});
    } catch (error) {
        console.warn("Translation failed:", error);
        const errorMessage =
            error instanceof Error
                ? error.message
                : await getMessage("unexpectedError");

        // send an error message to the content script
        messenger.tabs
            .sendMessage(tabID, {
                action: "showBanner",
                content: errorMessage,
                status: "error",
                html: false,
            })
            .catch(() => {});
    }
}

// Render the mail HTML in a hidden desktop-width iframe and extract the
// actually visible text. Anything hidden by CSS — display:none previews,
// media-query variants, class rules — is skipped naturally by the computed
// styles, no per-template special-casing. Duplicate paragraphs are dropped
// as a final safety net.
function htmlToPlainText(html: string): string {
    // strip images so the render does not trigger network requests
    const clean = html.replace(/<img\b[^>]*>/gi, " ");

    const iframe = document.createElement("iframe");
    iframe.style.width = "800px";
    iframe.style.height = "1px";
    iframe.style.visibility = "hidden";
    iframe.style.position = "absolute";
    iframe.style.left = "-9999px";
    document.body.appendChild(iframe);

    let text = "";
    try {
        const doc = iframe.contentDocument;
        if (!doc || !doc.body) {
            return "";
        }
        doc.open();
        doc.write(clean);
        doc.close();
        text = extractVisibleText(doc.body);
    } finally {
        iframe.remove();
    }

    // paragraph-level deduplication, keeping the first occurrence
    const seen = new Set<string>();
    const lines: string[] = [];
    for (const raw of text.split("\n")) {
        const line = raw.trim();
        if (!line) {
            lines.push("");
        } else if (!seen.has(line)) {
            seen.add(line);
            lines.push(line);
        } else {
            lines.push("");
        }
    }
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// Collect the visible text of a rendered document, honoring the computed
// display/visibility of every element.
function extractVisibleText(root: Element): string {
    const parts: string[] = [];

    function walk(node: Node): void {
        if (node.nodeType === Node.TEXT_NODE) {
            const t = (node.textContent || "").trim();
            if (t) {
                parts.push(t);
            }
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) {
            return;
        }
        const el = node as HTMLElement;
        const cs = window.getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") {
            return; // hidden by CSS: skip the whole subtree
        }
        for (const child of Array.from(el.childNodes)) {
            walk(child);
        }
        if (/^(P|DIV|TR|LI|H[1-6]|TABLE|BR)$/.test(el.tagName)) {
            parts.push("\n");
        }
    }

    for (const child of Array.from(root.childNodes)) {
        walk(child);
    }

    return parts
        .join(" ")
        .replace(/[ \t]{2,}/g, " ")
        .replace(/ ?\n ?/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function extractTextFromMessage(fullMessage: messenger.messages.MessagePart): {
    content: string | undefined;
    html: boolean;
} {
    let htmlContent: string = "";
    let plainContent: string = "";

    function searchParts(parts: messenger.messages.MessagePart[]) {
        for (const part of parts) {
            if (part.contentType === "text/html" && part.body) {
                htmlContent = part.body;
            }
            if (part.contentType === "text/plain" && part.body) {
                plainContent = part.body;
            }
            // multipart case, we work recursively
            if (part.contentType?.startsWith("multipart/") && part.parts) {
                searchParts(part.parts);
            }
        }
    }

    if (fullMessage.parts) {
        searchParts(fullMessage.parts);
    }

    // prefer html
    if (htmlContent) {
        return {
            content: htmlContent,
            html: true,
        };
    } else if (plainContent) {
        return {
            content: plainContent,
            html: false,
        };
    } else {
        return {
            content: undefined,
            html: false,
        };
    }
}

// add listener for opening option page
browser.runtime.onMessage.addListener((message) => {
    if (message.action === "openOptionsPage") {
        // Open the options page
        browser.tabs.create({
            url: browser.runtime.getURL("/src/options/options.html"),
        });
    }
    return false; // done processing
});

const DEFAULT_MODEL_GEMINI = "gemini-2.0-flash-exp";
const DEFAULT_MODEL_DEEPSEEK = "deepseek-v4-flash";
const DEFAULT_MODEL_OPENAI = "gpt-4o-mini";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const FETCH_TIMEOUT_MS = 30000;

type ApiMode = "gemini" | "deepseek" | "openai";

const API_KEY_STORAGE_KEY: Record<ApiMode, string> = {
    gemini: "apiKeyGemini",
    deepseek: "apiKeyDeepSeek",
    openai: "apiKeyOpenAI",
};

// model names are stored per provider as well, so switching providers never
// leaks a model name from another provider into the request
const MODEL_STORAGE_KEY: Record<ApiMode, string> = {
    gemini: "modelGemini",
    deepseek: "modelDeepSeek",
    openai: "modelOpenAI",
};

async function translationSystemPrompt(): Promise<string> {
    const storage = await browser.storage.local.get("targetLang");
    // "auto" (default) follows the add-on's UI language, like the original
    // add-on did with browser.i18n.getUILanguage()
    const target =
        !storage.targetLang || storage.targetLang === "auto"
            ? await getLanguage()
            : storage.targetLang;
    return `
You are a professional translator. Translate the following email to ${target}.

CRITICAL RULES:
- If the content contains HTML tags, preserve ALL HTML structure exactly
- Only translate the actual text content, not markup, URLs, or email addresses
- Do NOT add explanations, commentary, or markdown formatting
- Return ONLY the translated content
`;
}

interface TranslationConfig {
    apiKey: string;
    apiMode: ApiMode;
    model?: string;
    baseUrl?: string;
}

async function getTranslationConfig(): Promise<TranslationConfig> {
    const storage = await browser.storage.local.get([
        "apiMode",
        "baseUrl",
        "apiKeyGemini",
        "apiKeyDeepSeek",
        "apiKeyOpenAI",
        "apiKey",
        "modelGemini",
        "modelDeepSeek",
        "modelOpenAI",
        "model",
    ]);

    let apiMode: ApiMode;
    if (storage.apiMode === "deepseek") {
        apiMode = "deepseek";
    } else if (storage.apiMode === "openai") {
        apiMode = "openai";
    } else {
        apiMode = "gemini";
    }

    let apiKey: string = storage[API_KEY_STORAGE_KEY[apiMode]] || "";
    // migrate the legacy single-key config to the Gemini slot
    if (!apiKey && apiMode === "gemini" && storage.apiKey) {
        apiKey = storage.apiKey;
    }

    if (!apiKey) {
        throw new Error(await getMessage("apiKeyMissing"));
    }

    let model: string | undefined = storage[MODEL_STORAGE_KEY[apiMode]] || undefined;
    // migrate the legacy single-model config to the Gemini slot
    if (!model && apiMode === "gemini" && storage.model) {
        model = storage.model;
    }

    return {
        apiKey,
        apiMode,
        model,
        baseUrl: storage.baseUrl,
    };
}

async function callTranslationAPI(text: string): Promise<string> {
    const config = await getTranslationConfig();

    if (config.apiMode === "gemini") {
        return callGemini(text, config);
    }
    return callOpenAICompatible(text, config);
}

async function fetchWithTimeout(
    url: string,
    init: RequestInit = {},
    timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
            throw new Error(await getMessage("requestTimedOut"));
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

async function callGemini(
    text: string,
    config: TranslationConfig,
): Promise<string> {
    const model = config.model || DEFAULT_MODEL_GEMINI;
    const fullPrompt =
        (await translationSystemPrompt()) + "\n\nContent to translate:\n" + text;
    console.debug(fullPrompt);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`;

    const requestBody = { contents: [{ parts: [{ text: fullPrompt }] }] };

    const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Translation failed: ${response.status} - ${errorData}`);
    }

    const data = await response.json();

    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
        throw new Error(await getMessage("translationApiError"));
    }

    return data.candidates[0].content.parts[0].text;
}

async function callOpenAICompatible(
    text: string,
    config: TranslationConfig,
): Promise<string> {
    // DeepSeek mode always uses the official endpoint; custom endpoints go
    // through the OpenAI-compatible mode. Also match the domain so a custom
    // setup pointing at DeepSeek gets the thinking parameter too.
    const isDeepSeek =
        config.apiMode === "deepseek" ||
        (config.baseUrl || "").includes("api.deepseek.com");
    const baseUrl = isDeepSeek
        ? DEFAULT_DEEPSEEK_BASE_URL
        : (config.baseUrl || DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, "");
    const defaultModel = isDeepSeek ? DEFAULT_MODEL_DEEPSEEK : DEFAULT_MODEL_OPENAI;
    const model = config.model || defaultModel;
    const url = `${baseUrl}/chat/completions`;

    const requestBody = {
        model: model,
        messages: [
            { role: "system", content: await translationSystemPrompt() },
            { role: "user", content: "Content to translate:\n" + text },
        ],
        // DeepSeek v4 models default to thinking mode, which makes them slow
        // on long inputs. Translation does not need reasoning, so disable it.
        ...(isDeepSeek ? { thinking: { type: "disabled" } } : {}),
    };

    const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Translation failed: ${response.status} - ${errorData}`);
    }

    const data = await response.json();

    // Some reasoning models return content as a list of parts
    const rawContent = data.choices?.[0]?.message?.content;
    let content = rawContent;
    if (Array.isArray(rawContent)) {
        content = rawContent
            .map((part: { text?: string }) => part.text ?? "")
            .join("");
    }

    if (!content) {
        throw new Error(await getMessage("translationApiError"));
    }

    return content;
}
