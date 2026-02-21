import { Suspense } from "react";
import Link from "next/link";
import { getCustomers } from "@/lib/actions/customers";
import { CustomerSearch } from "@/components/forms/customer-search";
import { CustomerTypeFilter } from "@/components/dashboard/customer-type-filter";
import { CustomerList } from "@/components/dashboard/customer-list";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export const metadata = {
  title: "Customers | ShopPilot",
};

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; type?: string }>;
}) {
  const { search, type } = await searchParams;
  const customers = await getCustomers(search, type);

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">All Customers</span>
          <span>({customers.length})</span>
        </div>
        <div className="flex flex-1 md:flex-initial items-center gap-2">
          <Suspense>
            <CustomerSearch />
          </Suspense>
          <Suspense>
            <CustomerTypeFilter />
          </Suspense>
        </div>
        <Link href="/customers/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Add Customer</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </Link>
      </div>
      <CustomerList customers={customers} />
    </div>
  );
}
