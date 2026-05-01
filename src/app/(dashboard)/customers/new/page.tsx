import Link from "next/link";
import { CustomerForm } from "@/components/forms/customer-form";
import { Button } from "@/components/ui/button";
import { ArrowLeft, UserPlus } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";

export const metadata = {
  title: "New Customer | ShopPilot",
};

export default function NewCustomerPage() {
  return (
    <PageShell width="narrow">
      <div>
        <Link href="/customers">
          <Button variant="ghost" size="sm" className="-ml-3">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Customers
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-md grid place-items-center border bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900 flex-none">
          <UserPlus className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h1 className="text-base lg:text-lg font-bold tracking-tight text-stone-900 dark:text-stone-50">
            New Customer
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Name, contact, and customer type.
          </p>
        </div>
      </div>

      <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card p-5 lg:p-6">
        <CustomerForm />
      </div>
    </PageShell>
  );
}
