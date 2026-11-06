"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { generate, type GenerateState } from "../../actions";

type Props = { chainId: number; stepCount: number; images: { id: string; url: string }[] };

function RunButton({ stepCount }: { stepCount: number }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn" disabled={pending || stepCount === 0}>
      {pending ? `Running ${stepCount} step${stepCount === 1 ? "" : "s"}…` : "Generate captions"}
    </button>
  );
}

export default function GeneratePanel({ chainId, stepCount, images }: Props) {
  const [state, action] = useActionState<GenerateState, FormData>(generate, null);

  return (
    <form action={action} className="form">
      <input type="hidden" name="humor_flavor_id" value={chainId} />

      <fieldset className="image-picker">
        <legend className="small muted">Pick a test image</legend>
        {images.map((image, i) => (
          <label key={image.id} className="pick">
            <input type="radio" name="image_id" value={image.id} defaultChecked={i === 0} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.url} alt="" loading="lazy" />
          </label>
        ))}
      </fieldset>

      <label className="field">
        <span>…or paste an image URL (overrides the pick)</span>
        <input name="image_url" type="url" className="input" placeholder="https://…/photo.jpg" />
      </label>

      <div className="actions">
        <RunButton stepCount={stepCount} />
        {stepCount === 0 && <span className="muted small">Add a step first.</span>}
      </div>

      {state?.error && <p className="alert alert-error">{state.error}</p>}

      {state?.captions && (
        <div className="result">
          <h3>Captions</h3>
          <ol className="captions">
            {state.captions.map((caption, i) => (
              <li key={i}>{caption}</li>
            ))}
          </ol>
          <Link href={`/chains/${chainId}/media`} className="text-link small">
            See everything this chain has generated →
          </Link>
        </div>
      )}

      {state?.steps?.length ? (
        <details className="result" open={Boolean(state.error)}>
          <summary>Step outputs</summary>
          {state.steps.map((s) => (
            <div key={s.order} className="step-output">
              <p className="small">
                <strong>Step {s.order}</strong> · {s.model} · {s.seconds.toFixed(1)}s
                {s.note && <span className="muted"> · {s.note}</span>}
              </p>
              <pre>{s.output}</pre>
            </div>
          ))}
        </details>
      ) : null}
    </form>
  );
}
