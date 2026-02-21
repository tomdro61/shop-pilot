"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Wrench, ClipboardCheck, CircleDollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/jobs", label: "Jobs", icon: Wrench },
  { href: "/inspections", label: "Inspect", icon: ClipboardCheck },
  { href: "/quick-pay", label: "Pay", icon: CircleDollarSign },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] lg:hidden">
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
                  ? "text-primary font-semibold"
                  : "text-muted-foreground"
              )}
            >
              <item.icon className={cn("h-5 w-5", isActive && "icon-filled")} />
              <span>{item.label}</span>
              {isActive && (
                <div className="absolute -top-1 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
