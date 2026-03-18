import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import {
  DollarSign,
  Receipt,
  CreditCard,
  FileText,
  Wrench,
  BarChart3,
  TrendingUp,
  Users,
  UserPlus,
  ChevronRight,
} from "lucide-react";

export const metadata = {
  title: "Reports | ShopPilot",
};

interface ReportCard {
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  status: "live" | "coming_soon";
}

const financialReports: ReportCard[] = [
  {
    href: "/reports/revenue",
    label: "Revenue Overview",
    description: "Revenue, margins, categories, and technician performance",
    icon: DollarSign,
    status: "live",
  },
  {
    href: "/reports/tax",
    label: "Tax Summary",
    description: "Monthly taxable sales and MA sales tax collected",
    icon: Receipt,
    status: "live",
  },
  {
    href: "/reports/receivables",
    label: "Accounts Receivable",
    description: "Outstanding invoices and aging buckets",
    icon: FileText,
    status: "coming_soon",
  },
  {
    href: "/reports/payments",
    label: "Payment Methods",
    description: "Revenue breakdown by how customers pay",
    icon: CreditCard,
    status: "coming_soon",
  },
];

const operationsReports: ReportCard[] = [
  {
    href: "/reports/tech",
    label: "Tech Performance",
    description: "Technician output, revenue, and workload balance",
    icon: Wrench,
    status: "coming_soon",
  },
  {
    href: "/reports/throughput",
    label: "Job Throughput",
    description: "Jobs opened vs closed, cycle times, and pipeline health",
    icon: BarChart3,
    status: "coming_soon",
  },
  {
    href: "/reports/service-mix",
    label: "Service Mix Trends",
    description: "Category mix changes over time and seasonality",
    icon: TrendingUp,
    status: "coming_soon",
  },
];

const customerReports: ReportCard[] = [
  {
    href: "/reports/top-customers",
    label: "Top Customers",
    description: "Most valuable customers by revenue and visit frequency",
    icon: Users,
    status: "coming_soon",
  },
  {
    href: "/reports/customer-growth",
    label: "New vs Returning",
    description: "Customer acquisition and retention trends",
    icon: UserPlus,
    status: "coming_soon",
  },
];

function ReportSection({ title, reports }: { title: string; reports: ReportCard[] }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-stone-400 dark:text-stone-500">
        {title}
      </h3>
      <div className="space-y-2">
        {reports.map((report) => {
          const content = (
            <Card
              className={
                report.status === "live"
                  ? "transition-colors hover:bg-stone-50 dark:hover:bg-stone-800"
                  : "opacity-60"
              }
            >
              <CardContent className="flex items-center gap-4 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950">
                  <report.icon className="h-5 w-5 text-blue-600 dark:text-blue-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{report.label}</p>
                    {report.status === "coming_soon" && (
                      <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                        Coming Soon
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{report.description}</p>
                </div>
                {report.status === "live" && (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
              </CardContent>
            </Card>
          );

          if (report.status === "live") {
            return (
              <Link key={report.href} href={report.href}>
                {content}
              </Link>
            );
          }

          return <div key={report.href}>{content}</div>;
        })}
      </div>
    </div>
  );
}

export default function ReportsIndexPage() {
  return (
    <div className="mx-auto max-w-2xl p-4 lg:p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Reports</h2>
        <p className="text-sm text-muted-foreground">
          Business analytics and performance tracking
        </p>
      </div>

      <div className="space-y-6">
        <ReportSection title="Financial" reports={financialReports} />
        <ReportSection title="Operations" reports={operationsReports} />
        <ReportSection title="Customers" reports={customerReports} />
      </div>
    </div>
  );
}
