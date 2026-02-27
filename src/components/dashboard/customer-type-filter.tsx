"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function CustomerTypeFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const type = searchParams.get("type") || "all";

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "all") {
      params.set("type", value);
    } else {
      params.delete("type");
    }
    params.delete("page");
    router.push(`/customers?${params.toString()}`);
  }

  return (
    <Select value={type} onValueChange={handleChange}>
      <SelectTrigger className="w-[120px]">
        <SelectValue placeholder="All Types" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Types</SelectItem>
        <SelectItem value="retail">Retail</SelectItem>
        <SelectItem value="fleet">Fleet</SelectItem>
        <SelectItem value="parking">Parking</SelectItem>
      </SelectContent>
    </Select>
  );
}
