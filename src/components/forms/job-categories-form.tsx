"use client";

import { useState } from "react";
import { toast } from "sonner";
import { updateShopSettings } from "@/lib/actions/settings";
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
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      )}

      <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm overflow-hidden">
        {categories.map((cat, index) => (
          <div
            key={`${index}-${cat}`}
            className="group flex items-center gap-2 px-4 py-2.5 border-b border-stone-100 dark:border-stone-800/60 last:border-b-0 transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/40"
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
                <Button variant="ghost" size="icon-xs" onClick={confirmEdit} title="Confirm">
                  <Check className="h-3 w-3 text-green-600" />
                </Button>
                <Button variant="ghost" size="icon-xs" onClick={cancelEdit} title="Cancel">
                  <X className="h-3 w-3 text-stone-400" />
                </Button>
              </div>
            ) : (
              <>
                <span className="min-w-0 flex-1 text-sm text-stone-900 dark:text-stone-50 truncate">
                  {cat}
                </span>

                <div className="flex shrink-0 items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => startEdit(index)}
                    title="Rename"
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                    title="Move up"
                  >
                    <ChevronUp className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => moveDown(index)}
                    disabled={index === categories.length - 1}
                    title="Move down"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
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

      <div className="flex gap-2">
        <Input
          placeholder="New category name…"
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          onKeyDown={handleAddKeyDown}
          className="flex-1"
        />
        <Button onClick={addCategory} disabled={!newCategory.trim()}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add
        </Button>
      </div>
    </div>
  );
}
