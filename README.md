# Career Copilot

A Chrome extension that drafts tailored cover letters and answers job-application questions from your **full career history** — not just your resume. You bring your own AI provider API key; everything you store stays in your browser.

## How it works

1. **Build your profile once.** Upload a resume PDF, brain-dump anything a resume leaves out, and attach supporting documents (writing samples, case studies, interview transcripts). Everything is merged into one structured, editable profile.
2. **Open a job posting** and click the toolbar icon. Hit **Get Job** and the extension pulls the company, role, and description from the page (works on Lever, Ashby, Greenhouse, Workday, LinkedIn, Indeed, and any site publishing standard job metadata).
3. **Generate.** The model reads your whole history, selects the pieces that genuinely map to that role, and streams a draft. If it doesn't have enough grounded material to write something credible, it asks you targeted questions instead of producing filler — and your answers are saved so it never asks twice.
4. **Refine.** Reprompt with steering ("more concise") or new context ("I also led the payments migration"), optionally saving that context to your profile for every future draft.

There's also a **Quick Copy** tab for one-click snippets you paste into applications constantly (portfolio URL, stock answers).

## Privacy

- Your career profile, documents, and API key are stored **only in your browser** (`chrome.storage.local`). There is no backend.
- Data leaves your machine only as direct API calls to the provider **you** configured (Anthropic or OpenAI), using **your** key.
- Page access is optional and requested only when you click **Get Job**.

Full policy: [PRIVACY.md](./PRIVACY.md).

## Install (beta / unpacked)

Prereqs: Node 20+, an API key from [Anthropic](https://console.anthropic.com) or [OpenAI](https://platform.openai.com).

```bash
npm install
npm run build
```

Then in Chrome:

1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select the `dist/` folder.
3. Click the Career Copilot toolbar icon to open the side panel.
4. In **Settings**, choose your provider, paste your API key (it's verified when you save), and pick a model.
5. Set up your profile, then open any job posting and generate.

## Development

```bash
npm run dev     # Vite dev server with extension HMR
npm run build   # typecheck (tsc --noEmit) + production build to dist/
npm run lint    # ESLint
npm test        # vitest unit tests
```

### Project layout

```
src/
  manifest.ts            MV3 manifest (crxjs)
  background/            service worker (opens the side panel)
  content/detect.ts      self-contained job detector, injected on demand
  lib/
    types.ts             CareerProfile + all shared types
    storage.ts           chrome.storage.local wrappers, backup/restore
    prompts.ts           extraction + generation prompts, profile serialization
    profileSchema.ts     JSON Schema for structured profile extraction
    errors.ts            SDK error → user-facing message mapping
    providers/           LLMProvider interface; Anthropic + OpenAI implementations
  sidepanel/             React UI (Generator, ProfileSetup, QuickCopy, Settings)
```

### Architecture notes

- **No RAG.** A whole career fits comfortably in a modern context window; the model does relevance selection via prompting. Simpler and better than embeddings at this scale.
- **Provider abstraction.** `LLMProvider` isolates the SDK differences (structured output, PDF input, streaming); the UI is provider-agnostic.
- **Merge-on-ingest.** Every intake path hands the model the existing profile and instructs it to merge, so intake order doesn't matter. Every ingest snapshots the prior profile first and is undoable from the Review tab.
- **Sufficiency gate.** Generation prompts include a check: if the profile can't ground a credible draft, the model returns a `[[NEEDS_INFO]]` sentinel with questions, which the UI turns into a conversational loop that permanently enriches the profile.
