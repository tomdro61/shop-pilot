import { getTeamMembers } from "@/lib/actions/team";
import { TeamList } from "@/components/dashboard/team-list";

export const metadata = {
  title: "Team | ShopPilot",
};

export default async function TeamPage() {
  const members = await getTeamMembers();

  return (
    <div className="p-4 lg:p-6">
      <TeamList members={members} />
    </div>
  );
}
