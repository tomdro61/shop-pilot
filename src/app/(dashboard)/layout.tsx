import { getCurrentUser } from "@/lib/actions/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Header } from "@/components/layout/header";
import { ChatBubble } from "@/components/chat/chat-bubble";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  return (
    <div className="flex h-svh">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header user={user} />
        <main className="flex-1 overflow-y-auto pb-16 lg:pb-0 bg-stone-100 dark:bg-stone-950">
          {children}
        </main>
        <BottomNav />
        <ChatBubble />
      </div>
    </div>
  );
}
