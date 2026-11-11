"use client";

import { useState, type FormEvent } from "react";
import { CATEGORIES, CONDITIONS, LIMITS } from "@/convex/lib/categories";
import { useAsyncAction } from "@/lib/useAction";
import { Button, ErrorText } from "./ui";

export type ToolValues = { name: string; category: string; condition: string; description: string };

const empty: ToolValues = { name: "", category: CATEGORIES[0], condition: "Good", description: "" };

export function ToolForm({
  initial = empty,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: ToolValues;
  submitLabel: string;
  onSubmit: (values: ToolValues) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState(initial);
  const { run, pending, error } = useAsyncAction(onSubmit);
  const set = (key: keyof ToolValues) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = await run(values);
    if (ok !== undefined && initial === empty) setValues(empty);
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <label className="sm:col-span-2">
        <span className="label">Tool name</span>
        <input className="input" required minLength={2} maxLength={LIMITS.name} value={values.name}
          onChange={set("name")} placeholder="e.g. Cordless drill" />
      </label>
      <label>
        <span className="label">Category</span>
        <select className="input" value={values.category} onChange={set("category")}>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>
      <label>
        <span className="label">Condition</span>
        <select className="input" value={values.condition} onChange={set("condition")}>
          {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>
      <label className="sm:col-span-2">
        <span className="label">Short description</span>
        <textarea className="input min-h-20" maxLength={LIMITS.description} value={values.description}
          onChange={set("description")} placeholder="Batteries included? Anything to know?" />
      </label>
      <div className="flex items-center justify-between gap-2 sm:col-span-2">
        <ErrorText>{error}</ErrorText>
        <div className="ml-auto flex gap-2">
          {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button>
        </div>
      </div>
    </form>
  );
}
