"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
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
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Team ({members.length})</h2>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Add Member</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </div>

      {members.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">
          No team members yet
        </p>
      ) : (
        <div className="space-y-2">
          {members.map((member) => (
            <Card key={member.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{member.name}</p>
                  <p className="text-sm text-muted-foreground">{member.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={member.role === "manager" ? "default" : "secondary"}>
                    {member.role === "manager" ? "Manager" : "Technician"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditMember(member)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <DeleteConfirmDialog
                    title="Delete Team Member"
                    description={`Delete ${member.name}? Any jobs assigned to them will become unassigned.`}
                    onConfirm={() => handleDelete(member.id)}
                    trigger={
                      <Button variant="ghost" size="icon">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    }
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
