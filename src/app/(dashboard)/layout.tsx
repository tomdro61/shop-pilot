import { getCurrentUser } from "@/lib/actions/auth";
import { getNewQuoteRequestCount } from "@/lib/actions/quote-requests";
import { getPendingDviRequestCount } from "@/lib/actions/dvi";
import { getInboxTotalCount } from "@/lib/actions/inbox";
import { Sidebar } from "@/components/layout/sidebar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Header } from "@/components/layout/header";
import { ChatBubble } from "@/components/chat/chat-bubble";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, newQuoteCount, pendingDviCount, inboxTotal] = await Promise.all([
    getCurrentUser(),
    getNewQuoteRequestCount(),
    getPendingDviRequestCount(),
    getInboxTotalCount(),
  ]);

  const badgeCounts: Record<string, number> = {};
  if (newQuoteCount > 0) badgeCounts["/quote-requests"] = newQuoteCount;
  if (pendingDviCount > 0) badgeCounts["/dvi"] = pendingDviCount;
  if (inboxTotal > 0) badgeCounts["/inbox"] = inboxTotal;

  const userRole = user?.role ?? "manager";

  return (
    <div className="flex h-svh">
      <Sidebar badgeCounts={badgeCounts} userRole={userRole} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header user={user} />
        <main className="flex-1 overflow-y-auto pb-20 lg:pb-0 bg-stone-75 dark:bg-stone-950">
          {children}
        </main>
        <BottomNav userRole={userRole} />
        {userRole !== "tech" && <ChatBubble />}
      </div>
    </div>
  );
}
