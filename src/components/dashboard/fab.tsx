import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface FabProps {
  href: string;
}

export function Fab({ href }: FabProps) {
  return (
    <Link href={href} className="fixed bottom-20 right-4 z-40 lg:hidden">
      <Button
        size="icon"
        className="h-14 w-14 rounded-full shadow-[var(--glow-lg)] transition-transform hover:scale-105"
      >
        <Plus className="h-6 w-6" />
      </Button>
    </Link>
  );
}
