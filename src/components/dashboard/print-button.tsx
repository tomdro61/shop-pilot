"use client";

import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <div className="mb-4 flex justify-end print:hidden">
      <Button onClick={() => window.print()} size="sm">
        <Printer className="mr-1.5 h-4 w-4" />
        Print
      </Button>
    </div>
  );
}
