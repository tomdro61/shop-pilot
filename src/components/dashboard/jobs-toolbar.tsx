"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useRef } from "react";
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
import { Search, Plus, List, Columns3, CalendarDays, Calendar } from "lucide-react";

interface JobsToolbarProps {
  categories: string[];
  jobCount: number;
}

const filterTrigger =
  "bg-card border-stone-200 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 shadow-none";

export function JobsToolbar({ categories, jobCount }: JobsToolbarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("search") || "");
  const view = searchParams.get("view") || "list";
  const category = searchParams.get("category") || "all";
  const status = searchParams.get("status") || "all";
  const paymentStatus = searchParams.get("payment_status") || "all";
  const range = searchParams.get("range") || "all";
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParamsRef.current.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value && value !== "all") {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }
      router.push(`/jobs?${params.toString()}`);
    },
    [router]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      updateParams({ search });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, updateParams]);

  return (
    <div className="space-y-2">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400 dark:text-stone-500" />
        <Input
          placeholder="Search jobs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 pl-8 text-sm bg-card"
        />
      </div>

      {/* Filters + views + new job */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={(val) => updateParams({ status: val })}>
          <SelectTrigger size="sm" className={`w-[140px] ${filterTrigger}`}>
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

        <Select value={paymentStatus} onValueChange={(val) => updateParams({ payment_status: val })}>
          <SelectTrigger size="sm" className={`w-[140px] ${filterTrigger}`}>
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

        <Select value={category} onValueChange={(val) => updateParams({ category: val })}>
          <SelectTrigger size="sm" className={`w-[140px] ${filterTrigger}`}>
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

        <Select value={range} onValueChange={(val) => updateParams({ range: val })}>
          <SelectTrigger size="sm" className={`w-[140px] ${filterTrigger}`}>
            <Calendar className="h-3.5 w-3.5 mr-1 shrink-0 text-stone-400" />
            <SelectValue placeholder="All Time" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="this_week">This Week</SelectItem>
            <SelectItem value="this_month">This Month</SelectItem>
            <SelectItem value="this_quarter">This Quarter</SelectItem>
            <SelectItem value="this_year">This Year</SelectItem>
          </SelectContent>
        </Select>

        <Tabs value={view} onValueChange={(val) => updateParams({ view: val })}>
          <TabsList className="h-8 p-0.5 bg-stone-100 dark:bg-stone-800">
            <TabsTrigger value="list" className="h-7 px-2">
              <List className="h-3.5 w-3.5" />
            </TabsTrigger>
            <TabsTrigger value="board" className="h-7 px-2">
              <Columns3 className="h-3.5 w-3.5" />
            </TabsTrigger>
            <TabsTrigger value="calendar" className="h-7 px-2">
              <CalendarDays className="h-3.5 w-3.5" />
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Link href="/jobs/new" className="ml-auto">
          <Button size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">New Job</span>
          </Button>
        </Link>
      </div>
    </div>
  );
}
