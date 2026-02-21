export default function ApproveEstimateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-svh bg-background">
      <header className="border-b bg-card px-4 py-4">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-lg font-bold">Broadway Motors</h1>
          <p className="text-sm text-muted-foreground">
            Revere, MA
          </p>
        </div>
      </header>
      <main className="mx-auto max-w-2xl p-4">{children}</main>
    </div>
  );
}
