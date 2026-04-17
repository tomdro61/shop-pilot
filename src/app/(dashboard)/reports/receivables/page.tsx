import { getReceivablesData } from "@/lib/actions/receivables";
import { ReceivablesReport } from "@/components/dashboard/receivables-report";

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

  return <ReceivablesReport data={data} initialCustomerType={customerType || "all"} />;
}
