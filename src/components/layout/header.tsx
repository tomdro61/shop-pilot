"use client";

import { usePathname } from "next/navigation";
import { signOut } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, Wrench } from "lucide-react";
import type { User } from "@/types";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/customers": "Customers",
  "/jobs": "Jobs",
  "/inspections": "Inspections",
  "/reports": "Reports",
  "/chat": "AI Assistant",
};

function getPageTitle(pathname: string): string {
  // Check exact matches first
  if (pageTitles[pathname]) return pageTitles[pathname];

  // Check prefix matches
  if (pathname.startsWith("/customers")) return "Customers";
  if (pathname.startsWith("/jobs")) return "Jobs";
  if (pathname.startsWith("/inspections")) return "Inspections";
  if (pathname.startsWith("/reports")) return "Reports";
  if (pathname.startsWith("/chat")) return "AI Assistant";

  return "ShopPilot";
}

export function Header({ user }: { user: User | null }) {
  const pathname = usePathname();
  const title = getPageTitle(pathname);

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
      <div className="flex items-center gap-2 lg:hidden">
        <Wrench className="h-5 w-5 text-primary" />
      </div>
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {user && (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              {user.name}
            </div>
          )}
          <DropdownMenuItem onClick={() => signOut()}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
