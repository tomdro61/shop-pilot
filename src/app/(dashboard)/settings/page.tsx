import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { HardHat, ClipboardList, DollarSign, Tag, ChevronRight } from "lucide-react";

export const metadata = {
  title: "Settings | ShopPilot",
};

const settingsItems = [
  {
    href: "/settings/rates",
    label: "Rates & Fees",
    description: "Tax rate, shop supplies, and environmental fees",
    icon: DollarSign,
  },
  {
    href: "/settings/categories",
    label: "Job Categories",
    description: "Service categories for line items and presets",
    icon: Tag,
  },
  {
    href: "/team",
    label: "Team",
    description: "Manage technicians and managers",
    icon: HardHat,
  },
  {
    href: "/presets",
    label: "Job Presets",
    description: "Reusable templates for common jobs",
    icon: ClipboardList,
  },
];

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl p-4 lg:p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Settings</h2>
        <p className="text-sm text-muted-foreground">Shop configuration and management</p>
      </div>

      <div className="space-y-2">
        {settingsItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="transition-colors hover:bg-stone-50 dark:hover:bg-stone-800">
              <CardContent className="flex items-center gap-4 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950">
                  <item.icon className="h-5 w-5 text-blue-600 dark:text-blue-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
