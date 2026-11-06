import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// A prompt chain is a humor_flavors row; its steps are humor_flavor_steps ordered by order_by.
export type Chain = {
  id: number;
  slug: string;
  description: string | null;
  created_datetime_utc: string;
};

export type Step = {
  id: number;
  humor_flavor_id: number;
  order_by: number;
  description: string | null;
  humor_flavor_step_type_id: number;
  llm_model_id: number;
  llm_input_type_id: number;
  llm_output_type_id: number;
  llm_temperature: number | null;
  llm_system_prompt: string | null;
  llm_user_prompt: string | null;
};

export type Option = { id: number; label: string };

export type Model = {
  id: number;
  name: string;
  provider_model_id: string;
  is_temperature_supported: boolean;
  provider: string;
};

export const STEP_COLUMNS =
  "id, humor_flavor_id, order_by, description, humor_flavor_step_type_id, llm_model_id, llm_input_type_id, llm_output_type_id, llm_temperature, llm_system_prompt, llm_user_prompt";

export async function loadSteps(supabase: SupabaseClient, chainId: number) {
  return supabase
    .from("humor_flavor_steps")
    .select(STEP_COLUMNS)
    .eq("humor_flavor_id", chainId)
    .order("order_by")
    .returns<Step[]>();
}

// The dropdown values a step needs: step types, models, input/output types
export async function loadLookups(supabase: SupabaseClient) {
  const [stepTypes, models, providers, inputs, outputs] = await Promise.all([
    supabase.from("humor_flavor_step_types").select("id, slug").order("id"),
    supabase.from("llm_models").select("id, name, provider_model_id, is_temperature_supported, llm_provider_id").order("name"),
    supabase.from("llm_providers").select("id, name"),
    supabase.from("llm_input_types").select("id, slug").order("id"),
    supabase.from("llm_output_types").select("id, slug").order("id"),
  ]);

  const providerName = new Map((providers.data ?? []).map((p) => [p.id as number, p.name as string]));
  const toOptions = (rows: { id: number; slug: string }[] | null) => (rows ?? []).map((r) => ({ id: r.id, label: r.slug }));

  return {
    error: stepTypes.error ?? models.error ?? providers.error ?? inputs.error ?? outputs.error,
    stepTypes: toOptions(stepTypes.data),
    inputs: toOptions(inputs.data),
    outputs: toOptions(outputs.data),
    models: (models.data ?? []).map(
      (m): Model => ({
        id: m.id,
        name: m.name,
        provider_model_id: m.provider_model_id,
        is_temperature_supported: m.is_temperature_supported,
        provider: providerName.get(m.llm_provider_id) ?? "Unknown",
      })
    ),
  };
}

export type Lookups = Awaited<ReturnType<typeof loadLookups>>;
