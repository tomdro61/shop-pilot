"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Wrench, BarChart3, MessageCircle, ClipboardCheck, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const mainNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs", icon: Wrench },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/inspections", label: "Inspections", icon: ClipboardCheck },
];

const secondaryNav = [
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/chat", label: "AI Assistant", icon: MessageCircle },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex lg:w-56 lg:flex-col lg:border-r lg:bg-sidebar">
      <div className="flex h-14 items-center border-b px-5">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <Wrench className="icon-filled h-5 w-5 text-primary" />
          <div className="flex flex-col">
            <span className="text-[15px] font-semibold tracking-tight leading-tight">ShopPilot</span>
            <span className="text-[10px] text-muted-foreground leading-tight">Serving Revere Since 1946</span>
          </div>
        </Link>
      </div>

      <nav className="flex flex-1 flex-col px-3 pt-4">
        <div className="space-y-0.5">
          {mainNav.map((item) => (
            <NavItem key={item.href} item={item} pathname={pathname} />
          ))}
        </div>

        <div className="my-3 h-px bg-border" />

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
}: {
  item: { href: string; label: string; icon: React.ComponentType<{ className?: string }> };
  pathname: string;
}) {
  const settingsRoutes = ["/settings", "/team", "/presets"];
  const isActive =
    pathname === item.href ||
    (item.href !== "/dashboard" && pathname.startsWith(item.href)) ||
    (item.href === "/settings" && settingsRoutes.some((r) => pathname.startsWith(r)));

  return (
    <Link
      href={item.href}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all duration-150",
        isActive
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      {isActive && (
        <div className="absolute -left-3 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
      )}
      <item.icon className={cn("h-4 w-4 shrink-0", isActive && "icon-filled")} />
      {item.label}
    </Link>
  );
}
