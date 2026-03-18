"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function TaxYearPicker({ currentYear }: { currentYear: number }) {
  const router = useRouter();
  const thisYear = new Date().getFullYear();

  function goToYear(year: number) {
    router.push(`/reports/tax?year=${year}`);
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={() => goToYear(currentYear - 1)}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-[4rem] text-center text-sm font-semibold tabular-nums">
        {currentYear}
      </span>
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        disabled={currentYear >= thisYear}
        onClick={() => goToYear(currentYear + 1)}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
