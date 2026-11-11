"use client";

import { useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAsyncAction } from "@/lib/useAction";
import { Button, ErrorText } from "./ui";

const today = () => new Date().toISOString().slice(0, 10);

export function RequestForm({ toolId, onSent, onCancel }: { toolId: Id<"tools">; onSent: () => void; onCancel: () => void }) {
  const requestLoan = useMutation(api.loans.request);
  const [startDate, setStart] = useState(today());
  const [endDate, setEnd] = useState(today());
  const [message, setMessage] = useState("");
  const { run, pending, error } = useAsyncAction(requestLoan);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const id = await run({ toolId, startDate, endDate, message: message || undefined });
    if (id) onSent();
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 rounded-lg bg-stone-50 p-3">
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className="label">From</span>
          <input type="date" className="input" required min={today()} value={startDate}
            onChange={(e) => { setStart(e.target.value); if (endDate < e.target.value) setEnd(e.target.value); }} />
        </label>
        <label>
          <span className="label">Until</span>
          <input type="date" className="input" required min={startDate} value={endDate}
            onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      <label className="block">
        <span className="label">Note to lender (optional)</span>
        <input className="input" maxLength={300} value={message} placeholder="What's it for?"
          onChange={(e) => setMessage(e.target.value)} />
      </label>
      <ErrorText>{error}</ErrorText>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send request"}</Button>
      </div>
    </form>
  );
}
