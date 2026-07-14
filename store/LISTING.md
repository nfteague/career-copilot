# Chrome Web Store submission kit

Everything to copy-paste into the Developer Dashboard, plus the answers for the privacy questionnaire. Assets live in this folder; the uploadable ZIP is produced by `npm run package`.

---

## Store listing tab

**Name:** Career Copilot

**Summary** (132-char limit):

> AI cover letters and application answers, grounded in your real career history. Your own API key — everything stays local.

**Category:** Productivity → Workflow & Planning

**Language:** English

**Detailed description:**

> Career Copilot drafts tailored cover letters and answers job-application questions — grounded in your full career history, not just whatever fits on one page of a resume.
>
> HOW IT WORKS
>
> 1. Build your profile once. Upload your resume (PDF or DOCX), brain-dump the things resumes leave out, and attach supporting documents — writing samples, case studies, even interview transcripts. Everything merges into one structured profile you can review and edit.
>
> 2. Open a job posting and click "Get Job." The company, role, and description are pulled straight from the page — works on major job boards, applicant-tracking systems, and any site that publishes standard job metadata.
>
> 3. Generate. The AI reads your whole history, selects the experiences that genuinely map to that role, and writes a draft around them — real projects, real numbers, no clichés.
>
> WHAT MAKES IT DIFFERENT
>
> • It never invents. Every claim is grounded in material you provided. If your history can't support a credible answer, it asks you targeted questions instead of writing filler — and remembers your answers so future drafts get stronger.
> • Refine like a conversation. Reprompt ("more concise"), add context ("I also led the payments migration"), regenerate.
> • Quick Copy buttons for the things you paste into every application.
>
> YOUR DATA STAYS YOURS
>
> Career Copilot has no server. Your profile, documents, and API key live only in your browser's local storage. Drafting happens as direct calls from your browser to the AI provider you choose — Anthropic (Claude) or OpenAI (ChatGPT) — using your own API key. No account, no analytics, no tracking.
>
> Requires an API key from Anthropic (console.anthropic.com) or OpenAI (platform.openai.com). API usage is billed by your provider at their rates.

**Graphic assets:**

| Asset | File | Notes |
|---|---|---|
| Store icon 128×128 | `public/icons/icon-128.png` | already in the ZIP's manifest too |
| Screenshot 1 (1280×800) | `store/screenshot-1.png` | Generate setup + Get Job story |
| Screenshot 2 (1280×800) | `store/screenshot-2.png` | Draft + reprompt story |
| Small promo tile 440×280 | `store/promo-tile-440x280.png` | optional but recommended |

---

## Privacy tab

**Single purpose description:**

> Drafts tailored cover letters and job-application answers from the user's own career history, using the user's own AI-provider API key.

**Permission justifications:**

- `storage` — Persists the user's career profile, supporting documents, saved snippets, and API key locally on their device. Nothing is synced or sent to the developer.
- `sidePanel` — The extension's entire UI is a side panel, so it can stay open next to the job application the user is filling out.
- `scripting` — When the user clicks "Get Job," a small detection function is injected into the current tab (one-off, on user action) to read the job posting's company, role, description, and application questions. No code runs in pages at any other time.
- **Host permissions (optional, `http://*/*` / `https://*/*`)** — Requested at runtime the first time the user clicks "Get Job," never at install. Job postings live on thousands of employer and ATS domains, so a fixed domain list cannot cover them; access is used solely to read the job posting fields on the page the user is viewing, only when they invoke the feature.
- **Remote code:** No. All code ships in the package; the AI providers are contacted as data-only REST APIs.

**Data usage questionnaire:**

- Personally identifiable information — **checked** (name, email, phone if the user puts them in their profile; stored locally, sent only to the user's chosen AI provider to write drafts)
- Authentication information — **checked** (the user's own API key, stored locally, sent only to that provider as the API credential)
- Professional/employment information? There is no such category; it falls under PII above. Website content — **checked** (job-posting text read from the active tab when the user clicks Get Job)
- Everything else (health, financial, location, web history, user activity, personal communications) — **not collected**
- Certify: data is **not sold**, **not used for unrelated purposes**, **not used for creditworthiness**. ✔ all three attestations.

**Privacy policy URL:**

> https://github.com/nfteague/career-copilot/blob/main/PRIVACY.md

---

## Submission checklist

1. [ ] One-time: register at https://chrome.google.com/webstore/devconsole ($5 fee), verify the contact email (adteague89@gmail.com).
2. [ ] `npm run package` → upload `release/career-copilot-v0.1.0.zip`.
3. [ ] Paste listing copy + upload the three images above.
4. [ ] Fill the Privacy tab from this document; paste the hosted privacy-policy URL.
5. [ ] Distribution: Public (or Unlisted for the beta — link-only install, still reviewed).
6. [ ] Submit for review. Expect a few days; optional-broad-host-permission extensions sometimes get an extra look — the justification text above is written for that reviewer.

**Review-risk notes:** the two headline risks are broad host access (mitigated: optional, runtime, user-gesture) and "does it do what it says with user data" (mitigated: privacy policy matches the code — no server, no telemetry). If review asks for a demo, an unlisted YouTube video of profile → Get Job → generate is usually what unblocks it.

**Versioning:** bump `version` in `src/manifest.ts` AND `package.json` for every new upload (0.1.1, 0.1.2, …); the store rejects re-used versions.
