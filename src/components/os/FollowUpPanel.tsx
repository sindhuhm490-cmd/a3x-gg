import { useMemo, useRef, useState } from "react";
import { useOs } from "@/lib/os/store";
import { next7Touches } from "@/lib/os/cadence";
import { WhyCaption } from "@/components/common/WhyCaption";
import { WHY } from "@/lib/os/why-registry";
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
import { Zap, Check, X, Send, Play } from "lucide-react";

export function FollowUpPanel({ leadId }: { leadId: string }) {
  // ─── Zustand selectors ───────────────────────────────────────────────────
  // IMPORTANT: Never call .filter() / .map() / .slice() inside a Zustand
  // selector. Those methods always return a NEW array reference, so Zustand's
  // Object.is comparison sees a change every single render and schedules
  // another render → infinite "Maximum update depth exceeded" loop.
  // Instead: select the raw array, then derive filtered values via useMemo.
  const touches = useOs((s) => s.touches);
  const allCommitments = useOs((s) => s.commitments);
  const seedCadence = useOs((s) => s.seedCadence);
  const markTouch = useOs((s) => s.markTouch);
  const skipTouch = useOs((s) => s.skipTouch);
  const runAutoDripsNow = useOs((s) => s.runAutoDripsNow);
  const automationMode = useOs((s) => s.automationMode);
  const setAutomationMode = useOs((s) => s.setAutomationMode);
  const addCommitment = useOs((s) => s.addCommitment);
  const resolveCommitment = useOs((s) => s.resolveCommitment);

  // ─── Stable derivations via useMemo ─────────────────────────────────────
  // nowRef: stable across renders — used only as the lower-bound for the
  // "next 7 touches" window. Never put in a dependency array.
  const nowRef = useRef(Date.now());

  const seven = useMemo(() => next7Touches(touches, leadId, nowRef.current), [touches, leadId]);

  const leadTouches = useMemo(() => touches.filter((t) => t.leadId === leadId), [touches, leadId]);

  const commitments = useMemo(
    () => allCommitments.filter((c) => c.leadId === leadId),
    [allCommitments, leadId],
  );

  const sent = useMemo(
    () => leadTouches.filter((t) => t.status !== "queued" && t.status !== "skipped").length,
    [leadTouches],
  );
  const total = leadTouches.length;

  // ─── Local form state ────────────────────────────────────────────────────
  const [promise, setPromise] = useState("");
  const [dueIn, setDueIn] = useState(2); // days

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Follow-Up Engine</h3>
        <Badge variant="outline" className="ml-auto">
          {sent}/{total || "0"} touches
        </Badge>
      </header>
      <WhyCaption {...WHY["os.followup.cadence"]} />

      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Automation:</span>
        <Select
          value={automationMode}
          onValueChange={(v) => setAutomationMode(v as typeof automationMode)}
        >
          <SelectTrigger className="w-40 h-7">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="aggressive">Aggressive · auto-send safe touches</SelectItem>
            <SelectItem value="hybrid">Hybrid · auto only for drips</SelectItem>
            <SelectItem value="assisted">Assisted · one-tap human send</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (total === 0) seedCadence(leadId, nowRef.current);
            const n = runAutoDripsNow(Date.now());
            if (n > 0) alert(`${n} auto-drip touch(es) sent.`);
          }}
        >
          <Play className="h-3 w-3 mr-1" />
          {total === 0 ? "Seed 90-day cadence" : "Run due auto-drips"}
        </Button>
      </div>

      {/* next 7 */}
      <div>
        <div className="text-xs font-semibold mb-1">Next 7 touches</div>
        {seven.length === 0 ? (
          <div className="text-xs text-muted-foreground rounded-md border border-dashed p-3">
            No queued touches. Seed the 90-day cadence to generate them.
          </div>
        ) : (
          <ol className="space-y-1 text-xs">
            {seven.map((t) => (
              <li key={t.id} className="rounded-md border p-2 flex items-center gap-2">
                <Badge variant="outline" className="uppercase">
                  {t.channel}
                </Badge>
                <span className="font-medium">{t.title}</span>
                <span className="text-muted-foreground ml-auto">
                  {new Date(t.scheduledAt).toLocaleDateString()}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  title="Sent"
                  onClick={() => markTouch(t.id, "sent")}
                >
                  <Send className="h-3 w-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  title="Replied +"
                  onClick={() => markTouch(t.id, "positive")}
                >
                  <Check className="h-3 w-3 text-success" />
                </Button>
                <Button size="icon" variant="ghost" title="Skip" onClick={() => skipTouch(t.id)}>
                  <X className="h-3 w-3" />
                </Button>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* commitments */}
      <div>
        <div className="text-xs font-semibold mb-1">Commitment ledger</div>
        <WhyCaption {...WHY["os.followup.commit"]} compact />
        <div className="mt-2 flex gap-1 text-xs">
          <Input
            placeholder='e.g. "will decide by Sunday"'
            value={promise}
            onChange={(e) => setPromise(e.target.value)}
          />
          <Input
            type="number"
            className="w-20"
            min={0}
            value={dueIn}
            onChange={(e) => setDueIn(+e.target.value)}
          />
          <Button
            size="sm"
            onClick={() => {
              if (!promise.trim()) return;
              addCommitment(leadId, promise, Date.now() + dueIn * 86400_000);
              setPromise("");
            }}
          >
            Log
          </Button>
        </div>
        <ul className="mt-2 space-y-1 text-xs">
          {commitments.length === 0 && (
            <li className="text-muted-foreground">No promises logged.</li>
          )}
          {commitments.map((c) => {
            const overdue = c.status === "pending" && c.dueAt < Date.now();
            return (
              <li
                key={c.id}
                className={`rounded border p-2 flex items-center gap-2 ${overdue ? "border-warning/50 bg-warning/5" : ""}`}
              >
                <span className="flex-1">&ldquo;{c.promise}&rdquo;</span>
                <span className="text-muted-foreground">
                  due {new Date(c.dueAt).toLocaleDateString()}
                </span>
                <Badge
                  variant={
                    c.status === "kept"
                      ? "default"
                      : c.status === "broken"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {c.status}
                </Badge>
                {c.status === "pending" && (
                  <>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => resolveCommitment(c.id, "kept")}
                    >
                      <Check className="h-3 w-3 text-success" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => resolveCommitment(c.id, "broken")}
                    >
                      <X className="h-3 w-3 text-destructive" />
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
