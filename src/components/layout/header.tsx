"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { signOut } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, Wrench, Sun, Moon, Monitor, Settings, BarChart3, Receipt, MessageCircle, FileQuestion, Search, ClipboardCheck } from "lucide-react";
import type { User } from "@/types";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/customers": "Customers",
  "/jobs": "Jobs",
  "/inspections": "Inspections",
  "/settings": "Settings",
  "/team": "Team",
  "/presets": "Job Presets",
  "/settings/rates": "Rates & Fees",
  "/settings/categories": "Job Categories",
  "/parking": "Airport Parking",
  "/reports": "Reports",
  "/quick-pay": "Quick Pay",
  "/invoices": "Invoices",
  "/chat": "AI Assistant",
  "/quote-requests": "Quotes",
  "/inbox": "Inbox",
  "/dvi": "DVI",
};

function getPageTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  if (pathname.startsWith("/customers")) return "Customers";
  if (pathname.startsWith("/jobs")) return "Jobs";
  if (pathname.startsWith("/inspections")) return "Inspections";
  if (pathname.startsWith("/settings/rates")) return "Rates & Fees";
  if (pathname.startsWith("/settings/categories")) return "Job Categories";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/team")) return "Team";
  if (pathname.startsWith("/presets")) return "Job Presets";
  if (pathname.startsWith("/parking")) return "Airport Parking";
  if (pathname.startsWith("/reports")) return "Reports";
  if (pathname.startsWith("/quick-pay")) return "Quick Pay";
  if (pathname.startsWith("/invoices")) return "Invoices";
  if (pathname.startsWith("/quote-requests")) return "Quotes";
  if (pathname.startsWith("/chat")) return "AI Assistant";
  if (pathname.startsWith("/dvi")) return "DVI";
  return "ShopPilot";
}

export function Header({ user }: { user: User | null }) {
  const pathname = usePathname();
  const title = getPageTitle(pathname);
  const { theme, setTheme } = useTheme();

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "SP";

  return (
    <header className="sticky top-0 z-30 border-b border-stone-200 dark:border-stone-800 bg-white/80 dark:bg-stone-900/80 backdrop-blur-xl pt-[env(safe-area-inset-top)]">
      <div className="flex h-14 items-center justify-between px-4 lg:px-8">
      <div className="flex items-center gap-2.5 lg:hidden">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
          <Wrench className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
        <span className="text-sm font-semibold tracking-tight">Broadway Motors</span>
      </div>
      <h1 className="text-sm font-semibold tracking-tight lg:text-lg text-stone-900 dark:text-stone-50">{title}</h1>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-md">
            <Avatar className="h-7 w-7">
              <AvatarFallback className="bg-blue-50 dark:bg-blue-950 text-[10px] font-semibold text-blue-700 dark:text-blue-400">
                {initials}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {user && (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              {user.name}
            </div>
          )}
          {user?.role !== "tech" && (
            <>
              <DropdownMenuSeparator className="lg:hidden" />
              <DropdownMenuLabel className="lg:hidden text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Quick Access
              </DropdownMenuLabel>
              <DropdownMenuItem className="lg:hidden" asChild>
                <Link href="/dvi">
                  <Search className="mr-2 h-4 w-4" />
                  DVI
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem className="lg:hidden" asChild>
                <Link href="/inspections">
                  <ClipboardCheck className="mr-2 h-4 w-4" />
                  Inspections
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem className="lg:hidden" asChild>
                <Link href="/quote-requests">
                  <FileQuestion className="mr-2 h-4 w-4" />
                  Quotes
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Admin & Utilities
              </DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link href="/reports">
                  <BarChart3 className="mr-2 h-4 w-4" />
                  Reports
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/invoices">
                  <Receipt className="mr-2 h-4 w-4" />
                  Invoices
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/chat">
                  <MessageCircle className="mr-2 h-4 w-4" />
                  AI Assistant
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Theme
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setTheme("light")}>
            <Sun className="mr-2 h-4 w-4" />
            Light
            {theme === "light" && <span className="ml-auto text-xs text-primary">✓</span>}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("dark")}>
            <Moon className="mr-2 h-4 w-4" />
            Dark
            {theme === "dark" && <span className="ml-auto text-xs text-primary">✓</span>}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("system")}>
            <Monitor className="mr-2 h-4 w-4" />
            System
            {theme === "system" && <span className="ml-auto text-xs text-primary">✓</span>}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => signOut()}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      </div>
    </header>
  );
}
