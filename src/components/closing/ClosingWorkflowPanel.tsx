// ClosingWorkflowPanel — compact per-lead closing pipeline tracker.
//
// Infinite-loop fixes applied here:
//
//   FIX 1 (EventTrail): Never call .filter()/.slice() inside a Zustand selector.
//   Those always return a NEW array reference → Zustand sees a "change" every
//   render → schedules another render → infinite loop.
//   Solution: select the raw entries array, derive filtered list via useMemo.
//
//   FIX 2 (ClosingWorkflowPanel): Never call a store action (set()) during the
//   render pass. The old code called ensure() inline in the selector fallback:
//       const wf = useClosingWorkflow((s) => s.workflows[leadId])
//                  ?? (() => ensure(leadId))();   ← calls set() during render!
//   set() triggers a re-render → render calls set() again → infinite loop.
//   Solution: select wf directly; call ensure() inside useEffect (after paint).
//   Guard all hook calls before the conditional return so Rules of Hooks hold.

import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { useAuditLog } from "@/lib/audit-log";
import {
  useClosingWorkflow,
  CLOSING_STAGES,
  STAGE_LABELS,
  NEXT_ACTION_BY_STAGE,
  getLeadHealth,
  nextStage,
  type ClosingStage,
} from "@/lib/closing/store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ChevronRight,
  History,
  User,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  leadId: string;
  leadName?: string;
}

// ─────────────────── Health badge ───────────────────

function HealthBadge({ nextActionAt }: { nextActionAt: string | undefined }) {
  const health = getLeadHealth(nextActionAt);
  if (health === "overdue")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
        <AlertTriangle className="h-3 w-3" /> OVERDUE
      </span>
    );
  if (health === "due-soon")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
        <Clock className="h-3 w-3" /> DUE SOON
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
      <CheckCircle2 className="h-3 w-3" /> ON TRACK
    </span>
  );
}

// ─────────────────── Stage progress bar ───────────────────

function StageBar({ current }: { current: ClosingStage }) {
  const currentIdx = CLOSING_STAGES.indexOf(current);
  return (
    <div className="flex items-center gap-0.5">
      {CLOSING_STAGES.map((s, i) => (
        <div key={s} className="flex items-center gap-0.5 min-w-0">
          <button
            type="button"
            title={STAGE_LABELS[s]}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-all",
              i < currentIdx && "bg-emerald-500",
              i === currentIdx && "bg-primary",
              i > currentIdx && "bg-muted",
            )}
            style={{ minWidth: 20 }}
          />
          {i < CLOSING_STAGES.length - 1 && (
            <ChevronRight className="h-2.5 w-2.5 shrink-0 text-muted-foreground/40" />
          )}
        </div>
      ))}
    </div>
  );
}

// ─────────────────── Next Best Action card ───────────────────

function NextBestAction({
  action,
  owner,
  dueAt,
}: {
  action: string;
  owner: string;
  dueAt: string;
}) {
  const time = new Date(dueAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <Card className="border-primary/30 bg-primary/5 p-3 space-y-0.5">
      <div className="flex items-center gap-1.5">
        <Zap className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
          Next Action
        </span>
      </div>
      <p className="text-sm font-semibold leading-tight">{action}</p>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <User className="h-3 w-3" />
        <span>Owner: {owner}</span>
        <Clock className="h-3 w-3 ml-1" />
        <span>Due: {time}</span>
      </div>
    </Card>
  );
}

// ─────────────────── Event trail ───────────────────

