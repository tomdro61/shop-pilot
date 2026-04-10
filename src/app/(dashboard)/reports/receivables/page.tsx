import { getReceivablesData } from "@/lib/actions/receivables";
import { ReceivablesReport } from "@/components/dashboard/receivables-report";

export const metadata = {
  title: "Accounts Receivable | ShopPilot",
};

export default async function ReceivablesPage() {
  const data = await getReceivablesData();

  return <ReceivablesReport data={data} />;
}
