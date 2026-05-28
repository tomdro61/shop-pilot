"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function InvoiceSourceFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const source = searchParams.get("source") || "all";

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "all") {
      params.set("source", value);
    } else {
      params.delete("source");
    }
    router.push(`/invoices?${params.toString()}`);
  }

  return (
    <Select value={source} onValueChange={handleChange}>
      <SelectTrigger size="sm" className="w-[140px] bg-card border-stone-200 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 shadow-none">
        <SelectValue placeholder="All Sources" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Sources</SelectItem>
        <SelectItem value="parking">Parking</SelectItem>
        <SelectItem value="jobs">Jobs</SelectItem>
      </SelectContent>
    </Select>
  );
}
