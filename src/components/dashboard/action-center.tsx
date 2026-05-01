"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  Inbox,
  DollarSign,
  Plus,
  Check,
  X,
  Loader2,
  UserX,
  MessageSquareQuote,
  FileText,
  MapPin,
  Gift,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createTask, resolveTask, type Task } from "@/lib/actions/tasks";
import { TONE_CLASSES, type Tone } from "@/lib/ui/alert-tone";

interface NeedsAttention {
  unassignedJobs: number;
  quoteRequests: number;
  pendingEstimates: number;
  parkingLeads: number;
  awaitingPayments: number;
  parkingSpecials: number;
}

interface ActionCenterProps {
  tasks: Task[];
  needsAttention: NeedsAttention;
}

export function ActionCenter({
  tasks,
  needsAttention,
}: ActionCenterProps) {
  const attentionTotal =
    needsAttention.unassignedJobs +
    needsAttention.quoteRequests +
    needsAttention.pendingEstimates +
    needsAttention.parkingLeads +
    needsAttention.awaitingPayments +
    needsAttention.parkingSpecials;
  const totalActions = tasks.length + attentionTotal;

  return (
    <section>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-md grid place-items-center border bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900 flex-none">
            <Inbox className="h-4 w-4" />
          </span>
          <h2 className="text-base font-bold tracking-tight text-stone-900 dark:text-stone-50">
            Action Center
          </h2>
          {totalActions > 0 && (
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 tabular-nums">
              {totalActions}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <NeedsAttentionCards attention={needsAttention} />
      </div>

      <div className="mt-3">
        <TasksCard tasks={tasks} />
      </div>
    </section>
  );
}

// ─── Needs Attention — alert cards ─────────────────────────────

interface AlertSpec {
  key: keyof NeedsAttention;
  count: number;
  label: string;
  descriptor: string;
  href: string;
  icon: LucideIcon;
  tone: Tone;
}

function NeedsAttentionCards({ attention }: { attention: NeedsAttention }) {
  const specs: AlertSpec[] = [
    {
      key: "unassignedJobs",
      count: attention.unassignedJobs,
      label: "Unassigned",
      descriptor: "Active jobs without a tech",
      href: "/inbox?tab=unassigned",
      icon: UserX,
      tone: "amber",
    },
    {
      key: "quoteRequests",
      count: attention.quoteRequests,
      label: "Quote Requests",
      descriptor: "Need an estimate created",
      href: "/inbox?tab=quotes",
      icon: MessageSquareQuote,
      tone: "blue",
    },
    {
      key: "pendingEstimates",
      count: attention.pendingEstimates,
      label: "Estimates Sent",
      descriptor: "Awaiting customer reply",
      href: "/inbox?tab=estimates",
      icon: FileText,
      tone: "indigo",
    },
    {
      key: "parkingLeads",
      count: attention.parkingLeads,
      label: "Parking Leads",
      descriptor: "Service interest from parkers",
      href: "/inbox?tab=parking",
      icon: MapPin,
      tone: "emerald",
    },
    {
      key: "awaitingPayments",
      count: attention.awaitingPayments,
      label: "Awaiting Payment",
      descriptor: "Complete jobs not yet paid",
      href: "/inbox?tab=payments",
      icon: DollarSign,
      tone: "red",
    },
    {
      key: "parkingSpecials",
      count: attention.parkingSpecials,
      label: "Specials Pending",
      descriptor: "Parked, no specials text sent",
      href: "/inbox?tab=parking",
      icon: Gift,
      tone: "violet",
    },
  ];

  const visible = specs.filter((s) => s.count > 0);

  return (
    <>
      {visible.map((spec) => (
        <AlertCard key={spec.key} spec={spec} />
      ))}
    </>
  );
}

function AlertCard({ spec }: { spec: AlertSpec }) {
  const tone = TONE_CLASSES[spec.tone];
  const Icon = spec.icon;
  return (
    <Link
      href={spec.href}
      className={cn(
        "group relative flex h-full items-center gap-3 rounded-md border px-3 py-2.5 shadow-card transition-colors",
        tone.card
      )}
    >
      <span aria-hidden className={cn("absolute left-0 top-2 bottom-2 w-[3px] rounded-r", tone.bar)} />
      <span
        className={cn(
          "w-8 h-8 rounded-md grid place-items-center border flex-none",
          tone.tile
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className={cn("font-mono tabular-nums text-lg font-bold leading-none", tone.count)}>
            {spec.count}
          </span>
          <span className="text-sm font-semibold text-stone-900 dark:text-stone-50 truncate">
            {spec.label}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-stone-600 dark:text-stone-400 truncate">{spec.descriptor}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-stone-400 dark:text-stone-500 group-hover:text-stone-700 dark:group-hover:text-stone-300 transition-colors flex-none" />
    </Link>
  );
}

// ─── Tasks ─────────────────────────────────────────────────────

function TasksCard({ tasks, className }: { tasks: Task[]; className?: string }) {
  const [adding, setAdding] = useState(false);

  return (
    <div
      className={cn(
        "bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card flex flex-col",
        className
      )}
    >
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-stone-200 dark:border-stone-800">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-base font-semibold tracking-tight text-stone-900 dark:text-stone-50">
            Tasks
          </h3>
          {tasks.length > 0 && (
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 tabular-nums">
              {tasks.length}
            </span>
          )}
        </div>
        <Button
          size="xs"
          variant={adding ? "ghost" : "default"}
          onClick={() => setAdding((v) => !v)}
        >
          <Plus className="h-3 w-3" />
          New
        </Button>
      </header>

      <div className="flex-1 px-4 py-3">
        {adding && <NewTaskForm onClose={() => setAdding(false)} />}

        {tasks.length === 0 && !adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="w-full py-6 text-center text-sm text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
          >
            Nothing on your list. Click <span className="font-semibold">New</span> to jot something down.
          </button>
        ) : (
          <ul className="divide-y divide-stone-200 dark:divide-stone-800">
            {tasks.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function NewTaskForm({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);

  function submit() {
    if (submitting) return;
    const trimmed = title.trim();
    if (!trimmed) {
      onClose();
      return;
    }
    setSubmitting(true);
    startTransition(async () => {
      try {
        const result = await createTask(trimmed);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setTitle("");
        onClose();
      } catch {
        toast.error("Could not create task. Try again.");
      } finally {
        setSubmitting(false);
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-center gap-2 mb-3 pb-3 border-b border-stone-200 dark:border-stone-800"
    >
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        placeholder="What needs doing?"
        className="h-8 text-sm flex-1"
        disabled={pending || submitting}
      />
      <Button type="submit" size="xs" disabled={pending || submitting}>
        {pending || submitting ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Check className="h-3 w-3" />
        )}
      </Button>
      <Button
        type="button"
        size="xs"
        variant="ghost"
        onClick={onClose}
        disabled={pending || submitting}
      >
        <X className="h-3 w-3" />
      </Button>
    </form>
  );
}

function TaskRow({ task }: { task: Task }) {
  const [pending, startTransition] = useTransition();

  function handleResolve() {
    startTransition(async () => {
      try {
        const result = await resolveTask(task.id);
        if (!result.ok) toast.error(result.error);
      } catch {
        toast.error("Could not resolve task. Try again.");
      }
    });
  }

  return (
    <li className="flex items-center gap-3 py-2.5">
      <button
        type="button"
        onClick={handleResolve}
        disabled={pending}
        aria-label={`Resolve task: ${task.title}`}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-stone-300 dark:border-stone-700 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors disabled:opacity-50"
      >
        {pending && <Loader2 className="h-3 w-3 animate-spin text-stone-500" />}
      </button>
      <span className="flex-1 min-w-0 text-sm text-stone-800 dark:text-stone-200">
        {task.title}
      </span>
    </li>
  );
}

