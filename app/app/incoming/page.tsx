"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { LoanList } from "@/components/LoanList";
import { PageHeader } from "@/components/ui";

export default function IncomingRequestsPage() {
  const loans = useQuery(api.loans.incoming);
  const [filter, setFilter] = useState<"open" | "all">("open");
  return (
    <>
      <PageHeader title="Incoming requests" subtitle="Approve, decline and close out loans of your tools." />
      <LoanList loans={loans} perspective="lender" filter={filter} onFilter={setFilter}
        emptyTitle="No incoming requests right now." />
    </>
  );
}
