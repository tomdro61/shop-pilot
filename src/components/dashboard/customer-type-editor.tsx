"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updateCustomerFields } from "@/lib/actions/customers";
import { CUSTOMER_TYPE_COLORS } from "@/lib/constants";
import { Pencil } from "lucide-react";

type CustomerType = "retail" | "fleet" | "parking";

const TYPE_CONFIG: Record<CustomerType, { colors: string; label: (account?: string | null) => string }> = {
  retail: {
    colors: "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300",
    label: () => "Retail",
  },
  fleet: {
    colors: CUSTOMER_TYPE_COLORS.fleet,
    label: (account) => (account ? `Fleet · ${account}` : "Fleet"),
  },
  parking: {
    colors: CUSTOMER_TYPE_COLORS.parking,
    label: () => "Parking",
  },
};

interface CustomerTypeEditorProps {
  customerId: string;
  currentType: CustomerType;
  fleetAccount: string | null;
}

export function CustomerTypeEditor({ customerId, currentType, fleetAccount }: CustomerTypeEditorProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<CustomerType>(currentType);
  const [account, setAccount] = useState(fleetAccount ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    const next = {
      customer_type: type,
      fleet_account: type === "fleet" ? (account.trim() || null) : null,
    };
    if (next.customer_type === currentType && next.fleet_account === fleetAccount) {
      setOpen(false);
      return;
    }
    setSaving(true);
    const result = await updateCustomerFields(customerId, next);
    setSaving(false);
    if ("error" in result && result.error) {
      toast.error(typeof result.error === "string" ? result.error : "Update failed");
      return;
    }
    toast.success("Type saved");
    setOpen(false);
    router.refresh();
  }

  const activeConfig = TYPE_CONFIG[currentType];

  return (
    <Popover open={open} onOpenChange={(o) => {
      setOpen(o);
      if (o) {
        setType(currentType);
        setAccount(fleetAccount ?? "");
      }
    }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`group inline-flex items-center gap-1.5 h-[22px] px-2 rounded-full text-[11px] font-medium ${activeConfig.colors} hover:opacity-80 transition-opacity`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
          {activeConfig.label(fleetAccount)}
          <Pencil className="h-2.5 w-2.5 opacity-50 group-hover:opacity-100 transition-opacity" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-3" align="start">
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
            Customer type
          </div>
          <div className="flex items-center gap-1 p-0.5 rounded-md bg-stone-100 dark:bg-stone-800">
            {(["retail", "fleet", "parking"] as CustomerType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                disabled={saving}
                className={`flex-1 inline-flex items-center justify-center h-7 px-2 rounded text-[11px] font-medium capitalize transition-colors ${
                  type === t
                    ? "bg-card text-stone-900 dark:text-stone-50 shadow-sm"
                    : "text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          {type === "fleet" && (
            <div className="space-y-1 pt-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                Fleet account
              </div>
              <Input
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="Account name or number"
                disabled={saving}
                className="h-8 text-sm"
              />
            </div>
          )}
          <div className="flex items-center justify-end gap-1.5 pt-1">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
