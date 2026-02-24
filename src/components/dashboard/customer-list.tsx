import Link from "next/link";
import { formatPhone } from "@/lib/utils/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight, Users } from "lucide-react";
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

export function CustomerList({ customers, totalCount }: CustomerListProps) {
  if (customers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Users className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="mt-3 text-sm font-medium text-muted-foreground">No customers found</p>
        <p className="mt-1 text-xs text-muted-foreground/70">Try adjusting your search or add a new customer</p>
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        {/* Table header — hidden on mobile */}
        <div className="hidden md:grid md:grid-cols-[1fr_1fr_1fr_auto] border-b bg-stone-50 dark:bg-stone-800/50 px-5 py-2.5 text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide">
          <span>Name</span>
          <span>Email</span>
          <span>Phone</span>
          <span className="w-16 text-center">Type</span>
        </div>

        {/* Customer count — mobile only */}
        <div className="md:hidden border-b px-5 py-2.5 text-xs font-semibold text-muted-foreground">
          {(totalCount ?? customers.length).toLocaleString()} customers
        </div>

        <div className="divide-y">
          {customers.map((customer) => {
            const initials = `${customer.first_name?.[0] ?? ""}${customer.last_name?.[0] ?? ""}`.toUpperCase();
            return (
              <Link key={customer.id} href={`/customers/${customer.id}`} className="block">
                {/* Desktop: columnar table row */}
                <div className="hidden md:grid md:grid-cols-[1fr_1fr_1fr_auto] items-center px-5 py-3 transition-colors hover:bg-stone-50 dark:hover:bg-stone-800">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950 text-[11px] font-semibold text-blue-700 dark:text-blue-400">
                      {initials}
                    </div>
                    <span className="text-sm font-medium truncate">
                      {customer.first_name} {customer.last_name}
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground truncate pr-4">
                    {customer.email ?? "—"}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {customer.phone ? formatPhone(customer.phone) : "—"}
                  </span>
                  <span className="w-16 flex justify-center">
                    {customer.customer_type === "fleet" ? (
                      <Badge variant="outline" className="bg-violet-50 dark:bg-violet-950 text-violet-700 dark:text-violet-400 text-[10px] py-0">
                        Fleet
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground/50">Retail</span>
                    )}
                  </span>
                </div>

                {/* Mobile: compact stacked row */}
                <div className="flex items-center gap-3 px-4 py-3 md:hidden transition-colors hover:bg-stone-50 dark:hover:bg-stone-800">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950 text-[11px] font-semibold text-blue-700 dark:text-blue-400">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">
                        {customer.first_name} {customer.last_name}
                      </p>
                      {customer.customer_type === "fleet" && (
                        <Badge variant="outline" className="bg-violet-50 dark:bg-violet-950 text-violet-700 dark:text-violet-400 text-[10px] py-0 shrink-0">
                          Fleet
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      {customer.phone && <span>{formatPhone(customer.phone)}</span>}
                      {customer.email && <span className="truncate">{customer.email}</span>}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                </div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
