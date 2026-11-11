"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppNav } from "@/components/AppNav";
import { Button, Empty, Loading } from "@/components/ui";
import { errorMessage } from "@/lib/errors";

/** Ensures a users row exists for the Clerk identity before rendering. */
function useStoreUser() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const store = useMutation(api.users.store);
  const [stored, setStored] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setStored(false);
      return;
    }
    let cancelled = false;
    setError(null);
    store()
      .then(() => {
        if (!cancelled) setStored(true);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, store]);

  return { ready: isAuthenticated && stored, isLoading, isAuthenticated, error };
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const { ready, isLoading, isAuthenticated, error } = useStoreUser();
  const me = useQuery(api.users.me, ready ? {} : "skip");

  let body: ReactNode;
  if (error) {
    body = (
      <Empty title="Couldn't sync your account">
        <p>{error}</p>
        <p className="mt-2">Refresh the page, or sign out and sign back in.</p>
      </Empty>
    );
  } else if (isLoading || (isAuthenticated && !ready) || (ready && me === undefined)) {
    body = <Loading />;
  } else if (!isAuthenticated) {
    body = (
      <Empty title="Couldn't connect to the data backend">
        <p>
          You are signed in, but Convex did not accept the session. Refresh the
          page, or sign out and sign back in so Clerk can issue a new token.
        </p>
        <Button className="mt-4" onClick={() => window.location.reload()}>
          Refresh
        </Button>
      </Empty>
    );
  } else if (!me) {
    body = (
      <Empty title="Account not found">
        Your session is valid, but we could not load your LendLoop profile.
        Refresh the page, or sign out and sign back in.
      </Empty>
    );
  } else {
    body = children;
  }

  return (
    <div className="min-h-screen">
      <AppNav role={me?.role} />
      <main className="mx-auto max-w-6xl px-5 py-8">{body}</main>
    </div>
  );
}
