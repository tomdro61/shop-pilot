import { getCurrentUser } from "@/lib/actions/auth";
import { signOut } from "@/lib/actions/auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export default async function TechLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "tech") redirect("/dashboard");

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-50 border-b bg-card px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-stone-900 dark:text-stone-50">
              Broadway Motors
            </h1>
            <p className="text-xs text-muted-foreground">{user.name}</p>
          </div>
          <form action={signOut}>
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              <LogOut className="mr-1.5 h-3.5 w-3.5" />
              Sign Out
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 p-4">
        {children}
      </main>
    </div>
  );
}
