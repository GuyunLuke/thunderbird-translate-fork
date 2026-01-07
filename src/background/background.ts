import DOMPurify from "dompurify";

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
    messenger.tabs.sendMessage(tab.id, {
        action: "showLoading",
        bannerTemplate: sanitizedBannerHTML,
    });
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
    const { content, html } = extractTextFromMessage(fullMessage);

    if (content === undefined) {
        console.warn("Failed to get message content");
        messenger.tabs.sendMessage(tabID, {
            action: "showBanner",
            content: "Failed to get email content.",
            status: "error",
            html: false,
        });
        return;
    }

    try {
        let translatedContent = await callGemini(content);
        if (html) {
            translatedContent = DOMPurify.sanitize(translatedContent);
        }

        // Send a message to the content script to display the banner
        messenger.tabs.sendMessage(tabID, {
            action: "showBanner",
            content: translatedContent,
            status: "success",
            html: html,
        });
    } catch (error) {
        console.warn("Translation failed:", error);
        const errorMessage =
            error instanceof Error
                ? error.message
                : "An unexpected error occured during translation";

        // send an error message to the content script
        messenger.tabs.sendMessage(tabID, {
            action: "showBanner",
            content: errorMessage,
            status: "error",
            html: false,
        });
    }
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

const geminiPrompt = `
You are a professional translator. Translate the following email to ${browser.i18n.getUILanguage()}.

CRITICAL RULES:
- If the content contains HTML tags, preserve ALL HTML structure exactly
- Only translate the actual text content, not markup, URLs, or email addresses
- Do NOT add explanations, commentary, or markdown formatting
- Return ONLY the translated content

Content to translate:
`;

async function callGemini(text: string): Promise<string> {
    const storage = await browser.storage.local.get("apiKey");

    if (!storage.apiKey) {
        throw new Error(
            "API key is not set. Please configure it in the add-on's settings.",
        );
    }

    const fullPrompt = geminiPrompt + text;
    console.debug(fullPrompt);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${storage.apiKey}`;

    const requestBody = { contents: [{ parts: [{ text: fullPrompt }] }] };

    const response = await fetch(url, {
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
        throw new Error("Translation failed due to an API error.");
    }

    return data.candidates[0].content.parts[0].text;
}
