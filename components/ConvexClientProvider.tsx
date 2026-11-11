"use client";

import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";
import type { ReactNode } from "react";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = url ? new ConvexReactClient(url) : null;

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!convex) {
    return (
      <div className="mx-auto max-w-xl p-10 text-sm">
        <h1 className="text-lg font-semibold">LendLoop is not configured</h1>
        <p className="mt-2 text-stone-600">
          Set <code>NEXT_PUBLIC_CONVEX_URL</code> (run <code>npx convex dev</code>)
          and the Clerk keys. See <code>.env.example</code> and the README.
        </p>
      </div>
    );
  }
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}
