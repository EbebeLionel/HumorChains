"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminOrNull } from "@/lib/admin";
import { loadLookups, loadSteps } from "@/lib/chains";
import { callModel, toCaptions } from "@/lib/llm";

// Form actions report problems by redirecting back with ?error=, which the page shows
function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

async function admin(path: string) {
  const session = await adminOrNull();
  if (!session) fail(path, "Your session expired, or this account isn't a superadmin. Sign in again.");
  return session;
}

const text = (form: FormData, name: string) => {
  const value = String(form.get(name) ?? "").trim();
  return value || null;
};
const int = (form: FormData, name: string) => Number.parseInt(String(form.get(name) ?? ""), 10);

// ---------- Chains ----------

export async function createChain(form: FormData) {
  const { supabase } = await admin("/");
  const slug = text(form, "slug");
  if (!slug) fail("/", "Give the chain a name.");

  const { data, error } = await supabase
    .from("humor_flavors")
    .insert({ slug, description: text(form, "description") })
    .select("id")
    .single();
  if (error) fail("/", error.code === "23505" ? `A chain called "${slug}" already exists.` : error.message);

  revalidatePath("/");
  redirect(`/chains/${data.id}`);
}

export async function updateChain(form: FormData) {
  const id = int(form, "id");
  const path = `/chains/${id}`;
  const { supabase } = await admin(path);
  const slug = text(form, "slug");
  if (!slug) fail(path, "The chain needs a name.");

  const { error } = await supabase
    .from("humor_flavors")
    .update({ slug, description: text(form, "description") })
    .eq("id", id);
  if (error) fail(path, error.code === "23505" ? `A chain called "${slug}" already exists.` : error.message);

  revalidatePath(path);
  redirect(`${path}?saved=chain`);
}

export async function deleteChain(form: FormData) {
  const id = int(form, "id");
  const path = `/chains/${id}`;
  const { supabase } = await admin(path);

  // Generated media points at the chain, so refuse rather than orphan or mass-delete it
  const [captions, responses] = await Promise.all([
    supabase.from("captions").select("id", { count: "exact", head: true }).eq("humor_flavor_id", id),
    supabase.from("llm_model_responses").select("id", { count: "exact", head: true }).eq("humor_flavor_id", id),
  ]);
  if (captions.count || responses.count) {
    fail(path, `This chain has generated media (${captions.count ?? 0} captions, ${responses.count ?? 0} LLM responses), so it can't be deleted without losing that history.`);
  }

  for (const table of ["humor_flavor_mix", "humor_flavor_steps"]) {
    const { error } = await supabase.from(table).delete().eq("humor_flavor_id", id);
    if (error) fail(path, error.message);
  }
  const { error } = await supabase.from("humor_flavors").delete().eq("id", id);
  if (error) fail(path, error.message);

  revalidatePath("/");
  redirect("/?deleted=1");
}

// ---------- Steps ----------

function stepFields(form: FormData) {
  const temperature = text(form, "llm_temperature");
  return {
    description: text(form, "description"),
    humor_flavor_step_type_id: int(form, "humor_flavor_step_type_id"),
    llm_model_id: int(form, "llm_model_id"),
    llm_input_type_id: int(form, "llm_input_type_id"),
    llm_output_type_id: int(form, "llm_output_type_id"),
    llm_temperature: temperature === null ? null : Number(temperature),
    llm_system_prompt: text(form, "llm_system_prompt"),
    llm_user_prompt: text(form, "llm_user_prompt"),
  };
}

