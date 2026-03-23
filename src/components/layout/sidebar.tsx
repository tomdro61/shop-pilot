"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Wrench, BarChart3, MessageCircle, ClipboardCheck, Settings, CircleDollarSign, PlaneLanding, Receipt, FileQuestion } from "lucide-react";
import { cn } from "@/lib/utils";

const mainNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs", icon: Wrench },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/quick-pay", label: "Quick Pay", icon: CircleDollarSign },
  { href: "/invoices", label: "Invoices", icon: Receipt },
  { href: "/inspections", label: "Inspections", icon: ClipboardCheck },
  { href: "/parking", label: "Parking", icon: PlaneLanding },
  { href: "/quote-requests", label: "Quotes", icon: FileQuestion },
];

const secondaryNav = [
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/chat", label: "AI Assistant", icon: MessageCircle },
];

export function Sidebar({ badgeCounts }: { badgeCounts?: Record<string, number> }) {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:border-r lg:border-stone-800 lg:bg-stone-900">
      <div className="flex h-16 items-center border-b border-stone-800 px-6">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <Wrench className="h-5 w-5 text-blue-500" />
          <div className="flex flex-col">
            <span className="text-base font-semibold tracking-tight leading-tight text-stone-50">ShopPilot</span>
            <span className="text-[10px] text-stone-500 leading-tight">Serving Revere Since 1946</span>
          </div>
        </Link>
      </div>

      <nav className="flex flex-1 flex-col px-3 pt-4">
        <div className="space-y-0.5">
          {mainNav.map((item) => (
            <NavItem key={item.href} item={item} pathname={pathname} badge={badgeCounts?.[item.href]} />
          ))}
        </div>

        <div className="my-3 h-px bg-stone-800" />

        <div className="space-y-0.5">
          {secondaryNav.map((item) => (
            <NavItem key={item.href} item={item} pathname={pathname} />
          ))}
        </div>
      </nav>
    </aside>
  );
}

function NavItem({
  item,
  pathname,
  badge,
}: {
  item: { href: string; label: string; icon: React.ComponentType<{ className?: string }> };
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
          ? "bg-blue-600 text-white font-semibold"
          : "text-stone-400 hover:bg-stone-800 hover:text-stone-100"
      )}
    >
      <item.icon className={cn("h-[18px] w-[18px] shrink-0", isActive ? "text-white" : "text-stone-500")} />
      {item.label}
      {badge != null && badge > 0 && (
        <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-semibold text-white">
          {badge}
        </span>
      )}
    </Link>
  );
}
