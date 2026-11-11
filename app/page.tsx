import Link from "next/link";
import { Suspense } from "react";
import { Show, SignInButton } from "@clerk/nextjs";
import { PublicToolList } from "@/components/PublicToolList";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col px-5 py-10 sm:py-16">
      <header className="flex items-center justify-between">
        <span className="text-lg font-semibold tracking-tight">
          <span className="text-emerald-600">●</span> LendLoop
        </span>
      </header>

      <section className="mt-14 grid gap-10 md:grid-cols-[1.2fr_1fr] md:items-center">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">LendLoop</h1>
          <p className="mt-4 max-w-md text-lg text-stone-600">
            Borrow the drill, lend the ladder. A neighbourhood tool library that
            keeps good tools in use instead of in the shed.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Suspense>
              <Show when="signed-out">
                <SignInButton mode="modal" forceRedirectUrl="/app">
                  <button className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700">
                    Sign in to lend or borrow
                  </button>
                </SignInButton>
              </Show>
              <Show when="signed-in">
                <Link
                  href="/app"
                  className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700"
                >
                  Open LendLoop →
                </Link>
              </Show>
            </Suspense>
          </div>
        </div>
        <ul className="grid grid-cols-3 gap-3 text-center text-sm text-stone-600">
          {[
            ["List", "Share a tool you rarely use"],
            ["Request", "Pick the days you need it"],
            ["Return", "Hand it back, build trust"],
          ].map(([title, text]) => (
            <li key={title} className="rounded-xl border border-stone-200 bg-white p-4">
              <p className="font-semibold text-stone-900">{title}</p>
              <p className="mt-1 text-xs">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-16">
        <h2 className="text-lg font-semibold">Tools in the loop</h2>
        <p className="mt-1 text-sm text-stone-500">
          A public preview. Sign in to see availability and request a tool.
        </p>
        <div className="mt-5">
          <PublicToolList />
        </div>
      </section>
    </main>
  );
}
