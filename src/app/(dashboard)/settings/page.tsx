import Link from "next/link";
import { HardHat, ClipboardList, DollarSign, Tag, ChevronRight, BookOpen } from "lucide-react";

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
  {
    href: "/settings/catalog",
    label: "Parts & Labor Catalog",
    description: "Saved parts and labor items for quick job building",
    icon: BookOpen,
  },
];

export default function SettingsPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 lg:px-6 pb-12 space-y-5 lg:space-y-6">
      <div className="py-2">
        <h1 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-50">
          Settings
        </h1>
        <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">
          Shop configuration and management
        </p>
      </div>

      <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm overflow-hidden">
        {settingsItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 px-4 py-3 border-b border-stone-100 dark:border-stone-800/60 last:border-b-0 hover:bg-stone-50 dark:hover:bg-stone-800/40 transition-colors"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900">
              <item.icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-stone-900 dark:text-stone-50">
                {item.label}
              </p>
              <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
                {item.description}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-stone-400 dark:text-stone-500" />
          </Link>
        ))}
      </div>
    </div>
  );
}
