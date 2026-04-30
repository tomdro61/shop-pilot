import { Wrench } from "lucide-react";

export default function DviLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-svh bg-background">
      <header className="border-b border-stone-200 dark:border-stone-800 bg-card">
        <div className="mx-auto max-w-2xl px-4 py-4 flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-md grid place-items-center border bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900 flex-none">
            <Wrench className="h-4 w-4" />
          </span>
          <div>
            <h1 className="text-base font-bold tracking-tight text-stone-900 dark:text-stone-50">
              Broadway Motors
            </h1>
            <p className="text-xs text-stone-500 dark:text-stone-400">Revere, MA</p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-2xl p-4">{children}</main>
    </div>
  );
}
