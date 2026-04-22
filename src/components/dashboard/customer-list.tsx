import Link from "next/link";
import { formatPhone, formatCustomerName } from "@/lib/utils/format";
import { CUSTOMER_TYPE_COLORS } from "@/lib/constants";

interface CustomerListItem {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  customer_type: string | null;
}

interface CustomerListProps {
  customers: CustomerListItem[];
  totalCount?: number;
}

function TypeChip({ type }: { type: string | null }) {
  if (!type || type === "retail") {
    return <span className="text-xs text-stone-400 dark:text-stone-500">Retail</span>;
  }
  const colors = CUSTOMER_TYPE_COLORS[type] ?? "bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300";
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium capitalize ${colors}`}>
      {type}
    </span>
  );
}

export function CustomerList({ customers, totalCount }: CustomerListProps) {
  if (customers.length === 0) {
    return (
      <div className="border border-stone-200 dark:border-stone-800 bg-card py-12 text-center">
        <p className="text-sm font-medium text-stone-500 dark:text-stone-400">No customers found</p>
        <p className="mt-1 text-xs text-stone-400 dark:text-stone-500">Try adjusting your search or add a new customer</p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop: dense table */}
      <div className="hidden lg:block border border-stone-200 dark:border-stone-800 bg-card">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/40">
              <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">Name</th>
              <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">Email</th>
              <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">Phone</th>
              <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 w-24">Type</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr
                key={customer.id}
                className="border-b border-stone-200 dark:border-stone-800 last:border-b-0 hover:bg-stone-50 dark:hover:bg-stone-800/40"
              >
                <td className="px-3 py-2">
                  <Link href={`/customers/${customer.id}`} className="text-sm font-medium text-stone-900 dark:text-stone-50 hover:text-blue-600 dark:hover:text-blue-400 block">
                    {formatCustomerName(customer)}
                  </Link>
                </td>
                <td className="px-3 py-2 text-sm text-stone-600 dark:text-stone-400 truncate max-w-[280px]">
                  {customer.email ?? "—"}
                </td>
                <td className="px-3 py-2 font-mono tabular-nums text-xs text-stone-600 dark:text-stone-400">
                  {customer.phone ? formatPhone(customer.phone) : "—"}
                </td>
                <td className="px-3 py-2">
                  <TypeChip type={customer.customer_type} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: dense stacked rows */}
      <div className="lg:hidden border border-stone-200 dark:border-stone-800 bg-card divide-y divide-stone-200 dark:divide-stone-800">
        <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 bg-stone-50 dark:bg-stone-900/40">
          {(totalCount ?? customers.length).toLocaleString()} customers
        </div>
        {customers.map((customer) => (
          <Link
            key={customer.id}
            href={`/customers/${customer.id}`}
            className="block px-3 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-800/40 transition-colors"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-stone-900 dark:text-stone-50 truncate">
                {formatCustomerName(customer)}
              </p>
              <TypeChip type={customer.customer_type} />
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-stone-500 dark:text-stone-400">
              {customer.phone && (
                <span className="font-mono tabular-nums">{formatPhone(customer.phone)}</span>
              )}
              {customer.phone && customer.email && <span className="text-stone-300 dark:text-stone-700">·</span>}
              {customer.email && <span className="truncate">{customer.email}</span>}
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
