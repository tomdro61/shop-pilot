"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateShopSettings } from "@/lib/actions/settings";
import type { ShopSettings, ShopSuppliesMethod } from "@/types";

const METHOD_LABELS: Record<ShopSuppliesMethod, string> = {
  percent_of_labor: "% of Labor",
  percent_of_parts: "% of Parts",
  percent_of_total: "% of Total",
  flat: "Flat Amount",
};

const FIELD_LABEL = "text-xs font-medium text-stone-600 dark:text-stone-400";
const HINT = "mt-1 text-xs text-stone-500 dark:text-stone-400";

function CategorySelector({
  allCategories,
  selected,
  onChange,
  label,
}: {
  allCategories: string[];
  selected: string[] | null;
  onChange: (value: string[] | null) => void;
  label: string;
}) {
  const isAll = selected === null;

  function toggleAll() {
    onChange(isAll ? [] : null);
  }

  function toggleCategory(cat: string) {
    const current = selected ?? [];
    const next = current.includes(cat)
      ? current.filter((c) => c !== cat)
      : [...current, cat];
    if (next.length === allCategories.length) {
      onChange(null);
    } else {
      onChange(next);
    }
  }

  return (
    <div>
      <Label className={FIELD_LABEL}>{label}</Label>
      <div className="mt-2 space-y-1.5">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={isAll}
            onChange={toggleAll}
            className="rounded border-stone-200 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
          />
          <span className={isAll ? "font-medium text-stone-900 dark:text-stone-50" : "text-stone-700 dark:text-stone-300"}>
            All Categories
          </span>
        </label>
        {allCategories.map((cat) => (
          <label key={cat} className="flex items-center gap-2 text-sm cursor-pointer pl-4">
            <input
              type="checkbox"
              checked={isAll || (selected?.includes(cat) ?? false)}
              onChange={() => toggleCategory(cat)}
              className="rounded border-stone-200 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
            />
            <span className="text-stone-700 dark:text-stone-300">{cat}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function SettingsCard({
  title,
  toggle,
  children,
}: {
  title: string;
  toggle?: { checked: boolean; onChange: (v: boolean) => void };
  children?: React.ReactNode;
}) {
  return (
    <section className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-stone-100 dark:border-stone-800/60">
        <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-50">
          {title}
        </h3>
        {toggle && (
          <Switch checked={toggle.checked} onCheckedChange={toggle.onChange} />
        )}
      </header>
      {children && <div className="px-4 py-4 space-y-4">{children}</div>}
    </section>
  );
}

export function ShopSettingsForm({ settings }: { settings: ShopSettings }) {
  const [saving, setSaving] = useState(false);

  // Tax
  const [taxRate, setTaxRate] = useState(
    (settings.tax_rate * 100).toFixed(3)
  );

  // Shop Supplies
  const [suppliesEnabled, setSuppliesEnabled] = useState(
    settings.shop_supplies_enabled
  );
  const [suppliesMethod, setSuppliesMethod] = useState<ShopSuppliesMethod>(
    settings.shop_supplies_method as ShopSuppliesMethod
  );
  const [suppliesRate, setSuppliesRate] = useState(
    suppliesMethod === "flat"
      ? settings.shop_supplies_rate.toFixed(2)
      : (settings.shop_supplies_rate * 100).toFixed(2)
  );
  const [suppliesCap, setSuppliesCap] = useState(
    settings.shop_supplies_cap !== null
      ? settings.shop_supplies_cap.toFixed(2)
      : ""
  );
  const [suppliesCategories, setSuppliesCategories] = useState<string[] | null>(
    (settings.shop_supplies_categories as string[] | null) ?? null
  );

  // Hazmat / Environmental
  const [hazmatEnabled, setHazmatEnabled] = useState(settings.hazmat_enabled);
  const [hazmatAmount, setHazmatAmount] = useState(
    settings.hazmat_amount.toFixed(2)
  );
  const [hazmatLabel, setHazmatLabel] = useState(settings.hazmat_label);
  const [hazmatCategories, setHazmatCategories] = useState<string[] | null>(
    (settings.hazmat_categories as string[] | null) ?? null
  );

  function handleMethodChange(value: ShopSuppliesMethod) {
    const currentRate = parseFloat(suppliesRate) || 0;
    if (value === "flat" && suppliesMethod !== "flat") {
      setSuppliesRate(currentRate.toFixed(2));
    } else if (value !== "flat" && suppliesMethod === "flat") {
      setSuppliesRate(currentRate.toFixed(2));
    }
    setSuppliesMethod(value);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const parsedTaxRate = parseFloat(taxRate) / 100;
      const parsedSuppliesRate =
        suppliesMethod === "flat"
          ? parseFloat(suppliesRate) || 0
          : (parseFloat(suppliesRate) || 0) / 100;
      const parsedCap = suppliesCap ? parseFloat(suppliesCap) : null;

      const result = await updateShopSettings({
        tax_rate: parsedTaxRate,
        shop_supplies_enabled: suppliesEnabled,
        shop_supplies_method: suppliesMethod,
        shop_supplies_rate: parsedSuppliesRate,
        shop_supplies_cap: parsedCap,
        shop_supplies_categories: suppliesCategories,
        hazmat_enabled: hazmatEnabled,
        hazmat_amount: parseFloat(hazmatAmount) || 0,
        hazmat_label: hazmatLabel || "Environmental Fee",
        hazmat_categories: hazmatCategories,
      });

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Settings saved");
      }
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <SettingsCard title="Sales Tax">
        <div className="max-w-xs">
          <Label htmlFor="tax-rate" className={FIELD_LABEL}>
            Tax Rate (%)
          </Label>
          <div className="mt-1 flex items-center gap-2">
            <Input
              id="tax-rate"
              type="number"
              step="0.001"
              min="0"
              max="100"
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
              className="w-28"
            />
            <span className="text-sm text-stone-500 dark:text-stone-400">%</span>
          </div>
          <p className={HINT}>
            Applied to parts and shop supplies. Labor is tax-exempt.
          </p>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Shop Supplies Fee"
        toggle={{ checked: suppliesEnabled, onChange: setSuppliesEnabled }}
      >
        {suppliesEnabled && (
          <>
            <div>
              <Label className={FIELD_LABEL}>Calculation Method</Label>
              <Select
                value={suppliesMethod}
                onValueChange={(v) => handleMethodChange(v as ShopSuppliesMethod)}
              >
                <SelectTrigger className="mt-1 w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.entries(METHOD_LABELS) as [ShopSuppliesMethod, string][]
                  ).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-4">
              <div>
                <Label htmlFor="supplies-rate" className={FIELD_LABEL}>
                  {suppliesMethod === "flat" ? "Amount ($)" : "Rate (%)"}
                </Label>
                <div className="mt-1 flex items-center gap-2">
                  {suppliesMethod === "flat" && (
                    <span className="text-sm text-stone-500 dark:text-stone-400">$</span>
                  )}
                  <Input
                    id="supplies-rate"
                    type="number"
                    step="0.01"
                    min="0"
                    value={suppliesRate}
                    onChange={(e) => setSuppliesRate(e.target.value)}
                    className="w-28"
                  />
                  {suppliesMethod !== "flat" && (
                    <span className="text-sm text-stone-500 dark:text-stone-400">%</span>
                  )}
                </div>
              </div>
              {suppliesMethod !== "flat" && (
                <div>
                  <Label htmlFor="supplies-cap" className={FIELD_LABEL}>
                    Cap ($)
                  </Label>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-sm text-stone-500 dark:text-stone-400">$</span>
                    <Input
                      id="supplies-cap"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="No cap"
                      value={suppliesCap}
                      onChange={(e) => setSuppliesCap(e.target.value)}
                      className="w-28"
                    />
                  </div>
                  <p className={HINT}>Leave blank for no cap</p>
                </div>
              )}
            </div>
            <CategorySelector
              allCategories={settings.job_categories as string[]}
              selected={suppliesCategories}
              onChange={setSuppliesCategories}
              label="Apply to categories"
            />
          </>
        )}
      </SettingsCard>

      <SettingsCard
        title="Environmental Fee"
        toggle={{ checked: hazmatEnabled, onChange: setHazmatEnabled }}
      >
        {hazmatEnabled && (
          <>
            <div>
              <Label htmlFor="hazmat-label" className={FIELD_LABEL}>
                Fee Label
              </Label>
              <Input
                id="hazmat-label"
                value={hazmatLabel}
                onChange={(e) => setHazmatLabel(e.target.value)}
                className="mt-1 w-64"
                placeholder="Environmental Fee"
              />
            </div>
            <div>
              <Label htmlFor="hazmat-amount" className={FIELD_LABEL}>
                Amount ($)
              </Label>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-sm text-stone-500 dark:text-stone-400">$</span>
                <Input
                  id="hazmat-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={hazmatAmount}
                  onChange={(e) => setHazmatAmount(e.target.value)}
                  className="w-28"
                />
              </div>
              <p className={HINT}>Flat fee per job. Not taxed.</p>
            </div>
            <CategorySelector
              allCategories={settings.job_categories as string[]}
              selected={hazmatCategories}
              onChange={setHazmatCategories}
              label="Apply to categories"
            />
          </>
        )}
      </SettingsCard>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}
