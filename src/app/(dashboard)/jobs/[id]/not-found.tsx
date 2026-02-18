import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Wrench } from "lucide-react";

export default function JobNotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Wrench className="mb-4 h-12 w-12 text-muted-foreground/50" />
      <h2 className="mb-2 text-lg font-semibold">Job not found</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        This job may have been deleted or the link is incorrect.
      </p>
      <Link href="/jobs">
        <Button variant="outline">Back to Jobs</Button>
      </Link>
    </div>
  );
}
