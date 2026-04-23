"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateJobFields } from "@/lib/actions/jobs";
import { getInitials } from "@/lib/utils/format";

const UNASSIGNED = "__unassigned__";

interface JobTechEditorProps {
  jobId: string;
  currentTech: { id: string; name: string } | null;
  techs: { id: string; name: string }[];
}

export function JobTechEditor({ jobId, currentTech, techs }: JobTechEditorProps) {
  const router = useRouter();

  async function handleChange(value: string) {
    const nextId = value === UNASSIGNED ? null : value;
    const currentId = currentTech?.id ?? null;
    if (nextId === currentId) return;

    const result = await updateJobFields(jobId, { assigned_tech: nextId });
    if ("error" in result) {
      toast.error(typeof result.error === "string" ? result.error : "Update failed");
      return;
    }
    const next = techs.find((t) => t.id === nextId);
    toast.success(next ? `Assigned to ${next.name}` : "Unassigned");
    router.refresh();
  }

  return (
    <Select value={currentTech?.id ?? UNASSIGNED} onValueChange={handleChange}>
      <SelectTrigger className="w-auto border-0 bg-transparent p-0 h-auto shadow-none focus:ring-0 gap-3 hover:bg-stone-50 dark:hover:bg-stone-800/40 rounded-md -mx-1 px-1 min-w-0">
        <SelectValue asChild>
          <span className="flex items-center gap-3 min-w-0">
            <span
              className={`w-10 h-10 rounded-md grid place-items-center text-sm font-semibold flex-none ${
                currentTech
                  ? "bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900"
                  : "bg-stone-100 text-stone-400 border border-stone-200 dark:bg-stone-900 dark:text-stone-600 dark:border-stone-800"
              }`}
            >
              {currentTech ? getInitials(currentTech.name) : "—"}
            </span>
            <span className="min-w-0 text-left">
              <span className="block text-sm font-semibold text-stone-900 dark:text-stone-50 truncate">
                {currentTech?.name || <span className="text-stone-400 font-normal">Unassigned</span>}
              </span>
              <span className="block text-xs text-stone-500 dark:text-stone-400 mt-0.5">Technician</span>
            </span>
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="start">
        <SelectItem value={UNASSIGNED}>
          <span className="text-stone-500 dark:text-stone-400">Unassigned</span>
        </SelectItem>
        {techs.map((tech) => (
          <SelectItem key={tech.id} value={tech.id}>
            {tech.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
