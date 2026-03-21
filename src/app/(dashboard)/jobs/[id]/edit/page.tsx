import { notFound } from "next/navigation";
import { getJob } from "@/lib/actions/jobs";
import { JobForm } from "@/components/forms/job-form";
import { formatRONumber } from "@/lib/utils/format";

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
    <div className="mx-auto max-w-2xl p-4 lg:p-10">
      <div className="mb-8">
        <h2 className="text-2xl lg:text-3xl font-extrabold tracking-tight text-stone-900 dark:text-stone-50">
          Edit Job{job.ro_number ? `: ${formatRONumber(job.ro_number)}` : ""}
        </h2>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Modifying {job.title || "job"} service details.
        </p>
      </div>
      <JobForm job={job} />
    </div>
  );
}
