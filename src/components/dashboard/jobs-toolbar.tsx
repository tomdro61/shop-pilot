"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Plus, List, Columns3 } from "lucide-react";

interface JobsToolbarProps {
  categories: string[];
  jobCount: number;
}

export function JobsToolbar({ categories, jobCount }: JobsToolbarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("search") || "");
  const view = searchParams.get("view") || "list";
  const category = searchParams.get("category") || "all";
  const status = searchParams.get("status") || "all";
  const paymentStatus = searchParams.get("payment_status") || "all";

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value && value !== "all") {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }
      router.push(`/jobs?${params.toString()}`);
    },
    [router, searchParams]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      updateParams({ search });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, updateParams]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground mr-2">
        <span className="font-semibold text-foreground">All Jobs</span>
        <span>({jobCount})</span>
      </div>

      <Select
        value={status}
        onValueChange={(val) => updateParams({ status: val })}
      >
        <SelectTrigger className="w-[140px] text-xs">
          <SelectValue placeholder="All Statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          <SelectItem value="not_started">Not Started</SelectItem>
          <SelectItem value="waiting_for_parts">Waiting for Parts</SelectItem>
          <SelectItem value="in_progress">In Progress</SelectItem>
          <SelectItem value="complete">Complete</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={paymentStatus}
        onValueChange={(val) => updateParams({ payment_status: val })}
      >
        <SelectTrigger className="w-[140px] text-xs">
          <SelectValue placeholder="All Payments" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Payments</SelectItem>
          <SelectItem value="unpaid">Unpaid</SelectItem>
          <SelectItem value="invoiced">Invoiced</SelectItem>
          <SelectItem value="paid">Paid</SelectItem>
          <SelectItem value="waived">Waived</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={category}
        onValueChange={(val) => updateParams({ category: val })}
      >
        <SelectTrigger className="w-[140px] text-xs">
          <SelectValue placeholder="All Categories" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Categories</SelectItem>
          {categories.map((cat) => (
            <SelectItem key={cat} value={cat}>
              {cat}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Tabs
        value={view}
        onValueChange={(val) => updateParams({ view: val })}
      >
        <TabsList>
          <TabsTrigger value="list">
            <List className="h-4 w-4" />
          </TabsTrigger>
          <TabsTrigger value="board">
            <Columns3 className="h-4 w-4" />
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="relative flex-1 min-w-[180px]">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search jobs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Link href="/jobs/new" className="hidden sm:block">
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          New Job
        </Button>
      </Link>
    </div>
  );
}
