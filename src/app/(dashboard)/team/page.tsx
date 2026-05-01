import { getTeamMembers } from "@/lib/actions/team";
import { TeamList } from "@/components/dashboard/team-list";
import { PageShell } from "@/components/layout/page-shell";

export const metadata = {
  title: "Team | ShopPilot",
};

export default async function TeamPage() {
  const members = await getTeamMembers();

  return (
    <PageShell width="narrow">
      <TeamList members={members} />
    </PageShell>
  );
}