export async function createStep(form: FormData) {
  const chainId = int(form, "humor_flavor_id");
  const path = `/chains/${chainId}`;
  const { supabase } = await admin(path);

  const { data: last } = await supabase
    .from("humor_flavor_steps")
    .select("order_by")
    .eq("humor_flavor_id", chainId)
    .order("order_by", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase
    .from("humor_flavor_steps")
    .insert({ ...stepFields(form), humor_flavor_id: chainId, order_by: (last?.order_by ?? 0) + 1 });
  if (error) fail(path, error.message);

  revalidatePath(path);
  redirect(`${path}?saved=step`);
}

export async function updateStep(form: FormData) {
  const chainId = int(form, "humor_flavor_id");
  const path = `/chains/${chainId}`;
  const { supabase } = await admin(path);

  const { error } = await supabase.from("humor_flavor_steps").update(stepFields(form)).eq("id", int(form, "id"));
  if (error) fail(path, error.message);

  revalidatePath(path);
  redirect(`${path}?saved=step`);
}

export async function deleteStep(form: FormData) {
  const chainId = int(form, "humor_flavor_id");
  const path = `/chains/${chainId}`;
  const { supabase } = await admin(path);

  const { error } = await supabase.from("humor_flavor_steps").delete().eq("id", int(form, "id"));
  if (error) {
    fail(path, error.code === "23503" ? "This step has LLM responses from earlier runs, so it can't be deleted." : error.message);
  }

  // Close the gap so steps stay numbered 1..n
  const { data: steps } = await loadSteps(supabase, chainId);
  const renumbered = await renumber(supabase, (steps ?? []).map((s) => s.id));
  if (renumbered) fail(path, renumbered);

  revalidatePath(path);
  redirect(path);
}

export async function moveStep(form: FormData) {
  const chainId = int(form, "humor_flavor_id");
  const path = `/chains/${chainId}`;
  const { supabase } = await admin(path);

  const { data: steps, error } = await loadSteps(supabase, chainId);
  if (error) fail(path, error.message);

  const ids = (steps ?? []).map((s) => s.id);
  const from = ids.indexOf(int(form, "id"));
  const to = from + (form.get("direction") === "up" ? -1 : 1);
  if (from >= 0 && to >= 0 && to < ids.length) {
    [ids[from], ids[to]] = [ids[to], ids[from]];
    const moved = await renumber(supabase, ids);
    if (moved) fail(path, moved);
  }

  revalidatePath(path);
  redirect(path);
}

// Give steps order_by 1..n in the given order. Goes through temporary values first so a
// unique (chain, order_by) constraint never sees two steps with the same number.
async function renumber(supabase: SupabaseClient, ids: number[]) {
  for (const offset of [10000, 0]) {
    for (const [index, id] of ids.entries()) {
      const { error } = await supabase
        .from("humor_flavor_steps")
        .update({ order_by: offset + index + 1 })
        .eq("id", id);
      if (error) return error.message;
    }
  }
  return null;
}

// ---------- Generation ----------

export type StepRun = { order: number; model: string; seconds: number; output: string; note?: string };
export type GenerateState = { error?: string; captions?: string[]; steps?: StepRun[] } | null;

// Run every step of the chain against one image, saving the run the same way the
// production pipeline does: caption_requests -> llm_prompt_chains -> llm_model_responses
// (one per step) -> captions (from the last step's output).
export async function generate(_prev: GenerateState, form: FormData): Promise<GenerateState> {
  const session = await adminOrNull();
  if (!session) return { error: "Your session expired. Sign in again." };
  const { supabase, user } = session;
  const chainId = int(form, "humor_flavor_id");
  const steps: StepRun[] = [];

  // Pick an existing image, or register a new one from a pasted URL
  let imageId = text(form, "image_id");
  const imageUrl = text(form, "image_url");
  if (imageUrl) {
    if (!/^https?:\/\//i.test(imageUrl)) return { error: "The image URL must start with http:// or https://." };
    const { data, error } = await supabase
      .from("images")
      .insert({ url: imageUrl, profile_id: user.id, is_public: false, is_common_use: false })
      .select("id")
      .single();
    if (error) return { error: `Couldn't save the image: ${error.message}` };
    imageId = data.id;
  }
  if (!imageId) return { error: "Pick an image or paste an image URL." };

  const [{ data: chainSteps, error: stepsError }, lookups, { data: image, error: imageError }] = await Promise.all([
    loadSteps(supabase, chainId),
    loadLookups(supabase),
    supabase.from("images").select("id, url, image_description, additional_context").eq("id", imageId).single(),
  ]);
  if (stepsError || lookups.error || imageError) return { error: (stepsError ?? lookups.error ?? imageError)!.message };
  if (!chainSteps?.length) return { error: "This chain has no steps yet." };
  if (!image.url) return { error: "That image has no URL." };

  const { data: request, error: requestError } = await supabase
    .from("caption_requests")
    .insert({ image_id: image.id, profile_id: user.id })
    .select("id")
    .single();
  if (requestError) return { error: `Couldn't create the generation request: ${requestError.message}` };

  const { data: run, error: runError } = await supabase
    .from("llm_prompt_chains")
    .insert({ caption_request_id: request.id })
    .select("id")
    .single();
  if (runError) return { error: `Couldn't create the prompt chain run: ${runError.message}` };

  const inputSlug = new Map(lookups.inputs.map((o) => [o.id, o.label]));
  const outputSlug = new Map(lookups.outputs.map((o) => [o.id, o.label]));
  const outputs: string[] = [];

  for (const step of chainSteps) {
    const model = lookups.models.find((m) => m.id === step.llm_model_id);
    if (!model) return { error: `Step ${step.order_by} uses an unknown model.`, steps };

    // Same template variables the production pipeline fills in, e.g. ${step1Output}
    const vars: Record<string, string> = {
      imageDescription: image.image_description ?? "",
      imageAdditionalContext: image.additional_context ?? "",
      allCommunityContexts: "",
    };
    outputs.forEach((output, i) => (vars[`step${i + 1}Output`] = output));
    const fill = (template: string | null) => (template ?? "").replace(/\$\{(\w+)\}/g, (_, name) => vars[name] ?? "");

    const system = fill(step.llm_system_prompt);
    const userPrompt = fill(step.llm_user_prompt);
    const started = Date.now();
    let result;
    try {
      result = await callModel(model, lookups.models, {
        system,
        user: userPrompt,
        imageUrl: inputSlug.get(step.llm_input_type_id) === "image-and-text" ? image.url : null,
        temperature: step.llm_temperature,
        wantArray: outputSlug.get(step.llm_output_type_id) === "array",
      });
    } catch (error) {
      return { error: `Step ${step.order_by} failed: ${error instanceof Error ? error.message : String(error)}`, steps };
    }
    const seconds = (Date.now() - started) / 1000;
    outputs.push(result.text);
    steps.push({ order: step.order_by, model: result.model.name, seconds, output: result.text, note: result.note });

    const { error } = await supabase.from("llm_model_responses").insert({
      caption_request_id: request.id,
      llm_prompt_chain_id: run.id,
      humor_flavor_id: chainId,
      humor_flavor_step_id: step.id,
      llm_model_id: result.model.id,
      profile_id: user.id,
      llm_system_prompt: system,
      llm_user_prompt: userPrompt,
      llm_temperature: step.llm_temperature,
      llm_model_response: result.text,
      processing_time_seconds: Math.round(seconds),
    });
    if (error) return { error: `Couldn't save step ${step.order_by}'s response: ${error.message}`, steps };
  }

  const captions = toCaptions(outputs.at(-1) ?? "");
  if (!captions.length) return { error: "The last step didn't produce any captions.", steps };

  const { error } = await supabase.from("captions").insert(
    captions.map((content) => ({
      content,
      image_id: image.id,
      profile_id: user.id,
      humor_flavor_id: chainId,
      caption_request_id: request.id,
      llm_prompt_chain_id: run.id,
      is_public: false,
    }))
  );
  if (error) return { error: `Couldn't save the captions: ${error.message}`, steps };

  revalidatePath(`/chains/${chainId}/media`);
  return { captions, steps };
}
