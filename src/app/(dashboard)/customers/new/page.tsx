import { CustomerForm } from "@/components/forms/customer-form";

export const metadata = {
  title: "New Customer | ShopPilot",
};

export default function NewCustomerPage() {
  return (
    <div className="mx-auto max-w-2xl p-4 lg:p-6">
      <h2 className="mb-6 text-xl font-semibold">New Customer</h2>
      <CustomerForm />
    </div>
  );
}
