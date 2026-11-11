"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ToolForm } from "@/components/ToolForm";
import { useAsyncAction } from "@/lib/useAction";
import { Badge, Button, Card, Empty, ErrorText, Loading, PageHeader, formatRange } from "@/components/ui";

export default function MyListingsPage() {
  const tools = useQuery(api.tools.mine);
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const remove = useMutation(api.tools.remove);
  const removal = useAsyncAction(remove);
  const [editing, setEditing] = useState<Id<"tools"> | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <>
      <PageHeader
        title="My listings"
        subtitle="Tools you lend to the neighbourhood."
        action={!adding && <Button onClick={() => setAdding(true)}>+ List a tool</Button>}
      />
      {adding && (
        <Card className="mb-6">
          <h2 className="mb-3 font-semibold">List a tool</h2>
          <ToolForm submitLabel="Publish listing" onCancel={() => setAdding(false)}
            onSubmit={async (values) => { await create(values); setAdding(false); return true; }} />
        </Card>
      )}
      <ErrorText>{removal.error}</ErrorText>
      {tools === undefined ? (
        <Loading />
      ) : tools.length === 0 ? (
        <Empty title="You haven't listed anything yet">Your drill is lonely. Share it.</Empty>
      ) : (
        <div className="mt-2 space-y-3">
          {tools.map((tool) => (
            <Card key={tool._id}>
              {editing === tool._id ? (
                <ToolForm
                  initial={{ name: tool.name, category: tool.category, condition: tool.condition, description: tool.description }}
                  submitLabel="Save changes"
                  onCancel={() => setEditing(null)}
                  onSubmit={async (values) => { await update({ toolId: tool._id, ...values }); setEditing(null); return true; }}
                />
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{tool.name}</h2>
                      <Badge>{tool.category}</Badge>
                      <Badge tone="blue">{tool.condition}</Badge>
                      {tool.available ? <Badge tone="green">Available</Badge> : <Badge tone="amber">On loan until {formatRange(tool.onLoanUntil!, tool.onLoanUntil!)}</Badge>}
                      {tool.pendingRequests > 0 && <Badge tone="amber">{tool.pendingRequests} pending</Badge>}
                    </div>
                    {tool.description && <p className="mt-1 text-sm text-stone-600">{tool.description}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => setEditing(tool._id)}>Edit</Button>
                    <Button variant="danger" disabled={removal.pending}
                      onClick={() => { if (confirm(`Delete "${tool.name}"? Pending requests will be cancelled.`)) removal.run({ toolId: tool._id }); }}>
                      Delete
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
