import { getMessage } from "../i18n";

let bannerTemplate: string | null;

// Listen for messages from the background script
browser.runtime.onMessage.addListener(async (message) => {
  if (message.action === "showLoading") {
    bannerTemplate = message.bannerTemplate;
    showBanner(await getMessage("loadingMessage"), "success", false);
  }
  if (message.action === "showBanner") {
    const { content, status, html } = message;
    showBanner(content, status, html);
  }
  return false; // done processing
});

async function showBanner(content: string, status: string, html: boolean) {
  const existingBanner = document.querySelector(".translation-banner");
  if (existingBanner) {
    // remove old banner
    existingBanner.remove();
  }

  const container = document.createElement("div");
  // bannerTemplate was previously sanitized in the background script
  container.innerHTML = bannerTemplate || "";
  const banner = container.firstChild as HTMLDivElement;
  banner.classList.add(status);

  const bannerText = banner.querySelector("#banner-text") as HTMLDivElement;
  if (html) {
    bannerText.innerHTML = content;
  } else {
    bannerText.textContent = content;
  }

  const settingsLink = banner.querySelector(
    "#settings-link",
  ) as HTMLLinkElement;
  settingsLink.textContent = await getMessage("openSettings");
  settingsLink.onclick = (event) => {
    event.preventDefault();
    browser.runtime.sendMessage({ action: "openOptionsPage" });
  };

  document.body.insertBefore(banner, document.body.firstChild);
}
