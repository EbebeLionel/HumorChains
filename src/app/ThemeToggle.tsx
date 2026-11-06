"use client";

import { useEffect, useState } from "react";

type Choice = "light" | "dark" | "system";
const CHOICES: { value: Choice; label: string; icon: string }[] = [
  { value: "light", label: "Light", icon: "☀️" },
  { value: "dark", label: "Dark", icon: "🌙" },
  { value: "system", label: "System", icon: "💻" },
];

function apply(choice: Choice) {
  const dark = choice === "dark" || (choice === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.dataset.themeChoice = choice;
}

export default function ThemeToggle() {
  const [choice, setChoice] = useState<Choice>("system");

  // Read the saved choice after mount (the inline script in the root layout already applied it)
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with localStorage, which only exists in the browser
    if (saved === "light" || saved === "dark") setChoice(saved);
  }, []);

  // While on "system", follow the OS when it switches
  useEffect(() => {
    if (choice !== "system") return;
    const query = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [choice]);

  function select(next: Choice) {
    setChoice(next);
    localStorage.setItem("theme", next);
    apply(next);
  }

  return (
    <div className="theme-toggle" role="radiogroup" aria-label="Color theme">
      {CHOICES.map((c) => (
        <button
          key={c.value}
          type="button"
          role="radio"
          aria-checked={choice === c.value}
          title={`${c.label} mode`}
          className={choice === c.value ? "active" : undefined}
          onClick={() => select(c.value)}
        >
          <span aria-hidden="true">{c.icon}</span> {c.label}
        </button>
      ))}
    </div>
  );
}
