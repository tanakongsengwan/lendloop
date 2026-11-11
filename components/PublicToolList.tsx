"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge, Empty, Loading } from "./ui";

/** Read-only public list: the query returns only name + category. */
export function PublicToolList() {
  const tools = useQuery(api.tools.listPublic);
  if (tools === undefined) return <Loading />;
  if (tools.length === 0) {
    return <Empty title="No tools listed yet">Be the first to lend one.</Empty>;
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((tool, i) => (
        <li
          key={`${tool.name}-${i}`}
          className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3"
        >
          <span className="truncate font-medium">{tool.name}</span>
          <Badge>{tool.category}</Badge>
        </li>
      ))}
    </ul>
  );
}
