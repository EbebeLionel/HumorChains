import "server-only";
import type { Model } from "./chains";

export type LlmCall = {
  system: string;
  user: string;
  imageUrl?: string | null;
  temperature?: number | null;
  // Ask the model for a JSON array (steps whose output type is "array")
  wantArray?: boolean;
};

export type LlmResult = { text: string; model: Model; note?: string };

// Models the chain can run on directly. Anything else (no API key for that provider, or a
// retired Gemini model) runs on the fallback so a chain still produces output; the step
// result says so.
const FALLBACK_MODEL_ID = "gemini-3.5-flash";

const OPENAI_COMPATIBLE: Record<string, { url: string; env: string }> = {
  OpenAI: { url: "https://api.openai.com/v1/chat/completions", env: "OPENAI_API_KEY" },
  xAI: { url: "https://api.x.ai/v1/chat/completions", env: "XAI_API_KEY" },
};

export async function callModel(model: Model, models: Model[], call: LlmCall): Promise<LlmResult> {
  const fallback = models.find((m) => m.provider_model_id === FALLBACK_MODEL_ID) ?? model;
  const system = call.wantArray
    ? `${call.system}\n\nRespond with only a JSON array of strings, no other text.`.trim()
    : call.system;

  if (model.provider === "Google") {
    try {
      return { text: await gemini(model, { ...call, system }), model };
    } catch (error) {
      // Older Gemini models (1.5, 2.5) are retired for new API keys; run those steps on the fallback instead
      if (error instanceof LlmError && error.status === 404 && fallback !== model) {
        return { text: await gemini(fallback, { ...call, system }), model: fallback, note: `${model.name} is no longer available, ran on ${fallback.name}` };
      }
      throw error;
    }
  }

  const compat = OPENAI_COMPATIBLE[model.provider];
  const key = compat ? process.env[compat.env] : undefined;
  if (compat && key) {
    return { text: await openAiCompatible(compat.url, key, model, { ...call, system }), model };
  }

  const reason = compat ? `${compat.env} is not set` : `no client for ${model.provider}`;
  return { text: await gemini(fallback, { ...call, system }), model: fallback, note: `${reason}, ran on ${fallback.name}` };
}

class LlmError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function fetchImage(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Couldn't download the image (${response.status})`);
  const mimeType = response.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  const data = Buffer.from(await response.arrayBuffer()).toString("base64");
  return { mimeType, data };
}

async function gemini(model: Model, call: LlmCall) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  const parts: object[] = [{ text: call.user || "(no prompt)" }];
  if (call.imageUrl) {
    const image = await fetchImage(call.imageUrl);
    parts.push({ inline_data: { mime_type: image.mimeType, data: image.data } });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model.provider_model_id}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        ...(call.system ? { systemInstruction: { parts: [{ text: call.system }] } } : {}),
        contents: [{ role: "user", parts }],
        generationConfig: {
          ...(call.temperature != null ? { temperature: call.temperature } : {}),
          ...(call.wantArray ? { responseMimeType: "application/json" } : {}),
        },
      }),
    }
  );
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new LlmError(`${model.name}: ${body?.error?.message ?? response.statusText}`, response.status);
  }
  const text = (body?.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error(`${model.name} returned no text (${body?.candidates?.[0]?.finishReason ?? "unknown reason"})`);
  return text;
}

async function openAiCompatible(url: string, key: string, model: Model, call: LlmCall) {
  const content: object[] = [{ type: "text", text: call.user || "(no prompt)" }];
  if (call.imageUrl) content.push({ type: "image_url", image_url: { url: call.imageUrl } });

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: model.provider_model_id,
      messages: [...(call.system ? [{ role: "system", content: call.system }] : []), { role: "user", content }],
      ...(model.is_temperature_supported && call.temperature != null ? { temperature: call.temperature } : {}),
    }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new LlmError(`${model.name}: ${body?.error?.message ?? response.statusText}`, response.status);
  }
  const text = String(body?.choices?.[0]?.message?.content ?? "").trim();
  if (!text) throw new Error(`${model.name} returned no text`);
  return text;
}

// Turn the last step's output into a list of captions. Models wrap JSON in code fences or
// return objects ({ captions: [...] }), so accept those shapes, then fall back to lines.
export function toCaptions(output: string): string[] {
  const cleaned = output.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const pick = (item: unknown): string | null => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object") {
      const value = Object.values(item).find((v) => typeof v === "string");
      return typeof value === "string" ? value : null;
    }
    return null;
  };

  try {
    const parsed: unknown = JSON.parse(cleaned);
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object"
        ? Object.values(parsed).find(Array.isArray)
        : typeof parsed === "string"
          ? [parsed]
          : null;
    if (Array.isArray(list)) {
      return list.map(pick).filter((c): c is string => Boolean(c?.trim())).map((c) => c.trim());
    }
  } catch {
    // not JSON
  }

  return cleaned
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").replace(/^"|"$/g, "").trim())
    .filter(Boolean);
}
