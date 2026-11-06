"use client";

import { useFormStatus } from "react-dom";

type Props = {
  children: React.ReactNode;
  className?: string;
  pendingLabel?: string;
  // Ask before submitting (for deletes)
  confirm?: string;
  // Submit to a different server action than the form (e.g. a Delete next to Save)
  formAction?: (formData: FormData) => void | Promise<void>;
};

export default function SubmitButton({ children, className = "btn", pendingLabel, confirm, formAction }: Props) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      formAction={formAction}
      formNoValidate={Boolean(formAction)}
      onClick={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      {pending ? (pendingLabel ?? "Working…") : children}
    </button>
  );
}
