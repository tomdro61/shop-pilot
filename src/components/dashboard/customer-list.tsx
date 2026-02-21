import Link from "next/link";
import { formatPhone } from "@/lib/utils/format";
import { ChevronRight } from "lucide-react";
import type { Customer } from "@/types";

interface CustomerListProps {
  customers: Customer[];
}

export function CustomerList({ customers }: CustomerListProps) {
  if (customers.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        No customers found
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {customers.map((customer) => (
        <Link key={customer.id} href={`/customers/${customer.id}`}>
          <div className="flex items-center justify-between rounded-md border px-3 py-2.5 transition-colors hover:bg-accent">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {customer.first_name} {customer.last_name}
              </p>
              <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                {customer.phone && <span>{formatPhone(customer.phone)}</span>}
                {customer.email && (
                  <span className="truncate">{customer.email}</span>
                )}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
        </Link>
      ))}
    </div>
  );
}
