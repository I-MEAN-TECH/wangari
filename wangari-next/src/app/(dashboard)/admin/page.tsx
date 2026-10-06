"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Users, CreditCard, TrendingUp, DollarSign, Search, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/page-header";
import api from "@/lib/api-client";

import { useAuth } from "@/hooks/useAuth";
import { ShieldAlert } from "lucide-react";
import { ActivationFunnelCard } from "@/components/admin/ActivationFunnelCard";

const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

export default function AdminPage() {
  const { role } = useAuth();
  const [users, setUsers] = React.useState<any[]>([]);
  const [subs, setSubs] = React.useState<any[]>([]);
  const [stats, setStats] = React.useState({ totalUsers: 0, activeSubs: 0, trialUsers: 0, revenue: 0 });
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");

  React.useEffect(() => {
    if (role !== "super_admin") {
      setLoading(false);
      return;
    }
    Promise.allSettled([
      api.get("/api/admin/users"),
      api.get("/api/admin/subscriptions"),
    ]).then(([u, s]) => {
      if (u.status === "fulfilled" && u.value) {
        const userList = Array.isArray(u.value) ? u.value : u.value.users || [];
        setUsers(userList);
        setStats(prev => ({ ...prev, totalUsers: userList.length }));
      }
      if (s.status === "fulfilled" && s.value) {
        const subList = Array.isArray(s.value) ? s.value : s.value.subscriptions || [];
        setSubs(subList);
        const active = subList.filter((s: any) => s.status === "active").length;
        const revenue = subList.reduce((sum: number, s: any) => sum + (s.amount || 0), 0);
        setStats(prev => ({ ...prev, activeSubs: active, revenue }));
      }
    }).finally(() => setLoading(false));
  }, [role]);

  if (role !== "super_admin") {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4 text-center">
        <ShieldAlert className="h-12 w-12 text-wangari-red-500" />
        <h2 className="text-xl font-extrabold text-wangari-heading">Access Restricted</h2>
        <p className="text-sm text-wangari-muted max-w-sm">
          This system admin panel is restricted strictly to Wangari System Super Administrators.
        </p>
      </div>
    );
  }

  const trialUsers = users.filter((u: any) => {
    if (!u.trialEndsAt) return false;
    return new Date(u.trialEndsAt) > new Date();
  }).length;

  const filtered = users.filter((u: any) =>
    !search || u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wangari-green-800" /></div>;

  return (
    <div className="space-y-6">
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <PageHeader title="Admin Dashboard" description="Users, subscriptions, and revenue" />
      </motion.div>

      {/* KPIs */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: "Total Users", value: stats.totalUsers, icon: <Users className="h-5 w-5" />, color: "bg-wangari-green-800" },
          { title: "Active Subs", value: stats.activeSubs, icon: <CreditCard className="h-5 w-5" />, color: "bg-wangari-green-500" },
          { title: "Free Trials", value: trialUsers, icon: <TrendingUp className="h-5 w-5" />, color: "bg-wangari-blue-500" },
          { title: "Revenue", value: `KES ${stats.revenue.toLocaleString()}`, icon: <DollarSign className="h-5 w-5" />, color: "bg-wangari-amber-500" },
        ].map(kpi => (
          <Card key={kpi.title} className="border border-wangari-border">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-tone-good-bg text-wangari-green-800 mb-2">{kpi.icon}</div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-wangari-muted">{kpi.title}</p>
              <p className="text-xl font-extrabold text-wangari-heading">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      {/* Activation funnel — the measurement the next build decisions rest on.
          Sits above the user table deliberately: users and revenue tell us what
          already happened, this tells us why the next one will or won't. */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <ActivationFunnelCard />
      </motion.div>

      {/* Users table */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <Card className="border border-wangari-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-wangari-heading">Users ({filtered.length})</h3>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-wangari-subtle" />
                <Input placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-xs" />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-wangari-border">
                    <th className="text-left py-2 px-3 font-semibold text-wangari-muted">Name</th>
                    <th className="text-left py-2 px-3 font-semibold text-wangari-muted">Email</th>
                    <th className="text-left py-2 px-3 font-semibold text-wangari-muted">Status</th>
                    <th className="text-left py-2 px-3 font-semibold text-wangari-muted">Trial Ends</th>
                    <th className="text-left py-2 px-3 font-semibold text-wangari-muted">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u: any) => {
                    const trialActive = u.trialEndsAt && new Date(u.trialEndsAt) > new Date();
                    const sub = subs.find((s: any) => s.userId === u.id && s.status === "active");
                    return (
                      <tr key={u.id} className="border-b border-wangari-sunken hover:bg-tone-neutral-bg">
                        <td className="py-2.5 px-3 font-medium text-wangari-heading">{u.name}</td>
                        <td className="py-2.5 px-3 text-wangari-muted">{u.email}</td>
                        <td className="py-2.5 px-3">
                          {sub ? <Badge className="bg-wangari-green-50 text-wangari-green-800 border-wangari-green-200">{sub.planName}</Badge>
                            : trialActive ? <Badge className="bg-wangari-blue-50 text-badge-blue-text border-wangari-blue-200">Trial</Badge>
                            : <Badge className="bg-wangari-gray-50 text-wangari-gray-500 border-wangari-border">None</Badge>}
                        </td>
                        <td className="py-2.5 px-3 text-wangari-muted">{u.trialEndsAt ? new Date(u.trialEndsAt).toLocaleDateString() : "—"}</td>
                        <td className="py-2.5 px-3 text-wangari-muted">{new Date(u.createdAt).toLocaleDateString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
