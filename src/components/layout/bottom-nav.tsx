"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Inbox, Users, Wrench, PlaneLanding, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  techVisible?: boolean;
}

const allNavItems: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/jobs", label: "Jobs", icon: Wrench },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/parking", label: "Parking", icon: PlaneLanding, techVisible: true },
  { href: "/dvi", label: "DVI", icon: Search, techVisible: true },
];

export function BottomNav({ userRole }: { userRole?: string }) {
  const pathname = usePathname();
  const isTech = userRole === "tech";

  const navItems = isTech
    ? allNavItems.filter((item) => item.techVisible)
    : allNavItems.filter((item) => item.href !== "/dvi"); // managers see original 5 items on mobile

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-stone-300 dark:border-stone-800 bg-white dark:bg-stone-900 lg:hidden">
      <div className="flex h-14 items-center justify-around">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex flex-col items-center gap-0.5 px-3 py-1 text-[10px] transition-colors",
                isActive
                  ? "text-blue-600 dark:text-blue-500 font-semibold"
                  : "text-stone-400 dark:text-stone-500"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
              {isActive && (
                <div className="absolute -top-1 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-blue-600 dark:bg-blue-500" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
