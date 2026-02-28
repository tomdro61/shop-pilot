"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PARKING_SERVICES, PARKING_SERVICE_LABELS } from "@/lib/constants";
import { updateReservation } from "@/lib/actions/parking";
import { Plus, X } from "lucide-react";

export function ParkingServicesForm({
  id,
  services,
}: {
  id: string;
  services: string[];
}) {
  const [current, setCurrent] = useState<string[]>(services);
  const [showPicker, setShowPicker] = useState(false);
  const [isPending, startTransition] = useTransition();

  const available = PARKING_SERVICES.filter((s) => !current.includes(s.value));

  function addService(value: string) {
    const updated = [...current, value];
    setCurrent(updated);
    setShowPicker(false);
    startTransition(async () => {
      await updateReservation(id, { services_interested: updated });
    });
  }

  function removeService(value: string) {
    const updated = current.filter((s) => s !== value);
    setCurrent(updated);
    startTransition(async () => {
      await updateReservation(id, { services_interested: updated });
    });
  }

  return (
    <div className="space-y-3">
      {current.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {current.map((service) => (
            <Badge
              key={service}
              variant="secondary"
              className="bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300 border-0 gap-1 pr-1"
            >
              {PARKING_SERVICE_LABELS[service] || service}
              <button
                type="button"
                onClick={() => removeService(service)}
                disabled={isPending}
                className="ml-0.5 rounded-full p-0.5 hover:bg-violet-200 dark:hover:bg-violet-800 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-sm text-stone-400 dark:text-stone-500">
          No services added yet.
        </p>
      )}

      {showPicker ? (
        <div className="flex flex-wrap gap-1.5">
          {available.map((service) => (
            <button
              key={service.value}
              type="button"
              onClick={() => addService(service.value)}
              disabled={isPending}
              className="rounded-full border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-1 text-xs text-stone-600 dark:text-stone-400 hover:bg-violet-50 dark:hover:bg-violet-950 hover:text-violet-700 dark:hover:text-violet-300 hover:border-violet-200 dark:hover:border-violet-800 transition-colors"
            >
              {service.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowPicker(false)}
            className="rounded-full border border-stone-200 dark:border-stone-700 px-3 py-1 text-xs text-stone-400 hover:text-stone-600 transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        available.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPicker(true)}
            disabled={isPending}
            className="gap-1.5 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Service
          </Button>
        )
      )}
    </div>
  );
}
