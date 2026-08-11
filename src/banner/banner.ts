import { getMessage } from "../i18n";

// Listen for messages from the background script
browser.runtime.onMessage.addListener(async (message) => {
  if (message.action === "showLoading") {
    showBanner(await getMessage("loadingMessage"), "success");
  }
  if (message.action === "showBanner") {
    const { content, status } = message;
    showBanner(content, status);
  }
  return false; // done processing
});

// Build the banner with createElement and insert all content via textContent:
// nothing user-controlled is ever parsed as HTML, so no sanitizer is needed.
async function showBanner(content: string, status: string) {
  const existingBanner = document.querySelector(".translation-banner");
  if (existingBanner) {
    existingBanner.remove();
  }

  const banner = document.createElement("div");
  banner.className = `translation-banner ${status}`;

  const settingsLink = document.createElement("a");
  settingsLink.href = "#";
  settingsLink.id = "settings-link";
  settingsLink.textContent = await getMessage("openSettings");
  settingsLink.onclick = (event) => {
    event.preventDefault();
    browser.runtime.sendMessage({ action: "openOptionsPage" });
  };

  const bannerText = document.createElement("div");
  bannerText.id = "banner-text";
  bannerText.textContent = content;

  banner.appendChild(settingsLink);
  banner.appendChild(bannerText);
  document.body.insertBefore(banner, document.body.firstChild);
}
