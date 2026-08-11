if (!browser) {
  console.warn('missing "browser"');
} else if (!browser.storage) {
  console.warn('missing "browser.storage"');
} else if (!browser.storage.local) {
  console.warn('missing "browser.storage.local"');
}

const DEFAULT_MODEL_GEMINI = "gemini-2.0-flash-exp";
const DEFAULT_MODEL_OPENAI = "gpt-4o-mini";
const DEFAULT_MODEL_DEEPSEEK = "deepseek-v4-flash";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";

const apiKeyInput = document.getElementById("apiKeyInput") as HTMLInputElement;
const apiModeSelect = document.getElementById("apiModeSelect") as HTMLSelectElement;
const modelInput = document.getElementById("modelInput") as HTMLInputElement;
const baseUrlRow = document.getElementById("baseUrlRow") as HTMLDivElement;
const baseUrlInput = document.getElementById("baseUrlInput") as HTMLInputElement;
const statusPar = document.getElementById("status") as HTMLParagraphElement;
const testButton = document.getElementById("testButton") as HTMLButtonElement;

function updateModeUI() {
  const mode = apiModeSelect.value;
  const isOpenAI = mode === "openai";
  const isDeepSeek = mode === "deepseek";

  baseUrlRow.style.display = isOpenAI || isDeepSeek ? "" : "none";

  if (isOpenAI) {
    modelInput.placeholder = `e.g. ${DEFAULT_MODEL_OPENAI}, deepseek-chat, or your provider's model`;
    if (
      modelInput.value &&
      (modelInput.value === DEFAULT_MODEL_GEMINI ||
        modelInput.value === DEFAULT_MODEL_DEEPSEEK)
    ) {
      modelInput.value = "";
    }
  } else if (isDeepSeek) {
    modelInput.placeholder = "e.g. deepseek-v4-flash, deepseek-v4-pro";
    if (
      modelInput.value &&
      (modelInput.value === DEFAULT_MODEL_GEMINI ||
        modelInput.value === DEFAULT_MODEL_OPENAI)
    ) {
      modelInput.value = "";
    }
  } else {
    modelInput.placeholder = `e.g. ${DEFAULT_MODEL_GEMINI}, gemini-2.5-flash`;
    if (
      modelInput.value &&
      (modelInput.value === DEFAULT_MODEL_OPENAI ||
        modelInput.value === DEFAULT_MODEL_DEEPSEEK)
    ) {
      modelInput.value = "";
    }
  }

  // fill in the provider default base URL when the field is empty
  if (baseUrlRow.style.display !== "none" && !baseUrlInput.value) {
    baseUrlInput.value = isDeepSeek
      ? DEFAULT_DEEPSEEK_BASE_URL
      : DEFAULT_OPENAI_BASE_URL;
  } else if (baseUrlRow.style.display === "none" && baseUrlInput.value) {
    baseUrlInput.value = "";
  }
}

apiModeSelect.addEventListener("change", updateModeUI);

testButton.onclick = async () => {
  const apiKey = apiKeyInput.value.trim();

  if (!apiKey) {
    statusPar.textContent = "Please enter a valid API key.";
    statusPar.style.color = "red";
    setTimeout(() => {
      statusPar.textContent = "";
      statusPar.style.color = "green";
    }, 3000);
    return;
  }

  const mode = apiModeSelect.value;
  const isGemini = mode === "gemini";
  const isDeepSeek = mode === "deepseek";

  let urls: string[];
  let headers: Record<string, string>;

  if (isGemini) {
    urls = ["https://generativelanguage.googleapis.com/v1/models"];
    headers = {
      "Content-Type": "application/json",
      "X-goog-api-key": apiKey,
    };
  } else {
    const defaultBaseUrl = isDeepSeek
      ? DEFAULT_DEEPSEEK_BASE_URL
      : DEFAULT_OPENAI_BASE_URL;
    const baseUrl = (
      baseUrlInput.value.trim() || defaultBaseUrl
    ).replace(/\/+$/, "");
    headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    };
    urls = [`${baseUrl}/models`];
    // DeepSeek: fall back to the balance endpoint if /models is not available
    if (isDeepSeek) {
      urls.push(`${baseUrl}/user/balance`);
    }
  }

  const request = {
    method: "GET",
    headers,
  };

  try {
    let response: Response | undefined;
    for (const url of urls) {
      response = await fetch(url, request);
      if (response.ok) {
        break;
      }
    }

    if (response?.ok) {
      // Save all settings if the test succeeds
      await messenger.storage.local.set({
        apiKey,
        apiMode: mode,
        model: modelInput.value.trim(),
        baseUrl: baseUrlInput.value.trim(),
      });
      statusPar.textContent = "Settings saved successfully!";
      statusPar.style.color = "green";

      // Clear the status message after 3 seconds
      setTimeout(() => {
        statusPar.textContent = "";
      }, 3000);
    } else {
      // Notify the user if the API key or endpoint is invalid
      statusPar.textContent = "Invalid API key or endpoint. Please try again.";
      statusPar.style.color = "red";

      // Clear the error message after 3 seconds
      setTimeout(() => {
        statusPar.textContent = "";
        statusPar.style.color = "green";
      }, 3000);
    }
  } catch (error) {
    console.warn("Error testing API key:", error);
    statusPar.textContent = "An error occurred. Please try again.";
    statusPar.style.color = "red";

    // Clear the error message after 3 seconds
    setTimeout(() => {
      statusPar.textContent = "";
      statusPar.style.color = "green";
    }, 3000);
  }
};

// main function
(async () => {
  const storage = await messenger.storage.local.get([
    "apiKey",
    "apiMode",
    "model",
    "baseUrl",
  ]);
  if (storage.apiKey) {
    apiKeyInput.value = storage.apiKey;
    console.warn("API found in storage");
  } else {
    console.warn("no API key in storage");
  }
  if (storage.apiMode === "openai" || storage.apiMode === "deepseek") {
    apiModeSelect.value = storage.apiMode;
  }
  if (storage.model) {
    modelInput.value = storage.model;
  }
  if (storage.baseUrl) {
    baseUrlInput.value = storage.baseUrl;
  }
  updateModeUI();
})();
