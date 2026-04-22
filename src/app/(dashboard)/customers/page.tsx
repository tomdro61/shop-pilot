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
    <div className="p-4 lg:p-6 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Suspense>
          <CustomerSearch />
        </Suspense>
        <Suspense>
          <CustomerTypeFilter />
        </Suspense>
        <span className="hidden md:inline text-xs text-stone-500 dark:text-stone-400 font-mono tabular-nums">
          {totalCount.toLocaleString()}
        </span>
        <Link href="/customers/new" className="ml-auto">
          <Button size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Add Customer</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </Link>
      </div>
      <CustomerList customers={customers} totalCount={totalCount} />
      <CustomerPagination totalCount={totalCount} page={page} pageSize={50} />
    </div>
  );
}
