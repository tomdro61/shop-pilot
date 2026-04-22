import Link from "next/link";
import { notFound } from "next/navigation";
import { getJob } from "@/lib/actions/jobs";
import { JobForm } from "@/components/forms/job-form";
import { Button } from "@/components/ui/button";
import { formatRONumber } from "@/lib/utils/format";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Edit Job | ShopPilot",
};

export default async function EditJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();

  return (
    <div className="max-w-3xl mx-auto px-4 lg:px-6 pb-12 space-y-4">
      <div className="flex items-center justify-between py-2">
        <Link href={`/jobs/${id}`}>
          <Button variant="ghost" size="sm" className="-ml-3">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Back to Job
          </Button>
        </Link>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        {job.ro_number && (
          <span className="font-mono text-xs text-stone-400 dark:text-stone-500 tabular-nums">
            {formatRONumber(job.ro_number)}
          </span>
        )}
        <h1 className="text-base lg:text-lg font-semibold text-stone-900 dark:text-stone-50">
          Edit Job
        </h1>
        {job.title && (
          <span className="text-sm text-stone-500 dark:text-stone-400 truncate">· {job.title}</span>
        )}
      </div>
      <JobForm job={job} />
    </div>
  );
}
