import { getMessage, getLanguage, setLanguage, Lang } from "../i18n";

if (!browser) {
  console.warn('missing "browser"');
} else if (!browser.storage) {
  console.warn('missing "browser.storage"');
} else if (!browser.storage.local) {
  console.warn('missing "browser.storage.local"');
}

// Localize every element carrying a data-i18n attribute. Re-run this after a
// language switch to re-render the whole page.
async function applyI18n(): Promise<void> {
  document.querySelectorAll("[data-i18n]").forEach(async (el) => {
    const key = el.getAttribute("data-i18n");
    if (key) {
      el.textContent = await getMessage(key);
    }
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(async (el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (key) {
      (el as HTMLInputElement).placeholder = await getMessage(key);
    }
  });
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

// per-provider model name slots, so switching providers never leaks a model
// name from another provider into the request
const MODEL_STORAGE_KEY: Record<string, string> = {
  gemini: "modelGemini",
  deepseek: "modelDeepSeek",
  openai: "modelOpenAI",
};

const langSelect = document.getElementById("langSelect") as HTMLSelectElement;
const apiKeyInput = document.getElementById("apiKeyInput") as HTMLInputElement;
const apiKeyLabel = document.getElementById("apiKeyLabel") as HTMLLabelElement;
const apiModeSelect = document.getElementById("apiModeSelect") as HTMLSelectElement;
const modelSelect = document.getElementById("modelSelect") as HTMLSelectElement;
const baseUrlRow = document.getElementById("baseUrlRow") as HTMLDivElement;
const baseUrlInput = document.getElementById("baseUrlInput") as HTMLInputElement;
const statusPar = document.getElementById("status") as HTMLParagraphElement;
const testButton = document.getElementById("testButton") as HTMLButtonElement;

function currentMode(): string {
  return apiModeSelect.value;
}

function defaultModelFor(mode: string): string {
  if (mode === "deepseek") {
    return DEFAULT_MODEL_DEEPSEEK;
  }
  if (mode === "openai") {
    return DEFAULT_MODEL_OPENAI;
  }
  return DEFAULT_MODEL_GEMINI;
}

async function showStatus(key: string, color: string): Promise<void> {
  statusPar.textContent = await getMessage(key);
  statusPar.style.color = color;
  setTimeout(() => {
    statusPar.textContent = "";
  }, 5000);
}

async function loadKeyForMode(mode: string): Promise<void> {
  const storage = await messenger.storage.local.get(API_KEY_STORAGE_KEY[mode]);
  apiKeyInput.value = storage[API_KEY_STORAGE_KEY[mode]] || "";
}

// Fill the model dropdown. Keeps the current selection when it is still
// available, otherwise selects the first entry.
function fillModelList(models: string[], mode: string): void {
  const previous = modelSelect.value;
  const names = models.length ? models : [defaultModelFor(mode)];

  modelSelect.innerHTML = "";
  for (const name of names) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    modelSelect.appendChild(option);
  }

  if (previous && names.includes(previous)) {
    modelSelect.value = previous;
  } else {
    modelSelect.value = names[0];
  }
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

  // label the key field with the active provider
  const providerNames: Record<string, string> = {
    gemini: await getMessage("providerGemini"),
    deepseek: await getMessage("providerDeepSeek"),
    openai: await getMessage("providerOpenAI"),
  };
  apiKeyLabel.textContent =
    `${providerNames[mode]} ${await getMessage("apiKey")}`;

  // show the default model until the provider list is probed
  if (!modelSelect.options.length) {
    fillModelList([], mode);
  }

  await loadKeyForMode(mode);
}

apiModeSelect.addEventListener("change", async () => {
  await updateModeUI();
  // restore the model saved for this provider before probing
  const mode = currentMode();
  const storage = await messenger.storage.local.get([
    MODEL_STORAGE_KEY[mode],
    "model",
  ]);
  const savedModel =
    storage[MODEL_STORAGE_KEY[mode]] ||
    (mode === "gemini" ? storage.model : "") ||
    "";
  if (savedModel) {
    fillModelList([savedModel], mode);
  }
  // probe the model list with the key already saved for this provider
  await probeModelsForCurrentMode();
});

// probe the model list as soon as the user has typed a key, no need to
// wait for Save & Test
let modelProbeTimer: number | undefined;

function scheduleModelProbe(): void {
  const mode = currentMode();
  const key = apiKeyInput.value.trim();
  if (!key) {
    return;
  }
  if (modelProbeTimer !== undefined) {
    clearTimeout(modelProbeTimer);
  }
  modelProbeTimer = window.setTimeout(async () => {
    const models = await fetchModelList(mode, key);
    if (models.length) {
      fillModelList(models, mode);
    }
  }, 600);
}

apiKeyInput.addEventListener("input", scheduleModelProbe);

langSelect.addEventListener("change", async () => {
  await setLanguage(langSelect.value as Lang);
  await applyI18n();
  await updateModeUI();
});

async function probeModelsForCurrentMode(): Promise<void> {
  const mode = currentMode();
  const storage = await messenger.storage.local.get(API_KEY_STORAGE_KEY[mode]);
  const savedKey: string = storage[API_KEY_STORAGE_KEY[mode]] || "";
  if (!savedKey) {
    return;
  }
  const models = await fetchModelList(mode, savedKey);
  if (models.length) {
    fillModelList(models, mode);
  }
}

// Fetch the model list from the provider. Returns an empty array when the
// endpoint does not implement GET /models; the dropdown then keeps the
// default model.
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

testButton.onclick = async () => {
  const mode = currentMode();
  const apiKey = apiKeyInput.value.trim();

  if (!apiKey) {
    await showStatus("enterApiKey", "red");
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
        [MODEL_STORAGE_KEY[mode]]: modelSelect.value,
        apiMode: mode,
        // only the OpenAI-compatible mode has a custom base URL
        baseUrl: mode === "openai" ? baseUrlInput.value.trim() : "",
      });
      // probe the model list so the user can pick instead of typing
      const models = await fetchModelList(mode, apiKey);
      fillModelList(models, mode);
      await showStatus("settingsSaved", "green");
    } else {
      await showStatus("invalidKeyOrEndpoint", "red");
    }
  } catch (error) {
    console.warn("Error testing API key:", error);
    await showStatus("testError", "red");
  }
};

// main function
(async () => {
  const storage = await messenger.storage.local.get([
    "apiMode",
    "model",
    "modelGemini",
    "modelDeepSeek",
    "modelOpenAI",
    "baseUrl",
    "language",
  ]);
  const language = await getLanguage();
  langSelect.value = language;
  await applyI18n();

  if (storage.apiMode === "openai" || storage.apiMode === "deepseek") {
    apiModeSelect.value = storage.apiMode;
  }
  if (storage.baseUrl && storage.apiMode === "openai") {
    baseUrlInput.value = storage.baseUrl;
  }
  await updateModeUI();
  // restore the model saved for the active provider when it exists
  const activeMode = currentMode();
  const savedModel =
    storage[MODEL_STORAGE_KEY[activeMode]] ||
    (activeMode === "gemini" ? storage.model : "") ||
    "";
  if (savedModel) {
    fillModelList([savedModel], activeMode);
  }
  // probe the model list with the key already saved for this provider
  await probeModelsForCurrentMode();
})();
