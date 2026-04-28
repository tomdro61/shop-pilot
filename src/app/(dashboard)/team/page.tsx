import { getTeamMembers } from "@/lib/actions/team";
import { TeamList } from "@/components/dashboard/team-list";

export const metadata = {
  title: "Team | ShopPilot",
};

export default async function TeamPage() {
  const members = await getTeamMembers();

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-6 pb-12 space-y-5 lg:space-y-6">
      <TeamList members={members} />
    </div>
  );
}
