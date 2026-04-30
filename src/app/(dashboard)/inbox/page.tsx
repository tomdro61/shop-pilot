import { getInboxData } from "@/lib/actions/inbox";
import { InboxList } from "@/components/dashboard/inbox-list";
import { PageShell } from "@/components/layout/page-shell";

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
    <PageShell>
      <InboxList data={data} activeTab={tab || "all"} />
    </PageShell>
  );
}
