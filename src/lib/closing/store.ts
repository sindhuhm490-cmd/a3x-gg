// Closing Workflow store — per-lead stage tracker for the 6-step closing pipeline.
//
// Persistence pattern mirrors e2eplus/store.ts:
//   • Local-first via Zustand persist (instantaneous UI)
//   • Write-through to Supabase audit_logs table (append-only event trail)
//   • Uses existing `useAuditLog` client store for in-app event history
//
// No new database tables needed — audit_logs already exists.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useAuditLog } from "@/lib/audit-log";
import { logAction } from "@/lib/monitoring/activity-store";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (t: string) => any };

// ─────────────────────── Types ───────────────────────────

export const CLOSING_STAGES = [
  "post-tour",
  "decision",
  "quote",
  "booking",
  "payment",
  "check-in",
] as const;

export type ClosingStage = (typeof CLOSING_STAGES)[number];

export const STAGE_LABELS: Record<ClosingStage, string> = {
  "post-tour": "Post-Tour",
  decision: "Decision",
  quote: "Quote",
  booking: "Booking",
  payment: "Payment",
  "check-in": "Check-in",
};

// Next Best Action — deterministic rules per stage
export const NEXT_ACTION_BY_STAGE: Record<ClosingStage, string> = {
  "post-tour": "Send post-tour summary via WhatsApp",
  decision: "Call to understand decision blockers",
  quote: "Send revised quote with deposit breakdown",
  booking: "Confirm booking amount and room number",
  payment: "Follow up on payment reference",
  "check-in": "Confirm KYC and agreement completion",
};

// Lead health thresholds (minutes)
const OVERDUE_AFTER_MIN = 0;
const DUE_SOON_WITHIN_MIN = 60;

export type LeadHealth = "on-track" | "due-soon" | "overdue";

export function getLeadHealth(nextActionAt: string | undefined): LeadHealth {
  if (!nextActionAt) return "on-track";
  const diff = new Date(nextActionAt).getTime() - Date.now();
  const diffMin = diff / 60_000;
  if (diffMin < OVERDUE_AFTER_MIN) return "overdue";
  if (diffMin <= DUE_SOON_WITHIN_MIN) return "due-soon";
  return "on-track";
}

export interface ClosingWorkflowState {
  leadId: string;
  stage: ClosingStage;
  owner: string; // display name of owner
  nextAction: string; // free-text override, or from NEXT_ACTION_BY_STAGE
  nextActionAt: string; // ISO deadline
  updatedAt: string;
}

// ─────────────────────── Supabase helpers ─────────────────────────

/** Append one entry to the server-side audit_logs (fire and forget). */
function appendAuditLog(opts: {
  actor: string;
  entity: string;
  entityId: string;
  action: string;
  prev?: unknown;
  next?: unknown;
  reason?: string;
}) {
  void (async () => {
    try {
      await db.from("audit_logs").insert({
        actor: opts.actor,
        entity: opts.entity,
        entity_id: opts.entityId,
        action: opts.action,
        prev: opts.prev ?? null,
        next: opts.next ?? null,
        reason: opts.reason ?? null,
      });
    } catch (e) {
      console.error("closing/store: audit_log write failed", e);
    }
  })();
}

// ─────────────────────── Store ─────────────────────────

interface ClosingStore {
  workflows: Record<string, ClosingWorkflowState>; // leadId → state
  me: { id: string; name: string };
  setMe: (me: { id: string; name: string }) => void;

  /** Ensure a workflow exists for a lead (idempotent). */
  ensure: (leadId: string, leadName?: string) => ClosingWorkflowState;

  /** Advance or change stage. */
  setStage: (leadId: string, stage: ClosingStage, leadName?: string) => void;

  /** Update next action text. */
  setNextAction: (leadId: string, action: string, leadName?: string) => void;

  /** Update the deadline. */
  setNextActionAt: (leadId: string, isoAt: string, leadName?: string) => void;

  /** Reassign owner. */
  setOwner: (leadId: string, owner: string, leadName?: string) => void;

  /** One-shot patch for multiple fields at once. */
  patch: (
    leadId: string,
    patch: Partial<Pick<ClosingWorkflowState, "stage" | "nextAction" | "nextActionAt" | "owner">>,
    leadName?: string,
    reason?: string,
  ) => void;
}

const now = () => new Date().toISOString();

const defaultWorkflow = (leadId: string): ClosingWorkflowState => ({
  leadId,
  stage: "post-tour",
  owner: "Me",
  nextAction: NEXT_ACTION_BY_STAGE["post-tour"],
  nextActionAt: new Date(Date.now() + 60 * 60_000).toISOString(), // 1h from now
  updatedAt: now(),
});

