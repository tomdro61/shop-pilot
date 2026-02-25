"use client";

import { useState } from "react";
import { toast } from "sonner";
import { updateShopSettings } from "@/lib/actions/settings";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GripVertical, Plus, Trash2, ChevronUp, ChevronDown, Pencil, Check, X } from "lucide-react";

interface JobCategoriesFormProps {
  categories: string[];
}

export function JobCategoriesForm({ categories: initial }: JobCategoriesFormProps) {
  const [categories, setCategories] = useState<string[]>(initial);
  const [newCategory, setNewCategory] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [saving, setSaving] = useState(false);

  const isDirty = JSON.stringify(categories) !== JSON.stringify(initial);

  function moveUp(index: number) {
    if (index === 0) return;
    const next = [...categories];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setCategories(next);
  }

  function moveDown(index: number) {
    if (index === categories.length - 1) return;
    const next = [...categories];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    setCategories(next);
  }

  function remove(index: number) {
    if (categories.length <= 1) {
      toast.error("You need at least one category");
      return;
    }
    setCategories(categories.filter((_, i) => i !== index));
  }

  function startEdit(index: number) {
    setEditingIndex(index);
    setEditingValue(categories[index]);
  }

  function confirmEdit() {
    if (editingIndex === null) return;
    const trimmed = editingValue.trim();
    if (!trimmed) {
      toast.error("Category name cannot be empty");
      return;
    }
    if (categories.some((c, i) => i !== editingIndex && c.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("Category already exists");
      return;
    }
    const next = [...categories];
    next[editingIndex] = trimmed;
    setCategories(next);
    setEditingIndex(null);
    setEditingValue("");
  }

  function cancelEdit() {
    setEditingIndex(null);
    setEditingValue("");
  }

  function addCategory() {
    const trimmed = newCategory.trim();
    if (!trimmed) return;
    if (categories.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("Category already exists");
      return;
    }
    setCategories([...categories, trimmed]);
    setNewCategory("");
  }

  function handleAddKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      addCategory();
    }
  }

  function handleEditKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      confirmEdit();
    }
    if (e.key === "Escape") {
      cancelEdit();
    }
  }

  async function handleSave() {
    setSaving(true);
    const result = await updateShopSettings({ job_categories: categories });
    setSaving(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Categories updated");
    }
  }

  return (
    <div className="space-y-4">
      {isDirty && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/50 p-3">
          <p className="flex-1 text-sm text-blue-700 dark:text-blue-400">
            You have unsaved changes
          </p>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-stone-100 dark:divide-stone-800">
            {categories.map((cat, index) => (
              <div
                key={`${index}-${cat}`}
                className="flex items-center gap-2 px-4 py-2.5 transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/50"
              >
                <GripVertical className="h-4 w-4 shrink-0 text-stone-300 dark:text-stone-600" />

                {editingIndex === index ? (
                  <div className="flex flex-1 items-center gap-2">
                    <Input
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onKeyDown={handleEditKeyDown}
                      className="h-8 text-sm"
                      autoFocus
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={confirmEdit}
                    >
                      <Check className="h-3.5 w-3.5 text-green-600" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={cancelEdit}
                    >
                      <X className="h-3.5 w-3.5 text-stone-400" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 text-sm font-medium">{cat}</span>

                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => startEdit(index)}
                        title="Rename"
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => moveUp(index)}
                        disabled={index === 0}
                        title="Move up"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => moveDown(index)}
                        disabled={index === categories.length - 1}
                        title="Move down"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => remove(index)}
                        title="Remove"
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Input
          placeholder="New category name..."
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          onKeyDown={handleAddKeyDown}
          className="flex-1"
        />
        <Button variant="outline" onClick={addCategory} disabled={!newCategory.trim()}>
          <Plus className="mr-2 h-4 w-4" />
          Add
        </Button>
      </div>

    </div>
  );
}
