"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { getLockBoxes, checkOutWithLockbox, checkOutInPerson } from "@/lib/actions/lock-boxes";
import { LogOut, KeyRound, UserCheck } from "lucide-react";

interface LockBox {
  id: string;
  box_number: number;
  code: string;
}

export function CheckoutModal({
  open,
  onOpenChange,
  reservationId,
  customerName,
  customerPhone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservationId: string;
  customerName: string;
  customerPhone: string;
}) {
  const [lockBoxes, setLockBoxes] = useState<LockBox[]>([]);
  const [selectedBox, setSelectedBox] = useState<string>("");
  const [inPerson, setInPerson] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (open) {
      getLockBoxes().then(setLockBoxes);
      setSelectedBox("");
      setInPerson(false);
    }
  }, [open]);

  const selectedLockBox = lockBoxes.find(
    (lb) => lb.box_number.toString() === selectedBox
  );

  async function handleConfirm() {
    setLoading(true);

    let result;
    if (inPerson) {
      result = await checkOutInPerson(reservationId);
    } else {
      if (!selectedBox) {
        toast.error("Please select a lock box");
        setLoading(false);
        return;
      }
      result = await checkOutWithLockbox(reservationId, parseInt(selectedBox));
    }

    setLoading(false);

    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }

    toast.success(
      inPerson
        ? "Checked out (in person)"
        : "Checked out — pickup text sent!"
    );
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Check Out — {customerName}</DialogTitle>
          <DialogDescription>
            Choose how keys will be returned to the customer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* In-person toggle */}
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <UserCheck className="h-5 w-5 shrink-0 text-stone-500" />
            <div className="flex-1">
              <Label htmlFor="in-person" className="text-sm font-medium cursor-pointer">
                In person (no lockbox)
              </Label>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Customer is picking up in person — no text sent
              </p>
            </div>
            <Switch
              id="in-person"
              checked={inPerson}
              onCheckedChange={(checked) => {
                setInPerson(checked);
                if (checked) setSelectedBox("");
              }}
            />
          </div>

          {/* Lock box selection */}
          {!inPerson && (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-stone-500" />
                <Label className="text-sm font-medium">Lock box pickup</Label>
              </div>

              <Select
                value={selectedBox}
                onValueChange={setSelectedBox}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a lock box..." />
                </SelectTrigger>
                <SelectContent>
                  {lockBoxes.map((lb) => (
                    <SelectItem
                      key={lb.box_number}
                      value={lb.box_number.toString()}
                    >
                      Box #{lb.box_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedLockBox && (
                <div className="rounded-lg bg-blue-50 dark:bg-blue-950 px-3 py-2 text-sm">
                  <span className="font-medium text-blue-700 dark:text-blue-400">
                    Code: {selectedLockBox.code}
                  </span>
                  <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                    A text will be sent to {customerPhone} with the box number and code.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading || (!inPerson && !selectedBox)}
            className="gap-1.5"
          >
            <LogOut className="h-4 w-4" />
            {loading
              ? "Processing..."
              : inPerson
                ? "Check Out"
                : "Check Out & Send Text"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
