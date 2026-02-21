import Link from "next/link";
import { formatPhone } from "@/lib/utils/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronRight, Users } from "lucide-react";
import type { Customer } from "@/types";

interface CustomerListProps {
  customers: Customer[];
}

export function CustomerList({ customers }: CustomerListProps) {
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
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b px-5 py-3">
        <CardTitle className="text-sm font-semibold">Customers ({customers.length})</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {customers.map((customer) => {
            const initials = `${customer.first_name?.[0] ?? ""}${customer.last_name?.[0] ?? ""}`.toUpperCase();
            return (
              <Link key={customer.id} href={`/customers/${customer.id}`} className="block">
                <div className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-accent/50">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">
                        {customer.first_name} {customer.last_name}
                      </p>
                      {customer.customer_type === "fleet" && (
                        <Badge variant="outline" className="bg-violet-500/10 text-violet-600 border-violet-500/20 dark:text-violet-400 text-[10px] py-0">
                          Fleet
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      {customer.phone && <span>{formatPhone(customer.phone)}</span>}
                      {customer.email && (
                        <span className="truncate">{customer.email}</span>
                      )}
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
