"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Inbox, Users, Wrench, BarChart3, MessageCircle, ClipboardCheck, Settings, CircleDollarSign, PlaneLanding, Receipt, FileQuestion, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  techVisible?: boolean; // If true, techs can see this item
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/inbox", label: "Inbox", icon: Inbox },
    ],
  },
  {
    label: "Work",
    items: [
      { href: "/jobs", label: "Jobs", icon: Wrench },
      { href: "/customers", label: "Customers", icon: Users },
      { href: "/dvi", label: "DVI", icon: Search, techVisible: true },
      { href: "/inspections", label: "Inspections", icon: ClipboardCheck },
      { href: "/parking", label: "Parking", icon: PlaneLanding, techVisible: true },
      { href: "/quick-pay", label: "Quick Pay", icon: CircleDollarSign },
      { href: "/invoices", label: "Invoices", icon: Receipt },
      { href: "/quote-requests", label: "Quotes", icon: FileQuestion },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/reports", label: "Reports", icon: BarChart3 },
      { href: "/settings", label: "Settings", icon: Settings },
      { href: "/chat", label: "AI Assistant", icon: MessageCircle },
    ],
  },
];

export function Sidebar({ badgeCounts, userRole }: { badgeCounts?: Record<string, number>; userRole?: string }) {
  const pathname = usePathname();
  const isTech = userRole === "tech";

  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: isTech ? group.items.filter((i) => i.techVisible) : group.items,
    }))
    .filter((group) => group.items.length > 0);

  return (
    <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:border-r lg:border-sidebar-border lg:bg-sidebar">
      <div className="flex h-16 items-center border-b border-sidebar-border px-6">
        <Link href={isTech ? "/dvi" : "/dashboard"} className="flex items-center gap-2.5">
          <Wrench className="h-5 w-5 text-blue-500 dark:text-stone-300" />
          <div className="flex flex-col">
            <span className="text-base font-semibold tracking-tight leading-tight text-stone-50">ShopPilot</span>
            <span className="text-[10px] text-stone-500 leading-tight">Serving Revere Since 1946</span>
          </div>
        </Link>
      </div>

      <nav className="flex flex-1 flex-col px-3 pt-4">
        {visibleGroups.map((group, idx) => (
          <div key={group.label} className={idx > 0 ? "mt-5" : undefined}>
            <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-stone-500">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavItemLink key={item.href} item={item} pathname={pathname} badge={badgeCounts?.[item.href]} />
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}

function NavItemLink({
  item,
  pathname,
  badge,
}: {
  item: NavItem;
  pathname: string;
  badge?: number;
}) {
  const settingsRoutes = ["/settings", "/team", "/presets", "/settings/catalog"];
  const isActive =
    pathname === item.href ||
    (item.href !== "/dashboard" && pathname.startsWith(item.href)) ||
    (item.href === "/settings" && settingsRoutes.some((r) => pathname.startsWith(r)));

  return (
    <Link
      href={item.href}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
        isActive
          ? "bg-blue-600 dark:bg-stone-700 text-white font-semibold"
          : "text-stone-400 hover:bg-sidebar-accent hover:text-stone-100"
      )}
    >
      <item.icon className={cn("h-[18px] w-[18px] shrink-0", isActive ? "text-white" : "text-stone-500")} />
      {item.label}
      {badge != null && badge > 0 && (
        <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 dark:bg-stone-200 px-1.5 text-[10px] font-semibold text-white dark:text-stone-900">
          {badge}
        </span>
      )}
    </Link>
  );
}
