"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import type { Role } from "@/convex/lib/rbac";

const links = [
  { href: "/app", label: "Browse" },
  { href: "/app/listings", label: "My listings" },
  { href: "/app/requests", label: "My requests" },
  { href: "/app/incoming", label: "Incoming requests" },
];

export function AppNav({ role }: { role?: Role }) {
  const pathname = usePathname();
  const items = role === "admin" ? [...links, { href: "/app/admin", label: "Admin" }] : links;
  return (
    <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          <span className="text-emerald-600">●</span> LendLoop
        </Link>
        <nav className="-mx-1 flex flex-1 gap-1 overflow-x-auto text-sm">
          {items.map((item) => {
            const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 transition ${
                  active ? "bg-emerald-50 font-medium text-emerald-800" : "text-stone-600 hover:bg-stone-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <UserButton />
      </div>
    </header>
  );
}
