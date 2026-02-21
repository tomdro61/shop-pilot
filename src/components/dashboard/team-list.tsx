"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
        <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b">
          <CardTitle className="text-base font-semibold">Team ({members.length})</CardTitle>
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
            <div className="-mx-5 divide-y">
              {members.map((member) => (
                <div key={member.id} className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-accent/50">
                  <div>
                    <p className="text-sm font-semibold">{member.name}</p>
                    <p className="text-xs text-muted-foreground">{member.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={member.role === "manager" ? "default" : "secondary"}>
                      {member.role === "manager" ? "Manager" : "Technician"}
                    </Badge>
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
