if (!browser) {
  console.warn('missing "browser"');
} else if (!browser.storage) {
  console.warn('missing "browser.storage"');
} else if (!browser.storage.local) {
  console.warn('missing "browser.storage.local"');
}

const DEFAULT_MODEL_GEMINI = "gemini-2.0-flash-exp";
const DEFAULT_MODEL_OPENAI = "gpt-4o-mini";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

const apiKeyInput = document.getElementById("apiKeyInput") as HTMLInputElement;
const apiModeSelect = document.getElementById("apiModeSelect") as HTMLSelectElement;
const modelInput = document.getElementById("modelInput") as HTMLInputElement;
const baseUrlRow = document.getElementById("baseUrlRow") as HTMLDivElement;
const baseUrlInput = document.getElementById("baseUrlInput") as HTMLInputElement;
const statusPar = document.getElementById("status") as HTMLParagraphElement;
const testButton = document.getElementById("testButton") as HTMLButtonElement;

function updateModeUI() {
  const isOpenAI = apiModeSelect.value === "openai";

  baseUrlRow.style.display = isOpenAI ? "" : "none";
  if (isOpenAI) {
    modelInput.placeholder = `e.g. ${DEFAULT_MODEL_OPENAI}, deepseek-chat, or your provider's model`;
    if (modelInput.value && modelInput.value === DEFAULT_MODEL_GEMINI) {
      modelInput.value = "";
    }
  } else {
    modelInput.placeholder = `e.g. ${DEFAULT_MODEL_GEMINI}, gemini-2.5-flash`;
    if (modelInput.value && modelInput.value === DEFAULT_MODEL_OPENAI) {
      modelInput.value = "";
    }
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

  const isOpenAI = apiModeSelect.value === "openai";

  let url: string;
  let headers: Record<string, string>;

  if (isOpenAI) {
    const baseUrl = (
      baseUrlInput.value.trim() || DEFAULT_OPENAI_BASE_URL
    ).replace(/\/+$/, "");
    url = `${baseUrl}/models`;
    headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    };
  } else {
    url = "https://generativelanguage.googleapis.com/v1/models";
    headers = {
      "Content-Type": "application/json",
      "X-goog-api-key": apiKey,
    };
  }

  const request = {
    method: "GET",
    headers,
  };

  try {
    const response = await fetch(url, request);

    if (response.ok) {
      // Save all settings if the test succeeds
      await messenger.storage.local.set({
        apiKey,
        apiMode: isOpenAI ? "openai" : "gemini",
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
  if (storage.apiMode === "openai") {
    apiModeSelect.value = "openai";
  }
  if (storage.model) {
    modelInput.value = storage.model;
  }
  if (storage.baseUrl) {
    baseUrlInput.value = storage.baseUrl;
  }
  updateModeUI();
})();
