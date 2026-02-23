import { notFound } from "next/navigation";
import { getJob } from "@/lib/actions/jobs";
import { JobForm } from "@/components/forms/job-form";

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
    <div className="mx-auto max-w-2xl p-4 lg:p-6">
      <h2 className="mb-6 text-xl font-semibold">Edit Job</h2>
      <JobForm job={job} />
    </div>
  );
}
