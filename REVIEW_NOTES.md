# Add-on Review Notes (for ATN submission)

This fork adds configurable translation providers to the original
[sully-vian/thunderbird-translate](https://github.com/sully-vian/thunderbird-translate).

## Why the `<all_urls>` host permission is required

The add-on lets users configure **any** translation API endpoint:

- Google Gemini (official, fixed endpoint)
- DeepSeek (official, fixed endpoint)
- **OpenAI-compatible endpoints** (user-defined Base URL): OpenAI,
  DeepSeek-compatible relays, Ollama/LM Studio on localhost, corporate
  gateways, proxy relays, etc.

Because the endpoint domain is chosen by the user at runtime and cannot be
known in advance, a broad host permission is required. No browsing data is
read from any site; the permission is used exclusively to send the selected
email body to the endpoint the user configured. Restricting the permission
to a fixed domain list would break the core OpenAI-compatible feature.

## Security model

- The translation banner is built entirely with `createElement` and
  `textContent`; **no HTML from the API response or the email is ever
  parsed as HTML** (`src/banner/banner.ts`).
- Email bodies are converted to visible plain text (rendered in a hidden
  iframe, computed styles consulted) before being sent (`src/background/background.ts`).
- API keys are stored in `browser.storage.local` per provider and sent only
  to the configured provider.
- No third-party libraries are bundled at runtime (no sanitizer needed, no
  CDN loading). `package.json` dependencies are build-time only.

## Data collection

- **Technical**: API keys and configuration (model, endpoint, language)
  stored locally.
- **Content**: the selected email body (as visible text) is sent to the
  user-configured translation provider. Nothing else (credentials, headers,
  recipients, attachments) is ever read or transmitted.
- A privacy notice is shown in the options page.

## Notes

- `messagesRead` / `messagesModify` and `messageDisplay.*` are
  Thunderbird-specific permissions/APIs; `web-ext lint` (which uses the
  Firefox rule set) flags them as unknown, but they are required for the
  add-on to work in Thunderbird and are accepted by ATN.
- Manifest V2 is used; Thunderbird continues to accept MV2 add-ons. A
  migration to Manifest V3 is planned but not part of this submission.
