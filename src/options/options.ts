if (!browser) {
  console.warn('missing "browser"');
} else if (!browser.storage) {
  console.warn('missing "browser.storage"');
} else if (!browser.storage.local) {
  console.warn('missing "browser.storage.local"');
}

const DEFAULT_MODEL_GEMINI = "gemini-2.0-flash-exp";
const DEFAULT_MODEL_DEEPSEEK = "deepseek-v4-flash";
const DEFAULT_MODEL_OPENAI = "gpt-4o-mini";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";

// per-provider API key storage slots
const API_KEY_STORAGE_KEY: Record<string, string> = {
  gemini: "apiKeyGemini",
  deepseek: "apiKeyDeepSeek",
  openai: "apiKeyOpenAI",
};

const apiKeyInput = document.getElementById("apiKeyInput") as HTMLInputElement;
const apiModeSelect = document.getElementById("apiModeSelect") as HTMLSelectElement;
const modelInput = document.getElementById("modelInput") as HTMLInputElement;
const modelList = document.getElementById("modelList") as HTMLDataListElement;
const baseUrlRow = document.getElementById("baseUrlRow") as HTMLDivElement;
const baseUrlInput = document.getElementById("baseUrlInput") as HTMLInputElement;
const statusPar = document.getElementById("status") as HTMLParagraphElement;
const testButton = document.getElementById("testButton") as HTMLButtonElement;

function currentMode(): string {
  return apiModeSelect.value;
}

function showStatus(text: string, color: string): void {
  statusPar.textContent = text;
  statusPar.style.color = color;
  setTimeout(() => {
    statusPar.textContent = "";
  }, 5000);
}

async function loadKeyForMode(mode: string): Promise<void> {
  const storage = await messenger.storage.local.get(API_KEY_STORAGE_KEY[mode]);
  apiKeyInput.value = storage[API_KEY_STORAGE_KEY[mode]] || "";
}

async function updateModeUI(): Promise<void> {
  const mode = currentMode();
  const isDeepSeek = mode === "deepseek";
  const isOpenAI = mode === "openai";

  // Base URL is only editable in the OpenAI-compatible mode; DeepSeek always
  // uses the official endpoint, Gemini uses the official endpoint too.
  baseUrlRow.style.display = isOpenAI ? "" : "none";
  if (!isOpenAI) {
    baseUrlInput.value = "";
  }

  if (isOpenAI) {
    modelInput.placeholder = messenger.i18n.getMessage(
      "modelPlaceholderOpenAI",
    );
  } else if (isDeepSeek) {
    modelInput.placeholder = messenger.i18n.getMessage(
      "modelPlaceholderDeepSeek",
    );
  } else {
    modelInput.placeholder = messenger.i18n.getMessage("modelPlaceholderGemini");
  }

  await loadKeyForMode(mode);
}

apiModeSelect.addEventListener("change", () => {
  updateModeUI().catch((error) => console.warn("updateModeUI failed:", error));
});

// Fetch the model list from the provider and fill the datalist. Returns the
// number of models found; callers fall back to manual input when 0.
async function fetchModelList(mode: string, apiKey: string): Promise<string[]> {
  try {
    if (mode === "gemini") {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      );
      if (!resp.ok) {
        return [];
      }
      const data = await resp.json();
      return (data.models || [])
        .map((m: { name?: string }) => (m.name || "").replace(/^models\//, ""))
        .filter(Boolean);
    }

    const baseUrl =
      mode === "deepseek"
        ? DEFAULT_DEEPSEEK_BASE_URL
        : (baseUrlInput.value.trim() || DEFAULT_OPENAI_BASE_URL).replace(
            /\/+$/,
            "",
          );
    const resp = await fetch(`${baseUrl}/models`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });
    if (!resp.ok) {
      return [];
    }
    const data = await resp.json();
    return (data.data || [])
      .map((m: { id?: string }) => m.id)
      .filter(Boolean);
  } catch (error) {
    console.warn("Failed to fetch model list:", error);
    return [];
  }
}

function fillModelList(models: string[]): void {
  modelList.innerHTML = "";
  for (const name of models) {
    const option = document.createElement("option");
    option.value = name;
    modelList.appendChild(option);
  }
}

testButton.onclick = async () => {
  const mode = currentMode();
  const apiKey = apiKeyInput.value.trim();

  if (!apiKey) {
    showStatus(messenger.i18n.getMessage("enterApiKey"), "red");
    return;
  }

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
    const baseUrl = isDeepSeek
      ? DEFAULT_DEEPSEEK_BASE_URL
      : (baseUrlInput.value.trim() || DEFAULT_OPENAI_BASE_URL).replace(
          /\/+$/,
          "",
        );
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

  try {
    let response: Response | undefined;
    for (const url of urls) {
      response = await fetch(url, { method: "GET", headers });
      if (response.ok) {
        break;
      }
    }

    if (response?.ok) {
      // Save all settings if the test succeeds
      await messenger.storage.local.set({
        [API_KEY_STORAGE_KEY[mode]]: apiKey,
        apiMode: mode,
        model: modelInput.value.trim(),
        // only the OpenAI-compatible mode has a custom base URL
        baseUrl: mode === "openai" ? baseUrlInput.value.trim() : "",
      });
      // probe the model list so the user can pick instead of typing
      const models = await fetchModelList(mode, apiKey);
      fillModelList(models);
      showStatus(messenger.i18n.getMessage("settingsSaved"), "green");
    } else {
      showStatus(messenger.i18n.getMessage("invalidKeyOrEndpoint"), "red");
    }
  } catch (error) {
    console.warn("Error testing API key:", error);
    showStatus(messenger.i18n.getMessage("testError"), "red");
  }
};

// main function
(async () => {
  const storage = await messenger.storage.local.get([
    "apiMode",
    "model",
    "baseUrl",
  ]);
  if (storage.apiMode === "openai" || storage.apiMode === "deepseek") {
    apiModeSelect.value = storage.apiMode;
  }
  if (storage.model) {
    modelInput.value = storage.model;
  }
  if (storage.baseUrl && storage.apiMode === "openai") {
    baseUrlInput.value = storage.baseUrl;
  }
  await updateModeUI();
})();
