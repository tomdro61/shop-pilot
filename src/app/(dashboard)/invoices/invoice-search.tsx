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
    <div className="relative flex-1 min-w-[220px]">
      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400 dark:text-stone-500" />
      <Input
        placeholder="Search invoices…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-8 pl-8 text-sm bg-card"
      />
    </div>
  );
}
