import { ReportsNav } from "@/components/dashboard/reports-nav";

export default function ReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="p-4 lg:p-10">
      <div className="mb-4">
        <h2 className="text-xl font-bold tracking-tight">Reports</h2>
        <p className="text-sm text-muted-foreground">
          Business analytics and performance tracking
        </p>
      </div>
      <ReportsNav />
      {children}
    </div>
  );
}
