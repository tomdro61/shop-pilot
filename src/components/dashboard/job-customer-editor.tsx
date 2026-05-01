"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { updateJobFields } from "@/lib/actions/jobs";
import { searchCustomersForPicker } from "@/lib/actions/customers";
import { formatCustomerName, formatPhone } from "@/lib/utils/format";
import { Pencil } from "lucide-react";

type CustomerOption = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
};

interface JobCustomerEditorProps {
  jobId: string;
  currentCustomer: CustomerOption | null;
  hasVehicle: boolean;
}

export function JobCustomerEditor({ jobId, currentCustomer, hasVehicle }: JobCustomerEditorProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [pending, setPending] = useState<CustomerOption | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(async () => {
      const results = await searchCustomersForPicker(search, {
        includeIds: currentCustomer ? [currentCustomer.id] : [],
      });
      setCustomers(results);
    }, 150);
    return () => clearTimeout(timer);
  }, [search, open, currentCustomer]);

  function handleSelect(customer: CustomerOption) {
    setOpen(false);
    if (customer.id === currentCustomer?.id) return;
    setPending(customer);
  }

  async function confirm() {
    if (!pending) return;
    setSaving(true);
    const result = await updateJobFields(jobId, {
      customer_id: pending.id,
      vehicle_id: null,
    });
    setSaving(false);
    if ("error" in result && result.error) {
      toast.error(typeof result.error === "string" ? result.error : "Update failed");
      return;
    }
    toast.success(`Customer changed to ${formatCustomerName(pending)}`);
    setPending(null);
    router.refresh();
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="Change customer"
            className="inline-flex items-center justify-center w-5 h-5 rounded text-stone-400 hover:text-stone-700 hover:bg-stone-100 dark:hover:text-stone-200 dark:hover:bg-stone-800 transition-colors"
          >
            <Pencil className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[320px]" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search by name or phone…"
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>No customers match.</CommandEmpty>
              <CommandGroup>
                {customers.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={c.id}
                    onSelect={() => handleSelect(c)}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="truncate">
                      {formatCustomerName(c)}
                      {c.id === currentCustomer?.id && (
                        <span className="ml-1.5 text-[10px] uppercase tracking-wider text-blue-600 dark:text-blue-400">
                          current
                        </span>
                      )}
                    </span>
                    {c.phone && (
                      <span className="font-mono tabular-nums text-[11px] text-stone-500 shrink-0">
                        {formatPhone(c.phone)}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <AlertDialog open={!!pending} onOpenChange={(v) => !v && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change customer?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending && (
                <>
                  This job will be reassigned to <strong>{formatCustomerName(pending)}</strong>.
                  {hasVehicle && " The vehicle association will be cleared, since vehicles belong to the previous customer."}
                  {" Existing line items, estimates, and invoices stay attached to the job."}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirm} disabled={saving}>
              {saving ? "Changing…" : "Change customer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
