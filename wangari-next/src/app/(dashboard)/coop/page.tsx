"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Users, Plus, Copy, Check, ShieldCheck, UserPlus, Lock, Trash2, KeyRound } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/empty-state";
import { useToast } from "@/components/shared/toast";
import api from "@/lib/api-client";

/**
 * Co-op / group page (gap-analysis rows 11 + 17, GAP 4).
 *
 * The privacy promise is stated ON this page, in the farmer's terms, rather than
 * buried in a privacy policy: a chair sees how many members are recording and
 * the group totals, never a member's own figures. The backend enforces it —
 * these totals are COUNT and SUM aggregates computed in Postgres, and for small
 * groups they are suppressed entirely because a total of three can be undone by
 * subtraction.
 */

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } };

const ACTIVITY_LABEL: Record<string, { label: string; variant: any }> = {
  active: { label: "Recording", variant: "success" },
  quiet: { label: "Rarely", variant: "warning" },
  silent: { label: "Not yet", variant: "outline" },
};

export default function CoopPage() {
  const [groups, setGroups] = React.useState<any[]>([]);
  const [selected, setSelected] = React.useState<number | null>(null);
  const [detail, setDetail] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [showCreate, setShowCreate] = React.useState(false);
  const [showJoin, setShowJoin] = React.useState(false);
  const [showInvite, setShowInvite] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [invitePhones, setInvitePhones] = React.useState("");
  const [newInvites, setNewInvites] = React.useState<any[] | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);
  const { showToast, ToastComponent } = useToast();

  const [groupName, setGroupName] = React.useState("");
  const [county, setCounty] = React.useState("");
  const [joinCode, setJoinCode] = React.useState("");

  const loadGroups = React.useCallback(() => {
    api
      .get("/api/coop")
      .then((res) => {
        setGroups(Array.isArray(res?.groups) ? res.groups : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const loadDetail = React.useCallback((id: number) => {
    setSelected(id);
    api.get(`/api/coop/${id}`).then(setDetail).catch(() => setDetail(null));
  }, []);

  const createGroup = async () => {
    setBusy(true);
    try {
      const res = await api.post("/api/coop", { name: groupName.trim(), county: county.trim() || null });
      showToast("Group created", "success");
      setGroupName("");
      setCounty("");
      setShowCreate(false);
      loadGroups();
      if (res?.group?.id) loadDetail(res.group.id);
    } catch (err: any) {
      showToast(err?.message ?? "Could not create", "error");
    } finally {
      setBusy(false);
    }
  };

  const joinGroup = async () => {
    setBusy(true);
    try {
      const res = await api.post("/api/coop/join", { joinCode: joinCode.trim() });
      showToast(res.alreadyMember ? "You are already in this group" : `Joined ${res.groupName}`, "success");
      setJoinCode("");
      setShowJoin(false);
      loadGroups();
    } catch (err: any) {
      showToast(err?.message ?? "Could not join", "error");
    } finally {
      setBusy(false);
    }
  };

  const sendInvites = async () => {
    setBusy(true);
    setNewInvites(null);
    try {
      // Accepts commas, spaces or newlines: a chair will type these however the
      // list is written in front of them.
      const phones = invitePhones.split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean);
      const res = await api.post(`/api/coop/${selected}/invites`, { phones });
      setNewInvites([...(res?.invited ?? []), ...(res?.rejected ?? []).map((r: any) => ({ ...r, status: "rejected", reason: r.reason }))]);
      setInvitePhones("");
      loadDetail(selected!);
    } catch (err: any) {
      showToast(err?.message ?? "Could not send invites", "error");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (inviteId: number) => {
    try {
      await api.delete(`/api/coop/${selected}/invites/${inviteId}`);
      showToast("Invite revoked", "success");
      loadDetail(selected!);
    } catch {
      showToast("Could not revoke", "error");
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      showToast("Copy failed — write it down instead", "error");
    }
  };

  const isChair = detail?.group?.myRole === "chair";
  const agg = detail?.aggregate;

  return (
    <div className="space-y-6">
      {ToastComponent}
      <PageHeader
        title="Your group"
        description="Run a cooperative or SACCO group without seeing each other's private figures."
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowJoin((s) => !s)}>
              <KeyRound className="h-4 w-4" />
              Join
            </Button>
            <Button onClick={() => setShowCreate((s) => !s)}>
              <Plus className="h-4 w-4" />
              Create
            </Button>
          </div>
        }
      />

      {showJoin && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <Label htmlFor="join">Group code</Label>
            <Input
              id="join"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ABCD-1234"
              className="uppercase tracking-widest"
            />
            <Button onClick={joinGroup} disabled={busy || !joinCode.trim()}>
              Join group
            </Button>
          </CardContent>
        </Card>
      )}

      {showCreate && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="space-y-2">
              <Label htmlFor="gname">Group name</Label>
              <Input id="gname" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="e.g. Kiambu Dairy SACCO" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gcounty">County</Label>
              <Input id="gcounty" value={county} onChange={(e) => setCounty(e.target.value)} placeholder="Optional" />
            </div>
            <Button onClick={createGroup} disabled={busy || groupName.trim().length < 2}>
              Create group
            </Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="h-32 animate-pulse rounded-2xl bg-wangari-border/40" />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title="You are not in a group yet"
          description="Join your cooperative's group with the code your chairperson gives you, or start your own."
        />
      ) : (
        <>
          {groups.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => loadDetail(g.id)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                    selected === g.id
                      ? "bg-wangari-green-800 text-white"
                      : "border border-wangari-border bg-white text-wangari-muted"
                  }`}
                >
                  {g.name}
                </button>
              ))}
            </div>
          )}

          {groups.length === 1 && !selected && loadDetail(groups[0].id)}

          {detail && (
            <motion.div initial="hidden" animate="visible" variants={fadeUp} className="space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    {detail.group.name}
                    <Badge variant="outline">{detail.group.myRole}</Badge>
                  </CardTitle>
                  <CardDescription>{detail.health}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isChair && (
                    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-wangari-green-50 p-4">
                      <div className="flex-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-wangari-muted">Join code</p>
                        <p className="mt-0.5 font-mono text-lg font-bold tracking-widest text-wangari-heading">
                          {detail.group.joinCode}
                        </p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => copy(detail.group.joinCode)}>
                        {copied === detail.group.joinCode ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copied === detail.group.joinCode ? "Copied" : "Copy"}
                      </Button>
                    </div>
                  )}

                  {agg && (
                    <div className="grid gap-4 sm:grid-cols-3">
                      <Card>
                        <CardContent className="p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-wangari-muted">Members</p>
                          <p className="mt-1 text-2xl font-bold text-wangari-heading">{agg.memberCount}</p>
                          <p className="text-xs text-wangari-muted">{agg.activeMemberCount} recording</p>
                        </CardContent>
                      </Card>
                      {agg.suppressed ? (
                        <Card className="sm:col-span-2 border-wangari-border">
                          <CardContent className="p-4">
                            <p className="flex items-center gap-2 text-sm font-semibold text-wangari-heading">
                              <Lock className="h-4 w-4" />
                              Group totals hidden
                            </p>
                            <p className="mt-1 text-xs text-wangari-muted">{agg.suppressionReason}</p>
                          </CardContent>
                        </Card>
                      ) : (
                        <>
                          <Card>
                            <CardContent className="p-4">
                              <p className="text-xs font-semibold uppercase tracking-wide text-wangari-muted">
                                Animals
                              </p>
                              <p className="mt-1 text-2xl font-bold text-wangari-heading">
                                {detail.totals.animals.toLocaleString("en-KE")}
                              </p>
                            </CardContent>
                          </Card>
                          <Card>
                            <CardContent className="p-4">
                              <p className="text-xs font-semibold uppercase tracking-wide text-wangari-muted">
                                Value moved
                              </p>
                              <p className="mt-1 text-2xl font-bold text-wangari-heading">
                                KES {Number(detail.totals.expectedPay + detail.totals.sales).toLocaleString("en-KE")}
                              </p>
                            </CardContent>
                          </Card>
                        </>
                      )}
                    </div>
                  )}

                  {/* The privacy promise, stated where the numbers are. */}
                  <div className="flex items-start gap-2 rounded-xl border border-wangari-border bg-wangari-green-50/60 p-3">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-wangari-green-800" />
                    <p className="text-xs text-wangari-muted">
                      As chairperson you see how many members are recording and the group totals. You never see a
                      member&apos;s own deliveries, sales or finances.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {isChair && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <UserPlus className="h-5 w-5" />
                      Invite members
                    </CardTitle>
                    <CardDescription>
                      Enter their phone numbers. Each gets a code to type when they sign up — no email needed.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="phones">Phone numbers</Label>
                      <Input
                        id="phones"
                        value={invitePhones}
                        onChange={(e) => setInvitePhones(e.target.value)}
                        placeholder="0712 345 678, 0722 345 678"
                      />
                      <p className="text-xs text-wangari-muted">Separate them with commas or spaces.</p>
                    </div>
                    <Button onClick={sendInvites} disabled={busy || !invitePhones.trim()}>
                      {busy ? "Sending" : "Create invite codes"}
                    </Button>

                    {newInvites && newInvites.length > 0 && (
                      <div className="space-y-2 rounded-xl bg-wangari-green-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-wangari-muted">
                          Read these out at your meeting
                        </p>
                        {newInvites.map((i: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between rounded-lg bg-white px-3 py-2">
                            <span className="text-sm text-wangari-heading">
                              {i.phone ?? i.input}
                              {i.code && (
                                <span className="ml-3 font-mono font-bold tracking-widest">{i.code}</span>
                              )}
                            </span>
                            <span className="text-xs text-wangari-muted">
                              {i.status === "already_registered"
                                ? "Already on Wangari"
                                : i.status === "already_invited"
                                  ? "Code already sent"
                                  : i.status === "rejected"
                                    ? i.reason
                                    : "New code"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Members</CardTitle>
                  <CardDescription>
                    Who has joined, and whether they are recording. No member&apos;s figures.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(detail.members ?? []).length === 0 ? (
                    <p className="text-sm text-wangari-muted">No members yet.</p>
                  ) : (
                    detail.members.map((m: any) => (
                      <div key={m.farmId} className="flex items-center justify-between rounded-xl border border-wangari-border px-4 py-3">
                        <div>
                          <p className="font-medium text-wangari-heading">{m.farmName}</p>
                          {m.county && <p className="text-xs text-wangari-muted">{m.county}</p>}
                        </div>
                        <Badge variant={ACTIVITY_LABEL[m.activity]?.variant ?? "outline"}>
                          {ACTIVITY_LABEL[m.activity]?.label ?? m.activity}
                        </Badge>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}