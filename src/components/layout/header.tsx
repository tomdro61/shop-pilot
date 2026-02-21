"use client";

import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { signOut } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, Wrench, Sun, Moon, Monitor } from "lucide-react";
import type { User } from "@/types";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/customers": "Customers",
  "/jobs": "Jobs",
  "/inspections": "Inspections",
  "/presets": "Job Presets",
  "/reports": "Reports",
  "/chat": "AI Assistant",
};

function getPageTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  if (pathname.startsWith("/customers")) return "Customers";
  if (pathname.startsWith("/jobs")) return "Jobs";
  if (pathname.startsWith("/inspections")) return "Inspections";
  if (pathname.startsWith("/presets")) return "Job Presets";
  if (pathname.startsWith("/reports")) return "Reports";
  if (pathname.startsWith("/chat")) return "AI Assistant";
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
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/80 backdrop-blur-xl px-4 lg:px-6">
      <div className="flex items-center gap-2.5 lg:hidden">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
          <Wrench className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
        <span className="text-sm font-semibold tracking-tight">Broadway Motors</span>
      </div>
      <h1 className="text-sm font-semibold tracking-tight lg:text-base">{title}</h1>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full">
            <Avatar className="h-7 w-7">
              <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
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
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Theme
          </div>
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
    </header>
  );
}
