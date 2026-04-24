import Link from "next/link";
import { CustomerForm } from "@/components/forms/customer-form";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "New Customer | ShopPilot",
};

export default function NewCustomerPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 lg:px-6 pb-12 space-y-4">
      <div className="py-2">
        <Link href="/customers">
          <Button variant="ghost" size="sm" className="-ml-3">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Customers
          </Button>
        </Link>
      </div>
      <div>
        <h1 className="text-[22px] lg:text-[26px] font-semibold tracking-tight text-stone-900 dark:text-stone-50 leading-tight">
          New Customer
        </h1>
        <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
          Name, contact, and customer type.
        </p>
      </div>
      <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm p-5 lg:p-6">
        <CustomerForm />
      </div>
    </div>
  );
}
