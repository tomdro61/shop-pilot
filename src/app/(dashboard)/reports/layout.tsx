export default function ReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-6 pt-4 lg:pt-5 pb-12 space-y-5 lg:space-y-6">
      {children}
    </div>
  );
}
