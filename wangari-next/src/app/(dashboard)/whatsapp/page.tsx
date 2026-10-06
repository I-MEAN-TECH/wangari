"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { MessageCircle, PhoneCall, Bot, Copy, Clock, ShieldCheck, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import api from "@/lib/api-client";

const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

const COMMANDS = [
  { cmd: "eggs 50", desc: "Record 50 eggs harvest" },
  { cmd: "milk 10", desc: "Record 10 Litres milked" },
  { cmd: "mortality 3", desc: "Record 3 animal deaths" },
  { cmd: "stock", desc: "Check current feed & inventory" },
  { cmd: "feed", desc: "View feed consumption balance" },
  { cmd: "sales", desc: "View today's sales summary" },
  { cmd: "summary", desc: "Get overall farm daily report" },
  { cmd: "help", desc: "Show all commands" },
];

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "https://api.wangari.imeantech.com";

export default function WhatsAppPage() {
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [copied, setCopied] = React.useState(false);
  const webhookUrl = `${API_BASE}/api/whatsapp/webhook`;

  React.useEffect(() => {
    api.get("/api/whatsapp")
      .then((d: any) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wangari-green-800" /></div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <PageHeader
          title="Multi-Channel Mobile Access (WhatsApp & USSD)"
          description="Built-in platform service for farmers & workers who use mobile phones without continuous internet access"
        />
      </motion.div>

      {/* 2 Channel Overview Cards: WhatsApp & USSD */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="grid md:grid-cols-2 gap-4">
        {/* WhatsApp Channel */}
        <Card className="border border-wangari-green-200 bg-wangari-green-50/40 rounded-3xl p-5 shadow-xs">
          <CardContent className="p-0 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#25D366] text-white">
                <MessageCircle className="h-6 w-6" />
              </div>
              <Badge className="bg-wangari-amber-100 text-wangari-amber-800 border-tone-warn-border font-bold text-xs">
                Coming Soon / Beta
              </Badge>
            </div>
            <div>
              <h3 className="text-lg font-black text-wangari-heading">WhatsApp Bot Service</h3>
              <p className="text-xs text-wangari-muted mt-1 leading-relaxed">
                Log farm output, check feed inventory, and get daily summaries directly on WhatsApp. No laptop required.
              </p>
            </div>
            <div className="pt-2 border-t border-wangari-green-200/60 flex items-center justify-between text-xs font-bold text-wangari-green-800">
              <span>WhatsApp Cloud API</span>
              <span>Setup in progress</span>
            </div>
          </CardContent>
        </Card>

        {/* USSD Channel */}
        <Card className="border border-wangari-sky-200 bg-wangari-sky-50/40 rounded-3xl p-5 shadow-xs">
          <CardContent className="p-0 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-wangari-sky-600 text-white">
                <PhoneCall className="h-6 w-6" />
              </div>
              <Badge className="bg-wangari-amber-100 text-wangari-amber-800 border-tone-warn-border font-bold text-xs">
                Coming Soon
              </Badge>
            </div>
            <div>
              <h3 className="text-lg font-black text-wangari-heading">USSD Shortcode (*384*55#)</h3>
              <p className="text-xs text-wangari-muted mt-1 leading-relaxed">
                Dial shortcode on any basic feature phone (no smartphone/data needed) to log eggs, milk, and view tasks.
              </p>
            </div>
            <div className="pt-2 border-t border-wangari-sky-200/60 flex items-center justify-between text-xs font-bold text-wangari-sky-800">
              <span>Shortcode: *384*55#</span>
              <span>Telco Integration</span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* WhatsApp Commands Reference */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <Card className="border border-wangari-border rounded-3xl">
          <CardContent className="p-6">
            <h3 className="text-sm font-bold text-wangari-heading mb-1 flex items-center gap-2">
              <Bot className="h-4 w-4 text-wangari-green-800" /> Available Text Commands
            </h3>
            <p className="text-xs text-wangari-muted mb-4">
              When WhatsApp Bot goes live, workers can log data by texting these quick commands:
            </p>
            <div className="grid sm:grid-cols-2 gap-2">
              {COMMANDS.map(c => (
                <div key={c.cmd} className="flex items-center gap-3 p-3 rounded-2xl bg-tone-neutral-bg border border-wangari-border hover:bg-wangari-green-50 transition-colors">
                  <div className="flex-1">
                    <code className="text-xs font-bold text-wangari-green-800 bg-wangari-green-50 px-2 py-0.5 rounded border border-wangari-green-200">
                      {c.cmd}
                    </code>
                    <p className="text-[11px] text-wangari-muted mt-1">{c.desc}</p>
                  </div>
                  <button onClick={() => handleCopy(c.cmd)} className="text-wangari-subtle hover:text-wangari-green-800 cursor-pointer">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Webhook Technical Config */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <Card className="border border-wangari-border rounded-3xl">
          <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-wangari-heading">System Service Endpoint</p>
              <p className="text-[11px] text-wangari-muted mt-0.5">Meta Cloud API Webhook URL</p>
            </div>
            <div className="flex items-center gap-2 bg-tone-neutral-bg border border-wangari-border px-3 py-1.5 rounded-xl text-xs font-mono text-wangari-heading max-w-full">
              <span className="break-all">{webhookUrl}</span>
              <button onClick={() => handleCopy(webhookUrl)} className="text-wangari-green-800 hover:text-wangari-green-800 cursor-pointer">
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
