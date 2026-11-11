"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CATEGORIES } from "@/convex/lib/categories";
import { RequestForm } from "@/components/RequestForm";
import { Badge, Button, Card, Empty, Loading, PageHeader, TrustedBadge, formatRange } from "@/components/ui";

export default function BrowsePage() {
  const [category, setCategory] = useState("");
  const tools = useQuery(api.tools.list, { category: category || undefined });
  const [requesting, setRequesting] = useState<Id<"tools"> | null>(null);
  const [sentFor, setSentFor] = useState<Id<"tools"> | null>(null);

  return (
    <>
      <PageHeader
        title="Browse tools"
        subtitle="Everything in the loop, with live availability."
        action={
          <label className="flex items-center gap-2 text-sm">
            <span className="text-stone-500">Category</span>
            <select className="input w-48" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
        }
      />
      {tools === undefined ? (
        <Loading />
      ) : tools.length === 0 ? (
        <Empty title="No tools here yet">{category ? "Try another category." : "List one from My listings."}</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <Card key={tool._id} className="flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold">{tool.name}</h2>
                {tool.available ? <Badge tone="green">Available</Badge> : <Badge tone="amber">On loan until {formatRange(tool.onLoanUntil!, tool.onLoanUntil!)}</Badge>}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge>{tool.category}</Badge>
                <Badge tone="blue">{tool.condition}</Badge>
              </div>
              {tool.description && <p className="mt-3 line-clamp-3 text-sm text-stone-600">{tool.description}</p>}
              {tool.upcoming.length > 0 && (
                <p className="mt-2 text-xs text-stone-500">
                  Booked: {tool.upcoming.slice(0, 3).map((r) => formatRange(r.startDate, r.endDate)).join(", ")}
                </p>
              )}
              <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-sm text-stone-500">
                <span className="flex items-center gap-1.5">
                  {tool.isMine ? "Your listing" : tool.ownerName}
                  {tool.ownerTrusted && <TrustedBadge />}
                </span>
                {!tool.isMine && requesting !== tool._id && (
                  <Button variant="secondary" onClick={() => { setRequesting(tool._id); setSentFor(null); }}>
                    {sentFor === tool._id ? "Requested ✓" : "Request"}
                  </Button>
                )}
              </div>
              {requesting === tool._id && (
                <RequestForm
                  toolId={tool._id}
                  onCancel={() => setRequesting(null)}
                  onSent={() => { setRequesting(null); setSentFor(tool._id); }}
                />
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
