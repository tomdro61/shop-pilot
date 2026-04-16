import { getInboxData } from "@/lib/actions/inbox";
import { InboxList } from "@/components/dashboard/inbox-list";

export const metadata = {
  title: "Inbox | ShopPilot",
};

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const data = await getInboxData();

  return (
    <div className="p-4 lg:p-10 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-50">Inbox</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          {data.counts.total > 0
            ? `${data.counts.total} item${data.counts.total === 1 ? "" : "s"} need${data.counts.total === 1 ? "s" : ""} your attention.`
            : "You\u2019re all caught up."}
        </p>
      </div>
      <InboxList data={data} activeTab={tab || "all"} />
    </div>
  );
}
