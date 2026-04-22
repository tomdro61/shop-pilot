"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PARKING_SERVICES, PARKING_SERVICE_LABELS } from "@/lib/constants";
import { updateReservation } from "@/lib/actions/parking";
import { Plus, X, Check, Circle } from "lucide-react";

export function ParkingServicesForm({
  id,
  services,
  completed,
}: {
  id: string;
  services: string[];
  completed: string[];
}) {
  const [current, setCurrent] = useState<string[]>(services);
  const [currentCompleted, setCurrentCompleted] = useState<string[]>(completed);
  const [showPicker, setShowPicker] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [isPending, startTransition] = useTransition();

  const available = PARKING_SERVICES.filter(
    (s) => !current.includes(s.value) && !current.includes(s.label)
  );

  function addService(value: string) {
    if (!value.trim() || current.includes(value.trim())) return;
    const updated = [...current, value.trim()];
    setCurrent(updated);
    setCustomValue("");
    startTransition(async () => {
      await updateReservation(id, { services_interested: updated });
    });
  }

  function removeService(value: string) {
    const updated = current.filter((s) => s !== value);
    const updatedCompleted = currentCompleted.filter((s) => s !== value);
    setCurrent(updated);
    setCurrentCompleted(updatedCompleted);
    startTransition(async () => {
      await updateReservation(id, {
        services_interested: updated,
        services_completed: updatedCompleted,
      });
    });
  }

  function toggleServiceStatus(value: string) {
    const isComplete = currentCompleted.includes(value);
    const updatedCompleted = isComplete
      ? currentCompleted.filter((s) => s !== value)
      : [...currentCompleted, value];
    setCurrentCompleted(updatedCompleted);
    startTransition(async () => {
      await updateReservation(id, { services_completed: updatedCompleted });
    });
  }

  function handleCustomSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (customValue.trim()) {
      addService(customValue);
    }
  }

  return (
    <div className="space-y-3">
      {current.length > 0 ? (
        <div className="space-y-2">
          {current.map((service) => {
            const isComplete = currentCompleted.includes(service);
            return (
              <div
                key={service}
                className="flex items-center justify-between gap-3 rounded-lg border border-stone-300 dark:border-stone-700 px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium text-stone-900 dark:text-stone-50 truncate">
                    {PARKING_SERVICE_LABELS[service] || service}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => toggleServiceStatus(service)}
                    disabled={isPending}
                    className="transition-colors"
                  >
                    {isComplete ? (
                      <Badge
                        variant="secondary"
                        className="bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border-0 text-[11px] gap-1 cursor-pointer hover:bg-emerald-200 dark:hover:bg-emerald-900"
                      >
                        <Check className="h-3 w-3" />
                        Complete
                      </Badge>
                    ) : (
                      <Badge
                        variant="secondary"
                        className="bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 border-0 text-[11px] gap-1 cursor-pointer hover:bg-stone-200 dark:hover:bg-stone-700"
                      >
                        <Circle className="h-3 w-3" />
                        Not Started
                      </Badge>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeService(service)}
                    disabled={isPending}
                    className="rounded-md p-1 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors text-stone-400"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-stone-400 dark:text-stone-500">
          No services added yet.
        </p>
      )}

      {showPicker ? (
        <div className="space-y-2">
          {available.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {available.map((service) => (
                <button
                  key={service.value}
                  type="button"
                  onClick={() => addService(service.value)}
                  disabled={isPending}
                  className="rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-1 text-xs text-stone-600 dark:text-stone-400 hover:bg-violet-50 dark:hover:bg-violet-950 hover:text-violet-700 dark:hover:text-violet-300 hover:border-violet-200 dark:hover:border-violet-800 transition-colors"
                >
                  {service.label}
                </button>
              ))}
            </div>
          )}
          <form onSubmit={handleCustomSubmit} className="flex items-center gap-2">
            <Input
              type="text"
              placeholder="Type a custom service..."
              className="h-8 text-xs flex-1"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              maxLength={50}
              autoFocus
            />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={isPending || !customValue.trim()}
              className="h-8 text-xs"
            >
              Add
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => { setShowPicker(false); setCustomValue(""); }}
              className="h-8 text-xs"
            >
              Done
            </Button>
          </form>
        </div>
      ) : (
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
      )}
    </div>
  );
}
