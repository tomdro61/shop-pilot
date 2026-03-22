import { notFound } from "next/navigation";
import { getCustomer } from "@/lib/actions/customers";
import { CustomerForm } from "@/components/forms/customer-form";

export const metadata = {
  title: "Edit Customer | ShopPilot",
};

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customer = await getCustomer(id);
  if (!customer) notFound();

  return (
    <div className="mx-auto max-w-2xl p-4 lg:p-10">
      <h2 className="mb-6 text-xl font-bold tracking-tight">Edit Customer</h2>
      <div className="bg-card rounded-xl shadow-card p-6 lg:p-8">
        <CustomerForm customer={customer} />
      </div>
    </div>
  );
}
