"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TeamMemberForm } from "@/components/forms/team-member-form";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { deleteTeamMember } from "@/lib/actions/team";
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
    <div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg font-bold tracking-tight text-stone-900 dark:text-stone-50">Team ({members.length})</CardTitle>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Add Member</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No team members yet
            </p>
          ) : (
            <div className="space-y-1">
              {members.map((member) => (
                <div key={member.id} className="flex items-center justify-between rounded-xl px-4 py-3.5 transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/50">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-950 flex items-center justify-center text-xs font-bold text-blue-700 dark:text-blue-400">
                      {member.name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-bold">{member.name}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-[10px] font-black px-2 py-1 rounded-full uppercase",
                      member.role === "manager"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
                        : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400"
                    )}>
                      {member.role === "manager" ? "Manager" : "Technician"}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setEditMember(member)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <DeleteConfirmDialog
                      title="Delete Team Member"
                      description={`Delete ${member.name}? Any jobs assigned to them will become unassigned.`}
                      onConfirm={() => handleDelete(member.id)}
                      trigger={
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <TeamMemberForm
        open={addOpen}
        onOpenChange={setAddOpen}
      />

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