export const useClosingWorkflow = create<ClosingStore>()(
  persist(
    (set, get) => ({
      workflows: {},
      me: { id: "me", name: "Me" },

      setMe: (me) => set({ me }),

      ensure: (leadId, _leadName) => {
        const existing = get().workflows[leadId];
        if (existing) return existing;
        const fresh = defaultWorkflow(leadId);
        set((s) => ({ workflows: { ...s.workflows, [leadId]: fresh } }));
        return fresh;
      },

      setStage: (leadId, stage, leadName) => {
        const prev = get().workflows[leadId] ?? defaultWorkflow(leadId);
        const next: ClosingWorkflowState = {
          ...prev,
          stage,
          nextAction: NEXT_ACTION_BY_STAGE[stage],
          updatedAt: now(),
        };
        set((s) => ({ workflows: { ...s.workflows, [leadId]: next } }));

        const actor = get().me.name;
        const summary = `Stage → ${STAGE_LABELS[stage]}`;

        // Client audit log
        useAuditLog.getState().log({
          actorId: get().me.id,
          actorName: actor,
          entityType: "lead",
          entityId: leadId,
          action: "closing-stage-changed",
          before: prev.stage,
          after: stage,
          summary: leadName ? `${leadName} · ${summary}` : summary,
        });

        // Monitoring store
        logAction({
          userId: get().me.id,
          userName: actor,
          leadId,
          leadName,
          action: "closing-stage-changed",
          feature: "closing-workflow",
          stageFrom: prev.stage,
          stageTo: stage,
        });

        // Supabase audit_logs
        appendAuditLog({
          actor,
          entity: "closing_workflow",
          entityId: leadId,
          action: "stage-changed",
          prev: { stage: prev.stage },
          next: { stage },
          reason: leadName,
        });
      },

      setNextAction: (leadId, action, leadName) => {
        const prev = get().workflows[leadId] ?? defaultWorkflow(leadId);
        const next = { ...prev, nextAction: action, updatedAt: now() };
        set((s) => ({ workflows: { ...s.workflows, [leadId]: next } }));

        const actor = get().me.name;
        const summary = `Next action → "${action}"`;

        useAuditLog.getState().log({
          actorId: get().me.id,
          actorName: actor,
          entityType: "lead",
          entityId: leadId,
          action: "closing-next-action-set",
          before: prev.nextAction,
          after: action,
          summary: leadName ? `${leadName} · ${summary}` : summary,
        });

        appendAuditLog({
          actor,
          entity: "closing_workflow",
          entityId: leadId,
          action: "next-action-set",
          prev: { nextAction: prev.nextAction },
          next: { nextAction: action },
          reason: leadName,
        });
      },

      setNextActionAt: (leadId, isoAt, leadName) => {
        const prev = get().workflows[leadId] ?? defaultWorkflow(leadId);
        const next = { ...prev, nextActionAt: isoAt, updatedAt: now() };
        set((s) => ({ workflows: { ...s.workflows, [leadId]: next } }));

        const actor = get().me.name;
        const summary = `Deadline → ${new Date(isoAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

        useAuditLog.getState().log({
          actorId: get().me.id,
          actorName: actor,
          entityType: "lead",
          entityId: leadId,
          action: "closing-deadline-set",
          before: prev.nextActionAt,
          after: isoAt,
          summary: leadName ? `${leadName} · ${summary}` : summary,
        });

        appendAuditLog({
          actor,
          entity: "closing_workflow",
          entityId: leadId,
          action: "deadline-set",
          prev: { nextActionAt: prev.nextActionAt },
          next: { nextActionAt: isoAt },
          reason: leadName,
        });
      },

      setOwner: (leadId, owner, leadName) => {
        const prev = get().workflows[leadId] ?? defaultWorkflow(leadId);
        const next = { ...prev, owner, updatedAt: now() };
        set((s) => ({ workflows: { ...s.workflows, [leadId]: next } }));

        const actor = get().me.name;
        const summary = `Owner → ${owner}`;

        useAuditLog.getState().log({
          actorId: get().me.id,
          actorName: actor,
          entityType: "lead",
          entityId: leadId,
          action: "closing-owner-changed",
          before: prev.owner,
          after: owner,
          summary: leadName ? `${leadName} · ${summary}` : summary,
        });

        appendAuditLog({
          actor,
          entity: "closing_workflow",
          entityId: leadId,
          action: "owner-changed",
          prev: { owner: prev.owner },
          next: { owner },
          reason: leadName,
        });
      },

      patch: (leadId, patch, leadName, reason) => {
        const prev = get().workflows[leadId] ?? defaultWorkflow(leadId);
        const next: ClosingWorkflowState = { ...prev, ...patch, updatedAt: now() };
        set((s) => ({ workflows: { ...s.workflows, [leadId]: next } }));

        const actor = get().me.name;
        const changed = Object.keys(patch).join(", ");
        const summary = `Updated: ${changed}`;

        useAuditLog.getState().log({
          actorId: get().me.id,
          actorName: actor,
          entityType: "lead",
          entityId: leadId,
          action: "closing-workflow-updated",
          before: patch,
          after: next,
          summary: leadName ? `${leadName} · ${summary}` : summary,
        });

        logAction({
          userId: get().me.id,
          userName: actor,
          leadId,
          leadName,
          action: "closing-workflow-updated",
          feature: "closing-workflow",
          remarks: reason,
        });

        appendAuditLog({
          actor,
          entity: "closing_workflow",
          entityId: leadId,
          action: "workflow-patched",
          prev: prev as unknown,
          next: next as unknown,
          reason: reason ?? leadName,
        });
      },
    }),
    { name: "gharpayy-closing-workflow-v1" },
  ),
);

// ─────────────────────── Pure helpers ─────────────────────────

export function stageIndex(stage: ClosingStage): number {
  return CLOSING_STAGES.indexOf(stage);
}

export function nextStage(stage: ClosingStage): ClosingStage | null {
  const idx = stageIndex(stage);
  return idx < CLOSING_STAGES.length - 1 ? CLOSING_STAGES[idx + 1] : null;
}
