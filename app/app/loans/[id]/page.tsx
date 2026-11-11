"use client";

import Link from "next/link";
import { use } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge, Card, Empty, Loading, StatusBadge, TrustedBadge, formatRange } from "@/components/ui";

const kindLabel = {
  request_notification: "Request notification",
  overdue_reminder: "Overdue reminder",
  workflow_error: "Workflow error",
} as const;
const statusTone = { success: "green", retrying: "amber", failed: "red" } as const;

export default function LoanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const loan = useQuery(api.loans.get, { loanId: id as Id<"loans"> });

  if (loan === undefined) return <Loading />;
  if (loan === null) return <Empty title="Loan not found">It may not exist, or you&apos;re not part of it.</Empty>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={loan.viewerIsLender ? "/app/incoming" : "/app/requests"} className="text-sm text-stone-500 hover:text-stone-800">
        ← Back
      </Link>
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">{loan.toolName}</h1>
          <StatusBadge status={loan.status} overdue={loan.overdue} />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div><dt className="label">Dates</dt><dd>{formatRange(loan.startDate, loan.endDate)}</dd></div>
          <div><dt className="label">Lender</dt><dd className="flex items-center gap-1.5">{loan.lenderName} {loan.lenderTrusted && <TrustedBadge />}</dd></div>
          <div><dt className="label">Borrower</dt><dd>{loan.borrowerName}</dd></div>
        </dl>
        {loan.message && <p className="mt-4 text-sm italic text-stone-600">“{loan.message}”</p>}
      </Card>

      <section>
        <h2 className="mb-3 font-semibold">Recent automation activity</h2>
        {loan.automation.length === 0 ? (
          <Empty title="No automation events yet" />
        ) : (
          <ol className="relative space-y-3 border-l border-stone-200 pl-5">
            {loan.automation.map((e) => (
              <li key={e._id} className="relative">
                <span className={`absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full ${e.status === "success" ? "bg-emerald-500" : e.status === "retrying" ? "bg-amber-400" : "bg-red-500"}`} />
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{kindLabel[e.kind]}</span>
                  <Badge tone={statusTone[e.status]}>{e.status}</Badge>
                  <Badge>{e.direction === "outbound" ? "Convex → n8n" : "n8n → Convex"}</Badge>
                  {e.attempt && e.attempt > 1 && <span className="text-xs text-stone-500">attempt {e.attempt}</span>}
                </div>
                <p className="text-sm text-stone-600">{e.detail}</p>
                <time className="text-xs text-stone-400">{new Date(e.at).toLocaleString()}</time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
