"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Overview", href: "/reports" },
  { label: "Revenue", href: "/reports/revenue" },
  { label: "Trends", href: "/reports/trends" },
  { label: "Service Mix", href: "/reports/service-mix" },
  { label: "Techs", href: "/reports/tech" },
  { label: "Customers", href: "/reports/customers" },
  { label: "AR", href: "/reports/receivables" },
  { label: "Income", href: "/reports/income" },
  { label: "Tax", href: "/reports/tax" },
] as const;

export function ReportsNav() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/reports") return pathname === "/reports";
    return pathname.startsWith(href);
  }

  return (
    <div className="mb-6 -mx-4 px-4 overflow-x-auto lg:mx-0 lg:px-0">
      <div className="flex gap-1 border-b border-stone-300 dark:border-stone-800 min-w-max">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px",
              isActive(tab.href)
                ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-500"
                : "border-transparent text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