function EventTrail({ leadId }: { leadId: string }) {
  // Select the raw entries array — NOT a filtered/sliced derivative.
  // Any inline transformation inside a Zustand selector creates a new array
  // reference on every call → infinite re-render loop.
  const allEntries = useAuditLog((s) => s.entries);

  const entries = useMemo(
    () =>
      allEntries
        .filter(
          (e) =>
            e.entityType === "lead" && e.entityId === leadId && e.action.startsWith("closing-"),
        )
        .slice(0, 10),
    [allEntries, leadId],
  );

  if (entries.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">
        <History className="h-3 w-3" /> Event trail
      </div>
      <ol className="space-y-0.5">
        {entries.map((e) => (
          <li key={e.id} className="text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">{e.actorName}</span>
            {" · "}
            {e.summary}
            {" · "}
            {new Date(e.ts).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ─────────────────── Main panel ───────────────────

export function ClosingWorkflowPanel({ leadId, leadName }: Props) {
  // Select workflow state directly — no inline ensure() call.
  const wf = useClosingWorkflow((s) => s.workflows[leadId]);
  const ensure = useClosingWorkflow((s) => s.ensure);
  const setStage = useClosingWorkflow((s) => s.setStage);
  const setNextAction = useClosingWorkflow((s) => s.setNextAction);
  const setNextActionAt = useClosingWorkflow((s) => s.setNextActionAt);
  const setOwner = useClosingWorkflow((s) => s.setOwner);

  // Initialise the workflow row AFTER mount, not during render.
  // Calling ensure() (which calls Zustand set()) during the render pass
  // immediately schedules another render → infinite loop.
  useEffect(() => {
    ensure(leadId, leadName);
  }, [leadId, leadName, ensure]);

  // All hooks must be declared unconditionally — before any early return —
  // to satisfy the Rules of Hooks.
  const [editingAction, setEditingAction] = useState(false);
  const [actionDraft, setActionDraft] = useState("");
  const [showTrail, setShowTrail] = useState(false);

  // dueLabel depends on wf, so guard with a fallback string.
  const dueLabel = useMemo(() => {
    if (!wf) return "";
    const d = new Date(wf.nextActionAt);
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    return isToday
      ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString([], { day: "2-digit", month: "short" });
  }, [wf]);

  // wf is undefined on the very first render (before useEffect fires and
  // ensure() creates the row). Render a loader instead of crashing.
  if (!wf) {
    return <div className="py-4 text-center text-xs text-muted-foreground">Loading workflow…</div>;
  }

  const next = nextStage(wf.stage);
  const health = getLeadHealth(wf.nextActionAt);

  function handleAdvance() {
    if (!next) return;
    setStage(leadId, next, leadName);
    toast.success(`Moved to ${STAGE_LABELS[next]}`, {
      description: `Next action: ${NEXT_ACTION_BY_STAGE[next]}`,
    });
  }

  function handleSaveAction() {
    if (!actionDraft.trim()) return;
    setNextAction(leadId, actionDraft.trim(), leadName);
    setEditingAction(false);
    setActionDraft("");
    toast.success("Next action updated");
  }

  return (
    <div className="space-y-3">
      {/* Stage bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-[11px] font-semibold">
              {STAGE_LABELS[wf.stage]}
            </Badge>
            <HealthBadge nextActionAt={wf.nextActionAt} />
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {CLOSING_STAGES.indexOf(wf.stage) + 1} / {CLOSING_STAGES.length}
          </span>
        </div>
        <StageBar current={wf.stage} />
        <div className="flex flex-wrap gap-1 mt-0.5">
          {CLOSING_STAGES.map((s) => (
            <span
              key={s}
              className={cn(
                "text-[9px] px-1 py-0.5 rounded",
                s === wf.stage
                  ? "bg-primary/10 text-primary font-semibold"
                  : "text-muted-foreground",
              )}
            >
              {STAGE_LABELS[s]}
            </span>
          ))}
        </div>
      </div>

      {/* Next Best Action */}
      <NextBestAction action={wf.nextAction} owner={wf.owner} dueAt={wf.nextActionAt} />

      {/* Controls */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Stage
          </label>
          <Select
            value={wf.stage}
            onValueChange={(v) => setStage(leadId, v as ClosingStage, leadName)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CLOSING_STAGES.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">
                  {STAGE_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Owner
          </label>
          <Input
            className="h-8 text-xs"
            value={wf.owner}
            onChange={(e) => setOwner(leadId, e.target.value, leadName)}
            placeholder="Owner name"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Due</label>
          <Input
            type="datetime-local"
            className="h-8 text-xs"
            value={wf.nextActionAt.slice(0, 16)}
            onChange={(e) =>
              setNextActionAt(leadId, new Date(e.target.value).toISOString(), leadName)
            }
          />
        </div>

        <div className="flex items-end pb-0.5">
          <div className="text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">Due: </span>
            {dueLabel}
            {health === "overdue" && (
              <span className="ml-1 text-destructive font-medium">— overdue</span>
            )}
          </div>
        </div>
      </div>

      {/* Next action text */}
      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Next action
        </label>
        {editingAction ? (
          <div className="flex gap-1">
            <Input
              className="h-8 text-xs flex-1"
              value={actionDraft}
              onChange={(e) => setActionDraft(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleSaveAction()}
            />
            <Button size="sm" className="h-8" onClick={handleSaveAction}>
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={() => setEditingAction(false)}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <div
            className="flex items-center gap-2 cursor-pointer rounded-md border border-border bg-muted/40 px-2 py-1.5 text-xs hover:bg-muted"
            onClick={() => {
              setActionDraft(wf.nextAction);
              setEditingAction(true);
            }}
          >
            <span className="flex-1 truncate">{wf.nextAction}</span>
            <span className="text-[10px] text-muted-foreground shrink-0">edit</span>
          </div>
        )}
      </div>

      {next && (
        <Button className="w-full gap-1.5" size="sm" onClick={handleAdvance}>
          <ArrowRight className="h-3.5 w-3.5" />
          Move to {STAGE_LABELS[next]}
        </Button>
      )}
      {!next && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-600 text-center">
          ✓ Check-in complete — lead closed
        </div>
      )}

      <button
        type="button"
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        onClick={() => setShowTrail((v) => !v)}
      >
        <History className="h-3 w-3" />
        {showTrail ? "Hide history" : "Show history"}
      </button>
      {showTrail && <EventTrail leadId={leadId} />}
    </div>
  );
}
