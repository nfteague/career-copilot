# Career Copilot — Privacy Policy

**Effective date: July 1, 2026**

Career Copilot is built so that your data stays with you. There is no Career Copilot server, no account, and no analytics. This policy explains exactly what the extension stores, where it goes, and what control you have.

## What the extension stores

All of the following is stored **only on your device**, in your browser's local extension storage (`chrome.storage.local`):

- **Your career profile** — work history, education, projects, skills, certifications, and contact details you provide or that are extracted from documents you upload.
- **Supporting documents** — the text of files you attach (resumes, writing samples, transcripts, etc.).
- **Notes** — answers you give when the assistant asks for more context, and context you choose to save while refining a draft.
- **Quick Copy snippets** — labels and values you create.
- **Your API key(s)** — for the AI provider(s) you configure (Anthropic and/or OpenAI).

None of this is transmitted to us. We could not read it if we wanted to — we operate no servers and receive no data.

## Where your data goes

Your data leaves your device in exactly one situation: **when you trigger an AI action** (extracting a profile from an upload, transcribing a PDF, or generating a draft), the relevant content — your profile, the documents you attached, the job posting details, and your instructions — is sent **directly from your browser to the AI provider you selected**, authenticated with **your own API key**:

- Anthropic, if you configured Claude — see [Anthropic's privacy policy](https://www.anthropic.com/legal/privacy)
- OpenAI, if you configured ChatGPT — see [OpenAI's privacy policy](https://openai.com/policies/privacy-policy)

Your relationship with that provider is governed by their terms and your account settings with them. Career Copilot never routes your data through any intermediary server, and never sends anything to any party other than the provider you chose, at the moment you choose to use it.

## What the extension reads from web pages

Reading web pages is **optional and off by default**. The first time you click **Get Job**, Chrome asks whether to allow the extension to read websites. If you grant it, then when you use the feature the extension reads the current tab to detect the **company name, role title, job description, and application questions** on a job posting.

- Page content is used only to fill in the job fields you see in the panel; the job details for your current draft are kept in memory and are not written to storage.
- The extension never reads pages in the background, never tracks your browsing, and never collects page content unrelated to the job posting you're viewing.
- You can revoke this permission at any time at `chrome://extensions` → Career Copilot → Details → Site access.

## What we collect

Nothing. Career Copilot contains no analytics, no telemetry, no error reporting, no cookies, and no tracking of any kind.

## Data retention and deletion

Your data persists in local browser storage until you delete it. You are in full control:

- **Profile / documents / notes:** edit or delete any entry in the Profile tab, or use **Clear all** to erase the profile (a one-step undo snapshot is kept locally).
- **API keys:** remove them in Settings at any time.
- **Everything at once:** uninstalling the extension deletes all locally stored data.

You can also export your profile as a JSON file from the Review tab at any time.

## Children

Career Copilot is a job-application tool intended for people of working age and is not directed at children under 13.

## Changes to this policy

If the extension's data practices ever change (for example, adding an optional sync feature), this policy will be updated and the effective date revised before the change ships. Material changes will be called out in the extension's release notes.

## Contact

Questions or concerns: **adteague89@gmail.com**
