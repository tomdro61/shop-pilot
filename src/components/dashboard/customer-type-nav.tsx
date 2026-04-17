"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { CustomerTypePills } from "@/components/dashboard/customer-type-pills";

export function CustomerTypeNav() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = searchParams.get("customerType") || "all";

  function onChange(type: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (type && type !== "all") {
      params.set("customerType", type);
    } else {
      params.delete("customerType");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return <CustomerTypePills value={value} onChange={onChange} />;
}
