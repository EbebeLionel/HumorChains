# Prompt Chain Tool

A superadmin-only tool for building the prompt chains (humor flavors) that turn an image into captions for The Humor Project.

- Create, rename, and delete prompt chains (`humor_flavors`)
- Add, edit, delete, and reorder chain steps (`humor_flavor_steps`)
- Run a chain on an image and save the run like the production pipeline: `caption_requests` → `llm_prompt_chains` → `llm_model_responses` (one per step) → `captions`
- See every caption a chain has generated
- Light, dark, or system theme

Access is limited to accounts with `profiles.is_superadmin = true`. This is checked in the proxy, again in every page and server action, and a third time by RLS.

## Setup

`.env.local` (and the Vercel project's environment variables):

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
GEMINI_API_KEY=...
# Optional: run OpenAI / xAI steps on their own models instead of the Gemini fallback
OPENAI_API_KEY=...
XAI_API_KEY=...
```

```
npm install
npm run dev
```

Steps reference earlier output with `${step1Output}`, `${step2Output}`, … and can use `${imageDescription}` and `${imageAdditionalContext}`. Steps with input type `image-and-text` receive the image. The last step should use output type `array` so it returns a list of captions.

If a step's provider has no API key, or its Gemini model is retired, the step runs on Gemini 3.5 Flash. The step output then shows a note saying so.
