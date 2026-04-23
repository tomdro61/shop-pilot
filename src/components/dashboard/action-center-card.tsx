import Link from "next/link";
import {
  DollarSign,
  ClipboardCheck,
  FileText,
  FileQuestion,
  Car,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";

interface ActionCenterCardProps {
  unpaidCount: number;
  unpaidTotal: number;
  dviCount: number;
  estimateCount: number;
  estimateTotal: number;
  quoteCount: number;
  parkingLeadCount: number;
}

const categories = [
  {
    key: "payments",
    label: "Unpaid Jobs",
    icon: DollarSign,
    badge: "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400",
    iconColor: "text-red-600 dark:text-red-400",
  },
  {
    key: "dvi",
    label: "DVIs Ready to Send",
    icon: ClipboardCheck,
    badge: "bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-400",
    iconColor: "text-purple-600 dark:text-purple-400",
  },
  {
    key: "estimates",
    label: "Pending Estimates",
    icon: FileText,
    badge: "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400",
    iconColor: "text-amber-600 dark:text-amber-400",
  },
  {
    key: "quotes",
    label: "New Quote Requests",
    icon: FileQuestion,
    badge: "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400",
    iconColor: "text-blue-600 dark:text-blue-400",
  },
  {
    key: "parking",
    label: "Parking Service Leads",
    icon: Car,
    badge: "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400",
    iconColor: "text-emerald-600 dark:text-emerald-400",
  },
] as const;

export function ActionCenterCard({
  unpaidCount,
  unpaidTotal,
  dviCount,
  estimateCount,
  estimateTotal,
  quoteCount,
  parkingLeadCount,
}: ActionCenterCardProps) {
  const countMap: Record<string, number> = {
    payments: unpaidCount,
    dvi: dviCount,
    estimates: estimateCount,
    quotes: quoteCount,
    parking: parkingLeadCount,
  };

  const contextMap: Record<string, string> = {
    payments: unpaidTotal > 0 ? `${formatCurrency(unpaidTotal)} outstanding` : "",
    dvi: dviCount === 1 ? "1 inspection" : `${dviCount} inspections`,
    estimates: estimateTotal > 0 ? `${formatCurrency(estimateTotal)} pending` : "",
    quotes: quoteCount === 1 ? "1 submission" : `${quoteCount} submissions`,
    parking: parkingLeadCount === 1 ? "1 customer" : `${parkingLeadCount} customers`,
  };

  const visibleCategories = categories.filter((c) => countMap[c.key] > 0);
  const total = Object.values(countMap).reduce((s, n) => s + n, 0);

  if (total === 0) {
    return (
      <div className="bg-card rounded-lg shadow-card overflow-hidden">
        <div className="bg-stone-800 dark:bg-stone-900 px-5 py-3">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-stone-100">Action Center</h3>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          <p className="mt-2 text-sm text-muted-foreground">All caught up</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg shadow-card overflow-hidden">
      <div className="flex items-center justify-between bg-stone-800 dark:bg-stone-900 px-5 py-3">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-stone-100">Action Center</h3>
        <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-stone-600 text-stone-100">
          {total}
        </span>
      </div>
      <div className="divide-y divide-stone-200 dark:divide-stone-800">
        {visibleCategories.map((cat) => {
          const Icon = cat.icon;
          const count = countMap[cat.key];
          const context = contextMap[cat.key];
          return (
            <Link key={cat.key} href={`/inbox?tab=${cat.key}`} className="block">
              <div className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-stone-100 dark:hover:bg-stone-800/50">
                <Icon className={`h-4 w-4 shrink-0 ${cat.iconColor}`} />
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-bold text-stone-900 dark:text-stone-50">{cat.label}</span>
                  {context && (
                    <span className="ml-2 text-xs text-stone-500 dark:text-stone-400">{context}</span>
                  )}
                </div>
                <span className={`text-[10px] font-black px-2 py-1 rounded-md ${cat.badge}`}>
                  {count}
                </span>
                <ChevronRight className="h-4 w-4 text-stone-400" />
              </div>
            </Link>
          );
        })}
      </div>
      <div className="border-t border-stone-200 dark:border-stone-800 px-5 py-3 text-center">
        <Link href="/inbox" className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline">
          View All in Inbox &rarr;
        </Link>
      </div>
    </div>
  );
}
