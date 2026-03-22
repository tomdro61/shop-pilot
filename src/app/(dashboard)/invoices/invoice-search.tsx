"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export function InvoiceSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  const updateSearch = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParamsRef.current.toString());
      if (value) {
        params.set("search", value);
      } else {
        params.delete("search");
      }
      router.push(`/invoices?${params.toString()}`);
    },
    [router]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      updateSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, updateSearch]);

  return (
    <div className="relative">
      <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400 dark:text-stone-500" />
      <Input
        placeholder="Search by customer..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="pl-11 rounded-full"
      />
    </div>
  );
}
