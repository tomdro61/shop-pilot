import Link from "next/link";
import { getReceivablesData } from "@/lib/actions/receivables";
import { ReceivablesReport } from "@/components/dashboard/receivables-report";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Accounts Receivable | ShopPilot",
};

export default async function ReceivablesPage() {
  const data = await getReceivablesData();

  return (
    <div className="p-4 lg:p-10">
      <div className="mb-6">
        <Link href="/reports">
          <Button variant="ghost" size="sm" className="mb-2">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Reports
          </Button>
        </Link>
        <h2 className="text-xl font-bold tracking-tight">Accounts Receivable</h2>
        <p className="text-sm text-muted-foreground">
          Outstanding balances, aging buckets, and fleet accounts
        </p>
      </div>

      <ReceivablesReport data={data} />
    </div>
  );
}
