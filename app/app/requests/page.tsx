"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { LoanList } from "@/components/LoanList";
import { PageHeader } from "@/components/ui";

export default function MyRequestsPage() {
  const loans = useQuery(api.loans.myRequests);
  const [filter, setFilter] = useState<"open" | "all">("open");
  return (
    <>
      <PageHeader title="My requests" subtitle="Tools you've asked to borrow." />
      <LoanList loans={loans} perspective="borrower" filter={filter} onFilter={setFilter}
        emptyTitle="No requests here. Browse tools to borrow one." />
    </>
  );
}
