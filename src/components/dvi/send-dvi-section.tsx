"use client";

import { useState } from "react";
import { SendDviDialog } from "./send-dvi-dialog";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import type { DviCondition } from "@/types";

interface DviResult {
  id: string;
  condition: DviCondition | null;
  item_name: string;
  category_name: string;
  note: string | null;
}

export function SendDviSection({
  inspectionId,
  results,
}: {
  inspectionId: string;
  results: DviResult[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl bg-card p-5 shadow-card ring-1 ring-stone-200/10 dark:ring-stone-700/20 text-center">
      <p className="text-sm text-muted-foreground mb-3">
        Inspection complete. Ready to send to customer?
      </p>
      <Button onClick={() => setOpen(true)}>
        <Send className="mr-2 h-4 w-4" />
        Send to Customer
      </Button>
      <SendDviDialog
        inspectionId={inspectionId}
        results={results}
        open={open}
        onOpenChange={setOpen}
      />
    </div>
  );
}
