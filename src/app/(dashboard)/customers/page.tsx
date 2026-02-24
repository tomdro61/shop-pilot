import { Suspense } from "react";
import Link from "next/link";
import { getCustomers } from "@/lib/actions/customers";
import { CustomerSearch } from "@/components/forms/customer-search";
import { CustomerTypeFilter } from "@/components/dashboard/customer-type-filter";
import { CustomerList } from "@/components/dashboard/customer-list";
import { CustomerPagination } from "@/components/dashboard/customer-pagination";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export const metadata = {
  title: "Customers | ShopPilot",
};

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; type?: string; page?: string }>;
}) {
  const { search, type, page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const { data: customers, totalCount } = await getCustomers(search, type, page);

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Suspense>
          <CustomerSearch />
        </Suspense>
        <div className="hidden md:flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
          <span className="font-semibold text-stone-900 dark:text-stone-50">All Customers</span>
          <span>({totalCount.toLocaleString()})</span>
        </div>
        <Suspense>
          <CustomerTypeFilter />
        </Suspense>
        <div className="ml-auto">
          <Link href="/customers/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Add Customer</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </Link>
        </div>
      </div>
      <CustomerList customers={customers} totalCount={totalCount} />
      <CustomerPagination totalCount={totalCount} page={page} pageSize={50} />
    </div>
  );
}
