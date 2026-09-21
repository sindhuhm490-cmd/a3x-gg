import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useApp } from "@/lib/store";
import { useOs } from "@/lib/os/store";
import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WhyCaption, WhySectionBanner } from "@/components/common/WhyCaption";
import { WHY } from "@/lib/os/why-registry";
import { MultiPersonPanel } from "@/components/os/MultiPersonPanel";
import { RevivalPanel } from "@/components/os/RevivalPanel";
import { FollowUpPanel } from "@/components/os/FollowUpPanel";
import { ScenarioLibraryPanel } from "@/components/os/ScenarioLibraryPanel";
import { ClosingWorkflowPanel } from "@/components/closing/ClosingWorkflowPanel";
import { Cpu } from "lucide-react";

export const Route = createFileRoute("/os")({
  head: () => ({
    meta: [
      { title: "Closing OS — Gharpayy" },
      {
        name: "description",
        content:
          "AI Closing Operating System: multi-person decision network, unlimited revival cycles, 90-day follow-up engine, and 150+ scenario packs.",
      },
    ],
  }),
  component: OsPage,
});

function OsPage() {
  const { leads, selectedLeadId, selectLead } = useApp();
  const groups = useOs((s) => s.groups);
  const cycles = useOs((s) => s.cycles);
  const touches = useOs((s) => s.touches);
  const commitments = useOs((s) => s.commitments);

  const [leadId, setLeadId] = useState<string>(selectedLeadId ?? leads[0]?.id ?? "");
  const lead = leads.find((l) => l.id === leadId);

  const stats = useMemo(
    () => ({
      totalGroups: Object.keys(groups).length,
      totalPeople: Object.values(groups).reduce((s, g) => s + g.people.length, 0),
      activeCycles: cycles.filter((c) => c.outcome === "active").length,
      totalCycles: cycles.length,
      queuedTouches: touches.filter((t) => t.status === "queued").length,
      pendingPromises: commitments.filter((c) => c.status === "pending").length,
      brokenPromises: commitments.filter((c) => c.status === "broken").length,
    }),
    [groups, cycles, touches, commitments],
  );

  return (
    <AppShell>
      <div className="p-4 md:p-6 space-y-4">
        <header className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Cpu className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold leading-tight">Closing OS</h1>
            <p className="text-xs text-muted-foreground">
              Multi-person · Revival cycles · Follow-up engine · Scenario library · WhyCaption 2.0
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Lead</span>
            <Select
              value={leadId}
              onValueChange={(v) => {
                setLeadId(v);
                selectLead(v);
              }}
            >
              <SelectTrigger className="w-56">
                <SelectValue placeholder="pick lead" />
              </SelectTrigger>
              <SelectContent>
                {leads.slice(0, 40).map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name} · {l.phone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </header>

        <div className="grid gap-2 md:grid-cols-4">
          {[
            {
              label: "Groups mapped",
              value: stats.totalGroups,
              sub: `${stats.totalPeople} people`,
            },
            {
              label: "Revival cycles",
              value: stats.totalCycles,
              sub: `${stats.activeCycles} active`,
            },
            { label: "Queued touches", value: stats.queuedTouches, sub: "90-day cadence" },
            {
              label: "Commitments",
              value: stats.pendingPromises,
              sub: `${stats.brokenPromises} broken`,
            },
          ].map((k) => (
            <Card key={k.label}>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">
                  {k.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{k.value}</div>
                <div className="text-[10px] text-muted-foreground">{k.sub}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <WhySectionBanner title="Closing OS" {...WHY["os.why.always"]} />

        <Tabs defaultValue="people" className="w-full">
          <TabsList className="grid grid-cols-5 w-full max-w-2xl">
            <TabsTrigger value="workflow">Workflow</TabsTrigger>
            <TabsTrigger value="people">People</TabsTrigger>
            <TabsTrigger value="revival">Revival</TabsTrigger>
            <TabsTrigger value="followup">Follow-up</TabsTrigger>
            <TabsTrigger value="scenarios">Scenarios</TabsTrigger>
          </TabsList>

          <TabsContent value="workflow" className="mt-3">
            <Card>
              <CardContent className="pt-4">
                {lead ? (
                  <ClosingWorkflowPanel leadId={lead.id} leadName={lead.name} />
                ) : (
                  <p className="text-sm text-muted-foreground">Pick a lead above.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="people" className="mt-3">
            <Card>
              <CardContent className="pt-4">
                {lead ? (
                  <MultiPersonPanel leadId={lead.id} />
                ) : (
                  <p className="text-sm text-muted-foreground">Pick a lead above.</p>
                )}
                {lead && (
                  <div className="mt-3 text-[11px] text-muted-foreground">
                    Lead: <Badge variant="outline">{lead.name}</Badge> · {lead.phone}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="revival" className="mt-3">
            <Card>
              <CardContent className="pt-4">
                {lead ? (
                  <RevivalPanel leadId={lead.id} />
                ) : (
                  <p className="text-sm text-muted-foreground">Pick a lead above.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="followup" className="mt-3">
            <Card>
              <CardContent className="pt-4">
                {lead ? (
                  <FollowUpPanel leadId={lead.id} />
                ) : (
                  <p className="text-sm text-muted-foreground">Pick a lead above.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="scenarios" className="mt-3">
            <Card>
              <CardContent className="pt-4">
                <ScenarioLibraryPanel />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
