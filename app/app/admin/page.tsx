"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { LoanList } from "@/components/LoanList";
import { useAsyncAction } from "@/lib/useAction";
import { Badge, Button, Card, Empty, ErrorText, Loading, PageHeader } from "@/components/ui";

const TABS = ["Listings", "Loans", "Lenders"] as const;

export default function AdminPage() {
  const me = useQuery(api.users.me);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Listings");
  if (me === undefined) return <Loading />;
  if (me?.role !== "admin") return <Empty title="Admins only" />;

  return (
    <>
      <PageHeader title="Admin" subtitle="Moderate listings, see every loan, and recognise trusted lenders." />
      <div className="mb-5 inline-flex rounded-lg bg-stone-200/60 p-1 text-sm">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1 ${tab === t ? "bg-white shadow-xs" : "text-stone-600"}`}>{t}</button>
        ))}
      </div>
      {tab === "Listings" && <AdminListings />}
      {tab === "Loans" && <AdminLoans />}
      {tab === "Lenders" && <AdminUsers />}
    </>
  );
}

function AdminListings() {
  const tools = useQuery(api.tools.list, {});
  const removal = useAsyncAction(useMutation(api.tools.remove));
  if (tools === undefined) return <Loading />;
  if (tools.length === 0) return <Empty title="No listings" />;
  return (
    <div className="space-y-2">
      <ErrorText>{removal.error}</ErrorText>
      {tools.map((t) => (
        <Card key={t._id} className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">{t.name}</p>
            <p className="text-sm text-stone-500">{t.category} · {t.ownerName}</p>
          </div>
          <Button variant="danger" disabled={removal.pending}
            onClick={() => { if (confirm(`Remove "${t.name}" for everyone? Open loans will be cancelled.`)) removal.run({ toolId: t._id }); }}>
            Remove
          </Button>
        </Card>
      ))}
    </div>
  );
}

function AdminLoans() {
  const loans = useQuery(api.loans.listAll, {});
  const [filter, setFilter] = useState<"open" | "all">("all");
  return <LoanList loans={loans} perspective="admin" filter={filter} onFilter={setFilter} emptyTitle="No loans yet" />;
}

function AdminUsers() {
  const users = useQuery(api.users.listForAdmin);
  const toggle = useAsyncAction(useMutation(api.users.setTrustedLender));
  if (users === undefined) return <Loading />;
  return (
    <div className="space-y-2">
      <ErrorText>{toggle.error}</ErrorText>
      {users.map((u) => (
        <Card key={u._id} className="flex items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 font-medium">
              {u.name} {u.role === "admin" && <Badge tone="blue">admin</Badge>}
              {u.trustedLender && <Badge tone="green">★ Trusted Lender</Badge>}
            </p>
            <p className="text-sm text-stone-500">{u.email ?? "no email"}</p>
          </div>
          <Button variant={u.trustedLender ? "secondary" : "primary"} disabled={toggle.pending}
            onClick={() => toggle.run({ userId: u._id, trusted: !u.trustedLender })}>
            {u.trustedLender ? "Remove Trusted" : "Mark Trusted Lender"}
          </Button>
        </Card>
      ))}
    </div>
  );
}
