import { ReportsNav } from "@/components/dashboard/reports-nav";

export default function ReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-6 pb-12 space-y-5 lg:space-y-6">
      <div className="py-2">
        <h1 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-50">
          Reports
        </h1>
        <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">
          Business analytics and performance tracking
        </p>
      </div>
      <ReportsNav />
      {children}
    </div>
  );
}
