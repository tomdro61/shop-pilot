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
    <div className="p-4 lg:p-6 space-y-3">
      <InboxList data={data} activeTab={tab || "all"} />
    </div>
  );
}
