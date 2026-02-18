import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
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
    <div className="space-y-2">
      {customers.map((customer) => (
        <Link key={customer.id} href={`/customers/${customer.id}`}>
          <Card className="transition-colors hover:bg-accent">
            <CardContent className="flex items-center justify-between p-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {customer.first_name} {customer.last_name}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  {customer.phone && <span>{formatPhone(customer.phone)}</span>}
                  {customer.email && (
                    <span className="truncate">{customer.email}</span>
                  )}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
