"use client";

import Link from "next/link";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { useAsyncAction } from "@/lib/useAction";
import { Button, Card, Empty, ErrorText, Loading, StatusBadge, TrustedBadge, formatRange } from "./ui";

export type LoanView = FunctionReturnType<typeof api.loans.myRequests>[number];

const FILTERS = ["open", "all"] as const;
const isOpen = (l: LoanView) => l.status === "pending" || l.status === "approved";

function LoanActions({ loan }: { loan: LoanView }) {
  const approve = useAsyncAction(useMutation(api.loans.approve));
  const decline = useAsyncAction(useMutation(api.loans.decline));
  const cancel = useAsyncAction(useMutation(api.loans.cancel));
  const returned = useAsyncAction(useMutation(api.loans.markReturned));
  const busy = approve.pending || decline.pending || cancel.pending || returned.pending;
  const error = approve.error || decline.error || cancel.error || returned.error;
  const args = { loanId: loan._id };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-2">
        {loan.viewerIsLender && loan.status === "pending" && (
          <>
            <Button disabled={busy} onClick={() => approve.run(args)}>Approve</Button>
            <Button variant="danger" disabled={busy} onClick={() => decline.run(args)}>Decline</Button>
          </>
        )}
        {loan.viewerIsBorrower && loan.status === "pending" && (
          <Button variant="secondary" disabled={busy} onClick={() => cancel.run(args)}>Cancel request</Button>
        )}
        {(loan.viewerIsLender || loan.viewerIsBorrower) && loan.status === "approved" && (
          <Button variant="secondary" disabled={busy} onClick={() => returned.run(args)}>Mark returned</Button>
        )}
        <Link href={`/app/loans/${loan._id}`} className="rounded-lg px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100">
          Details
        </Link>
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

export function LoanList({
  loans,
  perspective,
  emptyTitle,
  filter = "open",
  onFilter,
}: {
  loans: LoanView[] | undefined;
  perspective: "borrower" | "lender" | "admin";
  emptyTitle: string;
  filter?: (typeof FILTERS)[number];
  onFilter?: (f: (typeof FILTERS)[number]) => void;
}) {
  if (loans === undefined) return <Loading />;
  const shown = filter === "open" ? loans.filter(isOpen) : loans;
  return (
    <>
      {onFilter && (
        <div className="mb-4 inline-flex rounded-lg bg-stone-200/60 p-1 text-sm">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => onFilter(f)}
              className={`rounded-md px-3 py-1 capitalize ${filter === f ? "bg-white shadow-xs" : "text-stone-600"}`}>
              {f === "open" ? `Open (${loans.filter(isOpen).length})` : `All (${loans.length})`}
            </button>
          ))}
        </div>
      )}
      {shown.length === 0 ? (
        <Empty title={emptyTitle} />
      ) : (
        <div className="space-y-3">
          {shown.map((loan) => (
            <Card key={loan._id} className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{loan.toolName}</h2>
                  <StatusBadge status={loan.status} overdue={loan.overdue} />
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-stone-500">
                  <span>{formatRange(loan.startDate, loan.endDate)}</span>
                  <span>·</span>
                  {perspective === "borrower" && (<>from {loan.lenderName} {loan.lenderTrusted && <TrustedBadge />}</>)}
                  {perspective === "lender" && <>requested by {loan.borrowerName}</>}
                  {perspective === "admin" && <>{loan.borrowerName} borrowing from {loan.lenderName}</>}
                </p>
                {loan.message && <p className="mt-1 text-sm italic text-stone-600">“{loan.message}”</p>}
              </div>
              <LoanActions loan={loan} />
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
