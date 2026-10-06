"use client";
import * as React from "react";
import { motion } from "framer-motion";
import { Building2, Phone, Mail, MapPin, CreditCard, FileText, Save, Upload, X, Eye, PenTool, LayoutTemplate } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/shared/toast";
import api from "@/lib/api-client";
import { getDefaultFarmProfile, type FarmProfile } from "@/components/invoices/InvoiceTemplates";
import { SignaturePad } from "./SignaturePad";
import { TemplateGallery, type DocType } from "./TemplateGallery";

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } };

export function FarmProfileEditor() {
  const [profile, setProfile] = React.useState<FarmProfile>(getDefaultFarmProfile());
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const { showToast, ToastComponent } = useToast();
  const [templateSelection, setTemplateSelection] = React.useState<Record<DocType, string>>({ invoice: "professional", receipt: "same", quote: "same" });

  React.useEffect(() => {
    api.get("/api/settings").then((d: any) => {
      const s = d.settings || {};
      setProfile({
        businessName: s.farm_business_name || "",
        logoUrl: s.farm_logo_url || "",
        phone: s.farm_phone || "",
        email: s.farm_email || "",
        address: s.farm_address || "",
        tinNumber: s.farm_tin_number || "",
        slogan: s.farm_slogan || "",
        bankName: s.farm_bank_name || "",
        bankAccount: s.farm_bank_account || "",
        bankBranch: s.farm_bank_branch || "",
        invoiceNotes: s.farm_invoice_notes || "",
        invoiceTerms: s.farm_invoice_terms || "",
        ctaText: s.farm_cta_text || "",
        signatureDataUrl: s.farm_signature_data_url || "",
        signatureName: s.farm_signature_name || "",
      });
      setTemplateSelection({
        invoice: s.farm_invoice_template || "professional",
        receipt: s.farm_receipt_template || "same",
        quote: s.farm_quote_template || "same",
      });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleGallerySelect = async (type: DocType, templateId: string) => {
    // Save straight to farm settings so it applies everywhere, then reflect locally
    const key = type === "invoice" ? "farm_invoice_template" : type === "receipt" ? "farm_receipt_template" : "farm_quote_template";
    try {
      await api.put("/api/settings", { settings: { [key]: templateId } });
      setTemplateSelection((prev) => ({ ...prev, [type]: templateId }));
      showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} template updated!`, "success");
    } catch {
      showToast("Could not save the template choice", "error");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    await api.put("/api/settings", {
      settings: {
        farm_business_name: profile.businessName,
        farm_logo_url: profile.logoUrl,
        farm_phone: profile.phone,
        farm_email: profile.email,
        farm_address: profile.address,
        farm_tin_number: profile.tinNumber,
        farm_slogan: profile.slogan,
        farm_bank_name: profile.bankName,
        farm_bank_account: profile.bankAccount,
        farm_bank_branch: profile.bankBranch,
        farm_invoice_notes: profile.invoiceNotes,
        farm_invoice_terms: profile.invoiceTerms,
        farm_cta_text: profile.ctaText || "",
        farm_signature_data_url: profile.signatureDataUrl || "",
        farm_signature_name: profile.signatureName || "",
      },
    });
    setSaving(false);
    showToast("Farm profile saved!");
  };

  const [logoUploading, setLogoUploading] = React.useState(false);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await api.upload("/api/upload", formData);
      if (result?.url) {
        setProfile({ ...profile, logoUrl: result.url });
      }
    } catch (err) {
      console.error("Logo upload failed:", err);
      showToast("Failed to upload logo");
    } finally {
      setLogoUploading(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wangari-green-800" /></div>;

  const update = (field: keyof FarmProfile, value: string) => setProfile({ ...profile, [field]: value });

  return (
    <motion.div initial="hidden" animate="visible" variants={fadeUp} className="space-y-6">
      {/* Logo + Business Name */}
      <Card className="border border-wangari-border">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="h-4 w-4 text-wangari-green-800" />
            <h3 className="text-sm font-bold text-wangari-heading">Farm Identity</h3>
          </div>
          <p className="text-xs text-wangari-subtle mb-4">This appears on your invoices, reports, and printed documents.</p>

          <div className="flex items-start gap-6">
            {/* Logo upload */}
            <div className="flex flex-col items-center gap-2">
              <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-wangari-border flex items-center justify-center overflow-hidden bg-tone-neutral-bg hover:border-wangari-green-800 transition-colors">
                {logoUploading ? (
                  <div className="flex flex-col items-center gap-1">
                    <div className="h-6 w-6 rounded-full border-2 border-wangari-green-800/30 border-t-wangari-green-800 animate-spin" />
                    <span className="text-[10px] text-wangari-subtle">Uploading...</span>
                  </div>
                ) : profile.logoUrl ? (
                  <div className="relative w-full h-full">
                    <img src={profile.logoUrl.startsWith("/") ? `${process.env.NEXT_PUBLIC_API_URL || "https://api.wangari.imeantech.com"}${profile.logoUrl}` : profile.logoUrl} alt="Farm Logo" className="w-full h-full object-contain p-2" />
                    <button onClick={() => setProfile({ ...profile, logoUrl: "" })} className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center cursor-pointer"><X className="h-3 w-3" /></button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center gap-1 cursor-pointer">
                    <Upload className="h-6 w-6 text-wangari-subtle" />
                    <span className="text-[10px] text-wangari-subtle">Logo</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                  </label>
                )}
              </div>
              <p className="text-[10px] text-wangari-subtle">Farm logo</p>
            </div>

            {/* Business details */}
            <div className="flex-1 space-y-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-wangari-muted">Business / Farm Name *</Label>
                <Input placeholder="e.g. Green Valley Farm" value={profile.businessName} onChange={e => update("businessName", e.target.value)} className="h-11 rounded-xl" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-wangari-muted">Slogan / Tagline</Label>
                <Input placeholder="e.g. Fresh milk, eggs and produce from happy animals" value={profile.slogan} onChange={e => update("slogan", e.target.value)} className="h-10 rounded-xl" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contact Details */}
      <Card className="border border-wangari-border">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Phone className="h-4 w-4 text-wangari-green-800" />
            <h3 className="text-sm font-bold text-wangari-heading">Contact Details</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-wangari-muted">📞 Business Phone</Label>
              <Input placeholder="+254 7XX XXX XXX" value={profile.phone} onChange={e => update("phone", e.target.value)} className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-wangari-muted">✉️ Business Email</Label>
              <Input placeholder="info@myfarm.co.ke" value={profile.email} onChange={e => update("email", e.target.value)} className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs font-semibold text-wangari-muted">📍 Farm / Business Address</Label>
              <Input placeholder="e.g. Nakuru-Kericho Road, Near Tarire Market" value={profile.address} onChange={e => update("address", e.target.value)} className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-wangari-muted">🏛️ TIN / PIN Number</Label>
              <Input placeholder="e.g. A001234567B" value={profile.tinNumber} onChange={e => update("tinNumber", e.target.value)} className="h-10 rounded-xl" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bank Details */}
      <Card className="border border-wangari-border">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="h-4 w-4 text-wangari-green-800" />
            <h3 className="text-sm font-bold text-wangari-heading">Bank / Payment Details</h3>
          </div>
          <p className="text-xs text-wangari-subtle mb-4">Shown on invoices so customers know where to pay.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-wangari-muted">Bank Name</Label>
              <Input placeholder="e.g. KCB Bank" value={profile.bankName} onChange={e => update("bankName", e.target.value)} className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-wangari-muted">Account Number</Label>
              <Input placeholder="e.g. 1234567890" value={profile.bankAccount} onChange={e => update("bankAccount", e.target.value)} className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-wangari-muted">Branch</Label>
              <Input placeholder="e.g. Nakuru Main" value={profile.bankBranch} onChange={e => update("bankBranch", e.target.value)} className="h-10 rounded-xl" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invoice Notes & Terms */}
      <Card className="border border-wangari-border">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="h-4 w-4 text-wangari-green-800" />
            <h3 className="text-sm font-bold text-wangari-heading">Invoice Defaults</h3>
          </div>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-wangari-muted">Default Notes (appear on every invoice)</Label>
              <textarea placeholder="e.g. Thank you for supporting local farming!" value={profile.invoiceNotes} onChange={e => update("invoiceNotes", e.target.value)} className="w-full h-20 rounded-xl border border-wangari-border px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-wangari-green-800/20 focus:border-wangari-green-800" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-wangari-muted">Terms & Conditions</Label>
              <textarea placeholder="e.g. Payment due within 30 days. Goods once sold are not returnable." value={profile.invoiceTerms} onChange={e => update("invoiceTerms", e.target.value)} className="w-full h-24 rounded-xl border border-wangari-border px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-wangari-green-800/20 focus:border-wangari-green-800" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-wangari-muted">Call-to-Action Line (optional)</Label>
              <Input placeholder="e.g. Order today — call or WhatsApp +254 7XX XXX XXX" value={profile.ctaText || ""} onChange={e => update("ctaText", e.target.value)} className="h-10 rounded-xl" />
              <p className="text-[11px] text-wangari-subtle">Printed near the signature on every document.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Template Gallery — browse designs before selecting */}
      <Card className="border border-wangari-border">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-1">
            <LayoutTemplate className="h-4 w-4 text-wangari-green-800" />
            <h3 className="text-sm font-bold text-wangari-heading">Document Design Gallery</h3>
            <span className="ml-1 text-[10px] font-semibold text-wangari-subtle uppercase tracking-wide">Preview before you choose</span>
          </div>
          <p className="text-xs text-wangari-subtle mb-4">Every design rendered with your own logo and details. Click any template to see it full-size or test-print it — then pick your favourite from the Templates panel below or on the Invoices page.</p>
          <TemplateGallery profile={profile} currentSelection={templateSelection} onSelect={handleGallerySelect} />
        </CardContent>
      </Card>

      {/* Signature (optional) */}
      <Card className="border border-wangari-border">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-1">
            <PenTool className="h-4 w-4 text-wangari-green-800" />
            <h3 className="text-sm font-bold text-wangari-heading">Your Signature <span className="ml-1 text-[10px] font-semibold text-wangari-subtle uppercase tracking-wide">Optional</span></h3>
          </div>
          <p className="text-xs text-wangari-subtle mb-4">Draw it once with your finger or pen on a touch screen — it then prints on invoices, quotes, and receipts. Completely optional.</p>
          <SignaturePad value={profile.signatureDataUrl || ""} onChange={(v) => update("signatureDataUrl", v)} />
          <div className="mt-4 space-y-1">
            <Label className="text-xs font-semibold text-wangari-muted">Name Under Signature</Label>
            <Input placeholder="e.g. Wangari Njeri, Farm Owner" value={profile.signatureName || ""} onChange={e => update("signatureName", e.target.value)} className="h-10 rounded-xl max-w-sm" />
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || !profile.businessName} className="bg-wangari-green-800 hover:bg-wangari-green-900 cursor-pointer px-8 h-12 text-base font-bold disabled:opacity-50">
          <Save className="h-4 w-4 mr-2" />{saving ? "Saving..." : "Save Farm Profile"}
        </Button>
      </div>
      {ToastComponent}
    </motion.div>
  );
}
