import { getReceivablesData } from "@/lib/actions/receivables";
import { ReceivablesReport } from "@/components/dashboard/receivables-report";
import { ReportsNav } from "@/components/dashboard/reports-nav";
import { AlertCircle } from "lucide-react";

export const metadata = {
  title: "Accounts Receivable | ShopPilot",
};

export default async function ReceivablesPage({
  searchParams,
}: {
  searchParams: Promise<{ customerType?: string }>;
}) {
  const { customerType } = await searchParams;
  const data = await getReceivablesData(customerType);

  return (
    <>
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-md grid place-items-center border bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900 flex-none">
          <AlertCircle className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h1 className="text-base lg:text-lg font-bold tracking-tight text-stone-900 dark:text-stone-50">
            Outstanding Receivables
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Aging breakdown of unpaid invoices.
          </p>
        </div>
      </div>
      <ReportsNav />
      <ReceivablesReport data={data} initialCustomerType={customerType || "all"} />
    </>
  );
}
