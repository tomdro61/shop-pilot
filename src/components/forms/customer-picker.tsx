"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Plus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { formatCustomerName, getInitials } from "@/lib/utils/format";
import { TONE_CLASSES } from "@/lib/ui/alert-tone";

type CustomerOption = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
};

interface CustomerPickerProps {
  value: string;
  onChange: (id: string) => void;
  onCustomerChange?: () => void;
  // ID that must always remain in the dropdown even when search filters out
  // its row — the customer being edited or pre-selected via query param.
  pinnedCustomerId?: string;
  // Initial customer object so the selected card renders without an extra
  // round-trip when editing or arriving from a deep link.
  initialCustomer?: CustomerOption | null;
}

export function CustomerPicker({
  value,
  onChange,
  onCustomerChange,
  pinnedCustomerId,
  initialCustomer,
}: CustomerPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState<CustomerOption[]>(
    initialCustomer ? [initialCustomer] : []
  );

  useEffect(() => {
    if (initialCustomer) {
      setCustomers((prev) =>
        prev.some((c) => c.id === initialCustomer.id) ? prev : [initialCustomer, ...prev]
      );
    }
  }, [initialCustomer]);

  useEffect(() => {
    if (!pinnedCustomerId || initialCustomer) return;
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, first_name, last_name, phone")
        .eq("id", pinnedCustomerId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        // PGRST116 (no row) is expected when the pinned id was deleted —
        // stay quiet. Anything else is real (RLS, network) and worth logging
        // so a duplicate-customer rabbit hole isn't silent.
        if (error.code !== "PGRST116") {
          console.error("[CustomerPicker] pinned customer fetch failed:", error);
        }
        return;
      }
      if (data) {
        setCustomers((prev) =>
          prev.some((c) => c.id === data.id) ? prev : [data, ...prev]
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pinnedCustomerId, initialCustomer]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const supabase = createClient();
      let query = supabase
        .from("customers")
        .select("id, first_name, last_name, phone")
        .order("last_name")
        .limit(20)
        .abortSignal(controller.signal);

      if (search) {
        const words = search.trim().split(/\s+/);
        if (words.length > 1) {
          query = query
            .ilike("first_name", `%${words[0]}%`)
            .ilike("last_name", `%${words.slice(1).join(" ")}%`);
        } else {
          query = query.or(
            `first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone.ilike.%${search}%`
          );
        }
      }

      const { data, error } = await query;
      // Aborts already returned above. Any error here is a real failure
      // (RLS, network, schema) — surface it so the manager doesn't see an
      // empty list and create a duplicate customer.
      if (controller.signal.aborted) return;
      if (error) {
        console.error("[CustomerPicker] search failed:", error);
        toast.error("Couldn't load customers — try again before adding a new one.");
        return;
      }
      if (data) {
        setCustomers((prev) => {
          const pinId = pinnedCustomerId;
          const pinnedInResults = !pinId || data.some((c) => c.id === pinId);
          if (pinnedInResults) return data;
          const existing = prev.find((c) => c.id === pinId);
          return existing ? [existing, ...data] : data;
        });
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, pinnedCustomerId]);

  const selected = customers.find((c) => c.id === value);

  return (
    <section className="bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-stone-200 dark:border-stone-800">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`w-7 h-7 rounded-md grid place-items-center border flex-none ${TONE_CLASSES.violet.tile}`}
          >
            <UserPlus className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-sm font-semibold tracking-tight text-stone-900 dark:text-stone-50">
            Customer
          </h3>
        </div>
        <Link
          href="/customers/new"
          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
        >
          <Plus className="h-3 w-3" />
          New customer
        </Link>
      </header>
      <div className="p-5">
        {selected ? (
          <div className="flex items-center gap-3 rounded-md border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/40 px-3 py-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              {getInitials(formatCustomerName(selected))}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-stone-900 dark:text-stone-50 truncate">
                {formatCustomerName(selected)}
              </div>
              {selected.phone && (
                <div className="text-xs text-stone-500 dark:text-stone-400 truncate">
                  {selected.phone}
                </div>
              )}
            </div>
            <button
              type="button"
              aria-label="Change customer"
              onClick={() => {
                onChange("");
                onCustomerChange?.();
                setOpen(true);
              }}
              className="text-xs font-medium text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 transition-colors"
            >
              Change
            </button>
          </div>
        ) : (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className="w-full justify-between h-10 text-muted-foreground"
              >
                Search by name or phone…
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Search by name or phone..."
                  value={search}
                  onValueChange={setSearch}
                />
                <CommandList>
                  <CommandEmpty>No customers found.</CommandEmpty>
                  <CommandGroup>
                    {customers.map((customer) => (
                      <CommandItem
                        key={customer.id}
                        value={customer.id}
                        onSelect={() => {
                          onChange(customer.id);
                          onCustomerChange?.();
                          setOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            customer.id === value ? "opacity-100" : "opacity-0"
                          )}
                        />
                        {formatCustomerName(customer)}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </section>
  );
}
