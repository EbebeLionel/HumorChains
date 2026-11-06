import SubmitButton from "@/components/SubmitButton";
import type { Lookups, Step } from "@/lib/chains";
import { createStep, deleteStep, updateStep } from "../../actions";

type Props = { chainId: number; lookups: Lookups; step?: Step };

// Shared by "Add step" (no step) and each step's edit panel
export default function StepForm({ chainId, lookups, step }: Props) {
  const select = (name: keyof Step, label: string, options: { id: number; label: string }[], fallback?: number) => (
    <label className="field">
      <span>{label}</span>
      <select name={name} className="input" defaultValue={String(step?.[name] ?? fallback ?? options[0]?.id ?? "")} required>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
  const byLabel = (options: { id: number; label: string }[], label: string) => options.find((o) => o.label === label)?.id;
  const models = lookups.models.map((m) => ({ id: m.id, label: `${m.name} (${m.provider})` }));
  const defaultModel = lookups.models.find((m) => m.provider_model_id === "gemini-3.5-flash")?.id;

  return (
    <form action={step ? updateStep : createStep} className="form">
      <input type="hidden" name="humor_flavor_id" value={chainId} />
      {step && <input type="hidden" name="id" value={step.id} />}

      <label className="field">
        <span>Description</span>
        <input
          name="description"
          className="input"
          defaultValue={step?.description ?? ""}
          placeholder="e.g. Describe the image in detail"
        />
      </label>

      <div className="grid-4">
        {select("llm_model_id", "Model", models, defaultModel)}
        {select("humor_flavor_step_type_id", "Step type", lookups.stepTypes, byLabel(lookups.stepTypes, "general"))}
        {select("llm_input_type_id", "Input", lookups.inputs, byLabel(lookups.inputs, "text-only"))}
        {select("llm_output_type_id", "Output", lookups.outputs, byLabel(lookups.outputs, "string"))}
      </div>

      <label className="field narrow">
        <span>Temperature (optional)</span>
        <input
          name="llm_temperature"
          type="number"
          step="0.1"
          min="0"
          max="2"
          className="input"
          defaultValue={step?.llm_temperature ?? ""}
        />
      </label>

      <label className="field">
        <span>System prompt</span>
        <textarea name="llm_system_prompt" className="input" rows={4} defaultValue={step?.llm_system_prompt ?? ""} />
      </label>
      <label className="field">
        <span>User prompt</span>
        <textarea
          name="llm_user_prompt"
          className="input"
          rows={4}
          defaultValue={step?.llm_user_prompt ?? ""}
          placeholder="Use ${step1Output} for an earlier step's output, ${imageDescription}, ${imageAdditionalContext}"
        />
      </label>
      <p className="muted small">
        Set Input to <code>image-and-text</code> to send the image with this step. Set the last step&apos;s Output to{" "}
        <code>array</code> so it returns a list of captions.
      </p>

      <div className="actions">
        <SubmitButton pendingLabel="Saving…">{step ? "Save step" : "Add step"}</SubmitButton>
        {step && (
          <SubmitButton
            className="btn btn-danger"
            formAction={deleteStep}
            pendingLabel="Deleting…"
            confirm={`Delete step ${step.order_by}? This can't be undone.`}
          >
            Delete step
          </SubmitButton>
        )}
      </div>
    </form>
  );
}
