"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  // Hazmat / Environmental
  const [hazmatEnabled, setHazmatEnabled] = useState(settings.hazmat_enabled);
  const [hazmatAmount, setHazmatAmount] = useState(
    settings.hazmat_amount.toFixed(2)
  );
  const [hazmatLabel, setHazmatLabel] = useState(settings.hazmat_label);

  function handleMethodChange(value: ShopSuppliesMethod) {
    // Convert the rate display when switching to/from flat
    const currentRate = parseFloat(suppliesRate) || 0;
    if (value === "flat" && suppliesMethod !== "flat") {
      // Switching from percent to flat — keep the number as-is (user will edit)
      setSuppliesRate(currentRate.toFixed(2));
    } else if (value !== "flat" && suppliesMethod === "flat") {
      // Switching from flat to percent — keep as-is
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
        hazmat_enabled: hazmatEnabled,
        hazmat_amount: parseFloat(hazmatAmount) || 0,
        hazmat_label: hazmatLabel || "Environmental Fee",
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
      {/* Sales Tax */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Sales Tax</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs">
            <Label htmlFor="tax-rate" className="text-xs text-muted-foreground">
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
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Applied to parts and shop supplies. Labor is tax-exempt.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Shop Supplies Fee */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">
              Shop Supplies Fee
            </CardTitle>
            <Switch
              checked={suppliesEnabled}
              onCheckedChange={setSuppliesEnabled}
            />
          </div>
        </CardHeader>
        {suppliesEnabled && (
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">
                Calculation Method
              </Label>
              <Select
                value={suppliesMethod}
                onValueChange={(v) =>
                  handleMethodChange(v as ShopSuppliesMethod)
                }
              >
                <SelectTrigger className="mt-1 w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.entries(METHOD_LABELS) as [
                      ShopSuppliesMethod,
                      string,
                    ][]
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
                <Label
                  htmlFor="supplies-rate"
                  className="text-xs text-muted-foreground"
                >
                  {suppliesMethod === "flat" ? "Amount ($)" : "Rate (%)"}
                </Label>
                <div className="mt-1 flex items-center gap-2">
                  {suppliesMethod === "flat" && (
                    <span className="text-sm text-muted-foreground">$</span>
                  )}
                  <Input
                    id="supplies-rate"
                    type="number"
                    step={suppliesMethod === "flat" ? "0.01" : "0.01"}
                    min="0"
                    value={suppliesRate}
                    onChange={(e) => setSuppliesRate(e.target.value)}
                    className="w-28"
                  />
                  {suppliesMethod !== "flat" && (
                    <span className="text-sm text-muted-foreground">%</span>
                  )}
                </div>
              </div>
              {suppliesMethod !== "flat" && (
                <div>
                  <Label
                    htmlFor="supplies-cap"
                    className="text-xs text-muted-foreground"
                  >
                    Cap ($)
                  </Label>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">$</span>
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
                  <p className="mt-1 text-xs text-muted-foreground">
                    Leave blank for no cap
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Environmental / Hazmat Fee */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">
              Environmental Fee
            </CardTitle>
            <Switch
              checked={hazmatEnabled}
              onCheckedChange={setHazmatEnabled}
            />
          </div>
        </CardHeader>
        {hazmatEnabled && (
          <CardContent className="space-y-4">
            <div>
              <Label
                htmlFor="hazmat-label"
                className="text-xs text-muted-foreground"
              >
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
              <Label
                htmlFor="hazmat-amount"
                className="text-xs text-muted-foreground"
              >
                Amount ($)
              </Label>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-sm text-muted-foreground">$</span>
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
              <p className="mt-1 text-xs text-muted-foreground">
                Flat fee per job. Not taxed.
              </p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}
