import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { loadLookups, loadSteps, type Chain } from "@/lib/chains";
import SubmitButton from "@/components/SubmitButton";
import { deleteChain, moveStep, updateChain } from "../../actions";
import GeneratePanel from "./GeneratePanel";
import StepForm from "./StepForm";

// Running a chain makes one LLM call per step, which can take a while
export const maxDuration = 300;

const SAVED: Record<string, string> = { chain: "Chain saved.", step: "Step saved." };

export default async function ChainPage({ params, searchParams }: PageProps<"/chains/[id]">) {
  const { supabase } = await requireAdmin();
  const id = Number((await params).id);
  const { error, saved } = await searchParams;
  if (!Number.isInteger(id)) notFound();

  const [{ data: chain }, { data: steps, error: stepsError }, lookups, { data: images }, { count: mediaCount }] =
    await Promise.all([
      supabase.from("humor_flavors").select("id, slug, description, created_datetime_utc").eq("id", id).maybeSingle<Chain>(),
      loadSteps(supabase, id),
      loadLookups(supabase),
      supabase
        .from("images")
        .select("id, url")
        .eq("is_common_use", true)
        .not("url", "is", null)
        .order("created_datetime_utc", { ascending: false })
        .limit(12)
        .returns<{ id: string; url: string }[]>(),
      supabase.from("captions").select("id", { count: "exact", head: true }).eq("humor_flavor_id", id),
    ]);
  if (!chain) notFound();

  const label = (options: { id: number; label: string }[], value: number) =>
    options.find((o) => o.id === value)?.label ?? `#${value}`;
  const modelName = (value: number) => lookups.models.find((m) => m.id === value)?.name ?? `Model #${value}`;
  const list = steps ?? [];
  const loadError = stepsError ?? lookups.error;

  return (
    <>
      <header className="page-head">
        <Link href="/" className="text-link small">← All chains</Link>
        <h1>{chain.slug}</h1>
        {chain.description && <p className="muted">{chain.description}</p>}
      </header>

      {typeof error === "string" && <p className="alert alert-error">{error}</p>}
      {typeof saved === "string" && SAVED[saved] && <p className="alert alert-ok">{SAVED[saved]}</p>}
      {loadError && <p className="alert alert-error">Some data failed to load: {loadError.message}</p>}

      <section className="card">
        <div className="card-head">
          <h2>Steps</h2>
          <span className="muted small">Run top to bottom. Each step can use earlier outputs.</span>
        </div>

        {list.length ? (
          <ol className="steps">
            {list.map((step, i) => (
              <li key={step.id} className="step">
                <div className="step-head">
                  <span className="step-num">{step.order_by}</span>
                  <div className="step-title">
                    <strong>{step.description || `Step ${step.order_by}`}</strong>
                    <span className="muted small">
                      {modelName(step.llm_model_id)} · {label(lookups.inputs, step.llm_input_type_id)} →{" "}
                      {label(lookups.outputs, step.llm_output_type_id)} ·{" "}
                      {label(lookups.stepTypes, step.humor_flavor_step_type_id)}
                    </span>
                  </div>
                  <form action={moveStep} className="move">
                    <input type="hidden" name="humor_flavor_id" value={id} />
                    <input type="hidden" name="id" value={step.id} />
                    <button
                      type="submit"
                      name="direction"
                      value="up"
                      className="icon-btn"
                      disabled={i === 0}
                      title="Move up"
                      aria-label={`Move step ${step.order_by} up`}
                    >
                      ↑
                    </button>
                    <button
                      type="submit"
                      name="direction"
                      value="down"
                      className="icon-btn"
                      disabled={i === list.length - 1}
                      title="Move down"
                      aria-label={`Move step ${step.order_by} down`}
                    >
                      ↓
                    </button>
                  </form>
                </div>
                {step.llm_user_prompt && <p className="small clamp prompt-preview">{step.llm_user_prompt}</p>}
                <details className="edit">
                  <summary>Edit step</summary>
                  <StepForm chainId={id} lookups={lookups} step={step} />
                </details>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">No steps yet. Add the first one below.</p>
        )}

        <details className="edit add-step" open={list.length === 0}>
          <summary>+ Add a step</summary>
          <StepForm chainId={id} lookups={lookups} />
        </details>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Generate</h2>
          <Link href={`/chains/${id}/media`} className="text-link small">
            Generated media ({(mediaCount ?? 0).toLocaleString()} captions) →
          </Link>
        </div>
        <GeneratePanel chainId={id} stepCount={list.length} images={images ?? []} />
      </section>

      <section className="card">
        <h2>Chain settings</h2>
        <form action={updateChain} className="form">
          <input type="hidden" name="id" value={id} />
          <label className="field">
            <span>Name</span>
            <input name="slug" className="input" defaultValue={chain.slug} required />
          </label>
          <label className="field">
            <span>Description</span>
            <textarea name="description" className="input" rows={2} defaultValue={chain.description ?? ""} />
          </label>
          <div className="actions">
            <SubmitButton pendingLabel="Saving…">Save chain</SubmitButton>
            <SubmitButton
              className="btn btn-danger"
              formAction={deleteChain}
              pendingLabel="Deleting…"
              confirm={`Delete "${chain.slug}" and all ${list.length} of its steps? This can't be undone.`}
            >
              Delete chain
            </SubmitButton>
          </div>
        </form>
      </section>
    </>
  );
}
