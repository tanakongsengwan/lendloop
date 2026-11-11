"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppNav } from "@/components/AppNav";
import { Loading } from "@/components/ui";

/** Ensures a users row exists for the Clerk identity before rendering. */
function useStoreUser() {
  const { isAuthenticated } = useConvexAuth();
  const store = useMutation(api.users.store);
  const [stored, setStored] = useState(false);
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    store().then(() => !cancelled && setStored(true));
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, store]);
  return { ready: isAuthenticated && stored };
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const { ready } = useStoreUser();
  const me = useQuery(api.users.me, ready ? {} : "skip");

  return (
    <div className="min-h-screen">
      <AppNav role={me?.role} />
      <main className="mx-auto max-w-6xl px-5 py-8">
        {ready && me ? children : <Loading />}
      </main>
    </div>
  );
}
