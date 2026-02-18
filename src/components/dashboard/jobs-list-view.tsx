"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusSelect } from "./status-select";
import { JobCard } from "./job-card";
import { formatCustomerName, formatVehicle } from "@/lib/utils/format";
import { ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { JobStatus } from "@/types";

type JobRow = {
  id: string;
  status: string;
  category: string | null;
  date_received: string;
  date_finished: string | null;
  notes: string | null;
  customers: { id: string; first_name: string; last_name: string; phone: string | null } | null;
  vehicles: { id: string; year: number | null; make: string | null; model: string | null } | null;
};

interface JobsListViewProps {
  jobs: JobRow[];
}

export function JobsListView({ jobs }: JobsListViewProps) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo<ColumnDef<JobRow>[]>(
    () => [
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <StatusSelect
            jobId={row.original.id}
            currentStatus={row.original.status as JobStatus}
          />
        ),
      },
      {
        id: "customer",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Customer
            <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        accessorFn: (row) =>
          row.customers
            ? `${row.customers.last_name}, ${row.customers.first_name}`
            : "",
        cell: ({ row }) =>
          row.original.customers ? (
            <Link
              href={`/customers/${row.original.customers.id}`}
              className="hover:underline"
            >
              {formatCustomerName(row.original.customers)}
            </Link>
          ) : null,
      },
      {
        id: "vehicle",
        header: "Vehicle",
        accessorFn: (row) =>
          row.vehicles ? formatVehicle(row.vehicles) : "",
        cell: ({ row }) =>
          row.original.vehicles ? formatVehicle(row.original.vehicles) : null,
      },
      {
        accessorKey: "category",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Category
            <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
      },
      {
        accessorKey: "date_received",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Date
            <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) =>
          new Date(row.original.date_received).toLocaleDateString(),
      },
    ],
    []
  );

  const table = useReactTable({
    data: jobs,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  });

  return (
    <>
      {/* Mobile: Card list */}
      <div className="space-y-2 lg:hidden">
        {jobs.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">No jobs found</p>
        ) : (
          jobs.map((job) => <JobCard key={job.id} job={job} />)
        )}
      </div>

      {/* Desktop: Data table */}
      <div className="hidden lg:block">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    onClick={(e) => {
                      // Don't navigate if clicking on status select
                      if ((e.target as HTMLElement).closest("[role='combobox']"))
                        return;
                      window.location.href = `/jobs/${row.original.id}`;
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    No jobs found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}
