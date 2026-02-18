import { JobForm } from "@/components/forms/job-form";
import { getJobCategories } from "@/lib/actions/jobs";

export const metadata = {
  title: "New Job | ShopPilot",
};

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string }>;
}) {
  const { customerId } = await searchParams;
  const categories = await getJobCategories();

  return (
    <div className="mx-auto max-w-2xl p-4 lg:p-6">
      <h2 className="mb-6 text-xl font-semibold">New Job</h2>
      <JobForm defaultCustomerId={customerId} categories={categories} />
    </div>
  );
}
