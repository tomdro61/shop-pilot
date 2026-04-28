"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TeamMemberForm } from "@/components/forms/team-member-form";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { deleteTeamMember } from "@/lib/actions/team";
import { getInitials } from "@/lib/utils/format";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { User } from "@/types";

interface TeamListProps {
  members: User[];
}

export function TeamList({ members }: TeamListProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [editMember, setEditMember] = useState<User | null>(null);

  async function handleDelete(id: string) {
    const result = await deleteTeamMember(id);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Team member deleted");
    }
    return result;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold tracking-tight text-stone-900 dark:text-stone-50">
          Team
          <span className="ml-2 font-mono tabular-nums text-xs text-stone-500 dark:text-stone-400">
            {members.length}
          </span>
        </h2>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          <span className="hidden sm:inline">Add Member</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </div>

      <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm overflow-hidden">
        {members.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-stone-500 dark:text-stone-400">No team members yet</p>
          </div>
        ) : (
          members.map((member) => (
            <div
              key={member.id}
              className="group flex items-center gap-3 px-4 py-2.5 border-b border-stone-100 dark:border-stone-800/60 last:border-b-0"
            >
              <div className="w-8 h-8 rounded-md grid place-items-center bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900 text-[11px] font-semibold flex-none">
                {getInitials(member.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-stone-900 dark:text-stone-50 truncate">
                  {member.name}
                </p>
                <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
                  {member.email}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider",
                  member.role === "manager"
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
                    : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400"
                )}
              >
                {member.role === "manager" ? "Manager" : "Technician"}
              </span>
              <div className="flex shrink-0 items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title="Edit"
                  onClick={() => setEditMember(member)}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <DeleteConfirmDialog
                  title="Delete Team Member"
                  description={`Delete ${member.name}? Any jobs assigned to them will become unassigned.`}
                  onConfirm={() => handleDelete(member.id)}
                  trigger={
                    <Button variant="ghost" size="icon-xs" title="Delete">
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  }
                />
              </div>
            </div>
          ))
        )}
      </div>

      <TeamMemberForm open={addOpen} onOpenChange={setAddOpen} />

      {editMember && (
        <TeamMemberForm
          member={editMember}
          open={!!editMember}
          onOpenChange={(open) => {
            if (!open) setEditMember(null);
          }}
        />
      )}
    </div>
  );
}
