// Unified invoice + quote + receipt template system.
//
// One appearance setting drives ALL customer documents ("all at once"):
//   - farm_invoice_template  → applied to every invoice print
//   - farm_receipt_template  → "same" (default) or a specific template id
//   - farm_quote_template    → "same" (default) or a specific template id
//
// Designs are drawn from real-world reference templates (Vanderbilt-style
// corporate quote, PBC teal estimate, Morgan Maxwell minimal, TemplateLab
// blue services invoice, classic Vertex42 form, expense-report spreadsheet
// look) plus a thermal slip for counter printers.
//
// Every document carries an auto-generated code (INV-/QTE-/RCP-/RPT-) so
// nothing gets lost — see server/src/lib/doc-codes.ts.

export interface InvoiceTemplate {
  id: string;
  name: string;
  description: string;
  preview: string; // short description for preview card
  color: string;   // default accent color
}

export const INVOICE_TEMPLATES: InvoiceTemplate[] = [
  {
    id: "professional",
    name: "Professional",
    description: "Clean corporate look with green branding — ideal for established farms",
    preview: "Green header, structured layout, farm logo prominent",
    color: "#166534",
  },
  {
    id: "simple",
    name: "Simple & Clean",
    description: "Minimal design — easy to read, quick to print",
    preview: "White background, thin borders, no frills",
    color: "#334155",
  },
  {
    id: "detailed",
    name: "Detailed Farm Invoice",
    description: "Full farm details, payment terms, bank info — for formal transactions",
    preview: "Gradient header, From/To grid, bank details, T&C",
    color: "#1E3A5F",
  },
  {
    id: "minimal",
    name: "Minimal Signature",
    description: "Typography-first layout with a hand-signature feel — Morgan Maxwell style",
    preview: "Accent band, bold name, airy spacing",
    color: "#166534",
  },
  {
    id: "business",
    name: "Business Classic",
    description: "Formal multi-block layout for registered businesses — classic form style",
    preview: "From/To columns, ruled tables, formal footer",
    color: "#1E3A5F",
  },
  {
    id: "modern-blue",
    name: "Modern Blue",
    description: "Bright service-invoice look with big grand total — TemplateLab style",
    preview: "Blue accents, itemized rows, giant total, T&C footer",
    color: "#0E9BD8",
  },
  {
    id: "teal-estimate",
    name: "Teal Estimate",
    description: "Fresh teal blocks From/To with clean notes panel — great for quotes",
    preview: "Teal section bars, airy table, notes panel",
    color: "#1899B8",
  },
  {
    id: "corporate-navy",
    name: "Corporate Navy",
    description: "Deep navy quote form with terms, acceptance signature line and tax column",
    preview: "Navy bars, tax/qty columns, customer acceptance block",
    color: "#3B4A8C",
  },
  {
    id: "ledger",
    name: "Ledger Report",
    description: "Spreadsheet-style expense/report layout — dates, categories, running totals",
    preview: "Grid look with header block and column rules",
    color: "#4338CA",
  },
  {
    id: "thermal",
    name: "Thermal Slip",
    description: "Compact 80mm receipt style — perfect for counter printers and quick sales",
    preview: "Narrow monospace slip, dashed rules",
    color: "#0F172A",
  },
];

export const TEMPLATE_IDS = INVOICE_TEMPLATES.map((t) => t.id);

/** User-arrangeable layout options — each document section can be moved. */
export interface DocLayout {
  /** Header block (title + doc number) position. */
  headerPosition?: "left" | "center" | "right";
  /** Where the logo sits. */
  logoPosition?: "left" | "center" | "right" | "hidden";
  /** Which side the totals block hugs. */
  totalsSide?: "left" | "right";
  /** Where the signature block sits. */
  signaturePosition?: "left" | "center" | "right" | "none";
  /** Where the customer/bill-to block sits. */
  customerPosition?: "left" | "right";
  /** Paper size hint for print. */
  paperSize?: "a4" | "letter" | "80mm";
  /** Show a QR code of the doc code for verification. */
  showQr?: boolean;
  /** Balanced mode — fills the space opposite the totals block with a payment/notes panel. */
  balancedTotals?: "off" | "payment" | "notes";
}

export const DEFAULT_DOC_LAYOUT: Required<DocLayout> = {
  headerPosition: "right",
  logoPosition: "left",
  totalsSide: "right",
  signaturePosition: "right",
  customerPosition: "left",
  paperSize: "a4",
  showQr: false,
  balancedTotals: "off",
};

export function normalizeLayout(raw: any): Required<DocLayout> {
  const r = raw || {};
  const pick = (v: any, def: string, allowed: string[]) => (allowed.includes(v) ? v : def);
  return {
    headerPosition: pick(r.headerPosition, "right", ["left", "center", "right"]),
    logoPosition: pick(r.logoPosition, "left", ["left", "center", "right", "hidden"]),
    totalsSide: pick(r.totalsSide, "right", ["left", "right"]),
    signaturePosition: pick(r.signaturePosition, "right", ["left", "center", "right", "none"]),
    customerPosition: pick(r.customerPosition, "left", ["left", "right"]),
    paperSize: pick(r.paperSize, "a4", ["a4", "letter", "80mm"]),
    showQr: !!r.showQr,
    balancedTotals: pick(r.balancedTotals, "off", ["off", "payment", "notes"]),
  };
}

export interface FarmProfile {
  businessName: string;
  logoUrl: string;
  phone: string;
  email: string;
  address: string;
  tinNumber: string;
  slogan: string;
  bankName: string;
  bankAccount: string;
  bankBranch: string;
  invoiceNotes: string;
  invoiceTerms: string;
  /** Accent color override (Manta-style). Empty = template default. */
  accentColor?: string;
  /** Call-to-action line printed under the document (optional). */
  ctaText?: string;
  /** Owner signature — drawn on the touch pad and stored as a PNG data URL (optional). */
  signatureDataUrl?: string;
  /** Printed name under the signature (optional). */
  signatureName?: string;
  /** User-arrangeable section layout. */
  layout?: DocLayout;
}

export function getDefaultFarmProfile(): FarmProfile {
  return {
    businessName: "",
    logoUrl: "",
    phone: "",
    email: "",
    address: "",
    tinNumber: "",
    slogan: "",
    bankName: "",
    bankAccount: "",
    bankBranch: "",
    invoiceNotes: "",
    invoiceTerms: "",
    accentColor: "",
    ctaText: "",
    signatureDataUrl: "",
    signatureName: "",
    layout: {},
  };
}

/** Resolve the effective accent color: profile override > template default. */
export function resolveAccent(templateId: string, profile: FarmProfile): string {
  if (profile.accentColor && /^#[0-9a-fA-F]{6}$/.test(profile.accentColor)) {
    return profile.accentColor;
  }
  return INVOICE_TEMPLATES.find((t) => t.id === templateId)?.color || "#166534";
}

/** Which template to use for a receipt/quote: "same" follows the invoice template. */
export function resolveReceiptTemplate(
  receiptSetting: string | undefined | null,
  invoiceTemplateId: string
): string {
  if (!receiptSetting || receiptSetting === "same") return invoiceTemplateId;
  return TEMPLATE_IDS.includes(receiptSetting) ? receiptSetting : invoiceTemplateId;
}

function formatKES(amount: number): string {
  return `KES ${amount.toLocaleString()}`;
}

function escapeHtml(str: string): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Tiny QR-style code block rendering the doc code — uses a data-URI QR placeholder (doc code text bar). */
function docCodeQrHtml(docCode: string, accent: string): string {
  if (!docCode) return "";
  // Lightweight QR representation: the doc code rendered in a small bordered
  // block. Real QR generation is heavyweight; the code text is what humans
  // reference anyway, and the block is visually scannable.
  return `<div style="border:2px solid ${accent};border-radius:8px;padding:6px 10px;display:inline-block;">
    <p style="font-family:'Courier New',monospace;font-size:11px;font-weight:700;color:${accent};letter-spacing:1px;">${escapeHtml(docCode)}</p>
  </div>`;
}

function safeDate(value: any): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-KE", { year: "numeric", month: "long", day: "numeric" });
}

function statusBadgeHtml(status: string, accent: string): string {
  const s = String(status || "pending");
  const style =
    s === "paid"
      ? "background:#F0FDF4;color:#166534;border:1px solid #BBF7D0;"
      : s === "partial"
      ? "background:#FFFBEB;color:#D97706;border:1px solid #FDE68A;"
      : "background:#FEF2F2;color:#DC2626;border:1px solid #FECACA;";
  return `<span style="display:inline-block;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;${style}">${escapeHtml(s)}</span>`;
}

function logoOrInitial(profile: FarmProfile, farmName: string, accent: string): string {
  if (profile.logoUrl) {
    return `<img src="${escapeHtml(profile.logoUrl)}" alt="Logo" style="height:60px;object-fit:contain;" onerror="this.outerHTML='<div style=&quot;width:60px;height:60px;border-radius:12px;background:${accent};display:flex;align-items:center;justify-content:center;color:white;font-size:24px;font-weight:bold;&quot;>${escapeHtml(farmName.charAt(0).toUpperCase())}</div>'" />`;
  }
  return `<div style="width:60px;height:60px;border-radius:12px;background:${accent};display:flex;align-items:center;justify-content:center;color:white;font-size:24px;font-weight:bold;">${escapeHtml(farmName.charAt(0).toUpperCase())}</div>`;
}

function contactLinesOf(profile: FarmProfile): string[] {
  const lines: string[] = [];
  if (profile.phone) lines.push(`📞 ${escapeHtml(profile.phone)}`);
  if (profile.email) lines.push(`✉️ ${escapeHtml(profile.email)}`);
  if (profile.address) lines.push(`📍 ${escapeHtml(profile.address)}`);
  if (profile.tinNumber) lines.push(`TIN/PIN: ${escapeHtml(profile.tinNumber)}`);
  return lines;
}

function baseDoc(title: string, body: string, pageWidth = "800px", extraCss = ""): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    @media print { body { margin: 0; padding: 0; } .no-print { display: none !important; } }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #334155; background: white; }
    .page { max-width: ${pageWidth}; margin: 0 auto; padding: 40px; }
    ${extraCss}
  </style>
</head>
<body>
  <div class="page">${body}
  </div>
</body>
</html>`;
}

/** Signature + optional CTA footer, shared by all templates. Optional — blank when unset. */
function signatureFooterHtml(profile: FarmProfile, accent: string, align: "left" | "right" | "center" = "right"): string {
  const layout = normalizeLayout(profile.layout);
  if (layout.signaturePosition === "none") return "";
  const effective = layout.signaturePosition as "left" | "right" | "center";
  const sig = profile.signatureDataUrl
    ? `<div style="margin-top:8px;">
        <img src="${profile.signatureDataUrl}" alt="Signature" style="height:52px;object-fit:contain;object-position:left bottom;" onerror="this.style.display='none'" />
        ${profile.signatureName ? `<p style="font-size:11px;color:#64748B;margin-top:2px;border-top:1px solid #CBD5E1;display:inline-block;padding-top:4px;">${escapeHtml(profile.signatureName)}</p>` : ""}
      </div>`
    : "";
  const cta = profile.ctaText
    ? `<p style="font-size:12px;font-weight:600;color:${accent};margin-top:14px;">${escapeHtml(profile.ctaText)}</p>`
    : "";
  if (!sig && !cta) return "";
  const justify = effective === "center" ? "center" : effective === "left" ? "flex-start" : "flex-end";
  return `<div style="display:flex;justify-content:${justify};text-align:${effective};margin-top:20px;">${sig}${cta}</div>`;
}

function itemsTableHtml(items: any[], accent: string, cols: Array<{ key: string; label: string; align: string }>, zebra = false, headerBg = accent): string {
  const headRow = cols
    .map((c) => `<th style="padding:12px 16px;color:white;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;text-align:${c.align};">${c.label}</th>`)
    .join("");
  const rows = (Array.isArray(items) ? items : [])
    .map((item: any, i: number) => {
      const bg = zebra && i % 2 === 1 ? "background:#F8FAFC;" : "";
      return `<tr style="border-bottom:1px solid #E5E7EB;${bg}">
      ${cols
        .map((c) => {
          const align = `text-align:${c.align};`;
          if (c.key === "i") return `<td style="padding:12px 16px;font-size:13px;color:#5F6E85;${align}${bg}">${i + 1}</td>`;
          if (c.key === "name") return `<td style="padding:12px 16px;font-size:13px;color:#0F172A;font-weight:600;${align}${bg}">${escapeHtml(item.name || "Item")}</td>`;
          if (c.key === "qty") return `<td style="padding:12px 16px;font-size:13px;color:#64748B;${align}${bg}">${item.quantity || 1}</td>`;
          if (c.key === "price") return `<td style="padding:12px 16px;font-size:13px;color:#64748B;${align}${bg}">${formatKES(Number(item.price || 0))}</td>`;
          return `<td style="padding:12px 16px;font-size:13px;color:#0F172A;font-weight:600;${align}${bg}">${formatKES(Number(item.quantity || 1) * Number(item.price || 0))}</td>`;
        })
        .join("")}
    </tr>`;
    })
    .join("");
  return `<table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
    <thead><tr style="background:${headerBg};">${headRow}</tr></thead>
    <tbody>${rows || `<tr><td colspan="${cols.length}" style="padding:24px;text-align:center;color:#5F6E85;font-size:13px;">No items</td></tr>`}</tbody>
  </table>`;
}

/**
 * Balanced panel — sits opposite the totals block when balancedTotals is on.
 * "payment" shows a scannable bank payment QR with the doc code as reference;
 * "notes" mirrors the farm's default notes/terms so the page reads evenly.
 */
// Context for the balanced panel — set per document render (module-scoped so
// totalsHtml can reach profile/doc data without changing its 40+ call sites).
let balancedCtx: { profile: FarmProfile; docCode: string; accent: string } = { profile: {
  businessName: "", logoUrl: "", phone: "", email: "", address: "", tinNumber: "", slogan: "",
  bankName: "", bankAccount: "", bankBranch: "", invoiceNotes: "", invoiceTerms: "",
}, docCode: "", accent: "#166534" };
function balancedPanelHtml(profile: FarmProfile, layout: Required<DocLayout>, docCode: string, accent: string): string {
  const mode = layout.balancedTotals;
  if (mode === "payment" && profile.bankAccount) {
    const payload = `Bank:${profile.bankName || ""}|Acct:${profile.bankAccount}|Ref:${docCode}`;
    const qr = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(payload)}" alt="Payment QR" width="120" height="120" style="display:block;image-rendering:pixelated;" onerror="this.style.display='none'" />`;
    return `<div style="min-width:260px;max-width:300px;background:#F8FAFC;border:1px solid #E5E7EB;border-radius:12px;padding:16px;text-align:center;">
      <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#5F6E85;margin-bottom:8px;">Scan to Pay</p>
      <div style="display:flex;justify-content:center;">${qr}</div>
      ${profile.bankName ? `<p style="font-size:11px;color:#0F172A;font-weight:700;margin-top:8px;">${escapeHtml(profile.bankName)}</p>` : ""}
      ${profile.bankAccount ? `<p style="font-size:11px;color:#64748B;margin-top:2px;">A/C ${escapeHtml(profile.bankAccount)}</p>` : ""}
      <p style="font-size:10px;color:#5F6E85;margin-top:6px;">Reference: <span style="font-weight:700;color:#0F172A;">${escapeHtml(docCode)}</span></p>
    </div>`;
  }
  if (mode === "notes" && (profile.invoiceNotes || profile.invoiceTerms)) {
    return `<div style="min-width:260px;max-width:320px;background:#F8FAFC;border:1px solid #E5E7EB;border-radius:12px;padding:16px;">
      ${profile.invoiceNotes ? `<p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#5F6E85;margin-bottom:4px;">Notes</p>
      <p style="font-size:11px;color:#64748B;line-height:1.6;">${escapeHtml(profile.invoiceNotes)}</p>` : ""}
      ${profile.invoiceTerms ? `<p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#5F6E85;margin:10px 0 4px;">Terms</p>
      <p style="font-size:10px;color:#5F6E85;line-height:1.6;">${escapeHtml(profile.invoiceTerms)}</p>` : ""}
    </div>`;
  }
  return "";
}

function totalsHtml(total: number, paid: number, layout: Required<DocLayout>, compact = false): string {
  const balance = total - paid;
  const row = (label: string, value: string, extra = "") =>
    `<div style="display:flex;justify-content:space-between;padding:${compact ? 8 : 10}px 0;border-bottom:1px solid #E5E7EB;${extra}">
      <span style="font-size:13px;color:#64748B;">${label}</span>
      <span style="font-size:13px;font-weight:600;color:#0F172A;">${value}</span>
    </div>`;
  const balanceBlock =
    balance > 0
      ? `<div style="display:flex;justify-content:space-between;padding:12px 16px;background:#FEF2F2;border-radius:8px;margin-top:8px;">
          <span style="font-size:14px;font-weight:700;color:#DC2626;">Balance Due</span>
          <span style="font-size:18px;font-weight:800;color:#DC2626;">${formatKES(balance)}</span>
        </div>`
      : `<div style="display:flex;justify-content:space-between;padding:12px 16px;background:#F0FDF4;border-radius:8px;margin-top:8px;">
          <span style="font-size:14px;font-weight:700;color:#166534;">✓ Fully Paid</span>
        </div>`;
  const totalsBlock = `<div style="min-width:260px;">
      ${row("Subtotal", formatKES(total))}
      ${row("Amount Paid", `<span style="color:#166534;">${formatKES(paid)}</span>`)}
      ${balanceBlock}
    </div>`;
  // Balanced mode: the opposite side holds a payment QR / notes panel instead of empty space.
  if (layout.balancedTotals !== "off") {
    return `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:32px;flex-direction:${layout.totalsSide === "left" ? "row-reverse" : "row"};">
    ${totalsBlock}
    ${balancedPanelHtml(balancedCtx.profile, layout, balancedCtx.docCode, balancedCtx.accent)}
  </div>`;
  }
  return `<div style="display:flex;justify-content:${layout.totalsSide === "left" ? "flex-start" : "flex-end"};margin-bottom:32px;">
    ${totalsBlock}
  </div>`;
}

function bankDetailsHtml(profile: FarmProfile, accent: string): string {
  if (!profile.bankName) return "";
  return `<div style="background:#F8FAFC;border:1px solid #E5E7EB;border-radius:12px;padding:20px;margin-bottom:24px;">
    <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#5F6E85;margin-bottom:12px;">Payment Details</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">
      <div><span style="color:#64748B;">Bank:</span> <span style="font-weight:600;color:#0F172A;">${escapeHtml(profile.bankName)}</span></div>
      ${profile.bankAccount ? `<div><span style="color:#64748B;">Account:</span> <span style="font-weight:600;color:#0F172A;">${escapeHtml(profile.bankAccount)}</span></div>` : ""}
      ${profile.bankBranch ? `<div><span style="color:#64748B;">Branch:</span> <span style="font-weight:600;color:#0F172A;">${escapeHtml(profile.bankBranch)}</span></div>` : ""}
    </div>
  </div>`;
}

function notesTermsHtml(profile: FarmProfile): string {
  return `${profile.invoiceNotes ? `<div style="margin-bottom:24px;">
    <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#5F6E85;margin-bottom:6px;">Notes</p>
    <p style="font-size:12px;color:#64748B;line-height:1.6;">${escapeHtml(profile.invoiceNotes)}</p>
  </div>` : ""}
  ${profile.invoiceTerms ? `<div style="margin-bottom:32px;">
    <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#5F6E85;margin-bottom:6px;">Terms &amp; Conditions</p>
    <p style="font-size:11px;color:#5F6E85;line-height:1.6;">${escapeHtml(profile.invoiceTerms)}</p>
  </div>` : ""}`;
}

/* ────────────────────────────────────────────────────────────
   Invoice generator — one function, all templates
   ──────────────────────────────────────────────────────────── */
export function generateInvoiceHtml(invoice: any, templateId: string, profile: FarmProfile, docTitle = "INVOICE"): string {
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const total = Number(invoice.totalAmount);
  const paid = Number(invoice.amountPaid);
  const farmName = profile.businessName || "My Farm";
  const accent = resolveAccent(templateId, profile);
  const contactLines = contactLinesOf(profile);
  const customerName = escapeHtml(invoice.customer?.name || "Walk-in Customer");
  const customerPhone = invoice.customer?.phone ? escapeHtml(invoice.customer.phone) : "";
  const invoiceDate = safeDate(invoice.createdAt);
  const dueDate = invoice.dueDate ? safeDate(invoice.dueDate) : null;
  const tId = TEMPLATE_IDS.includes(templateId) ? templateId : "professional";
  const layout = normalizeLayout(profile.layout);
  const validUntil = invoice.validUntil ? safeDate(invoice.validUntil) : null;
  balancedCtx = { profile, docCode: String(invoice.invoiceNumber || ""), accent };

  // Layout helpers — every template routes its header/logo/customer/signature
  // blocks through these so user positioning applies everywhere.
  const alignOf = (pos: string) => (pos === "center" ? "center" : pos === "left" ? "flex-start" : "flex-end");
  const headerAlign = alignOf(layout.headerPosition);
  const headerText = layout.headerPosition === "center" ? "center" : layout.headerPosition;
  const logoHtml = layout.logoPosition === "hidden" ? "" : logoOrInitial(profile, farmName, accent);
  const logoAlign = alignOf(layout.logoPosition === "hidden" ? "left" : layout.logoPosition);
  // Swap order of a two-column flex row based on customer side
  const customerFirst = layout.customerPosition === "left";
  const twoCol = (first: string, second: string) =>
    `<div style="display:flex;justify-content:space-between;gap:24px;flex-direction:${customerFirst ? "row" : "row-reverse"};text-align:${layout.customerPosition === "left" ? "left" : "right"};">${first}${second}</div>`;

  /* ── PROFESSIONAL ── */
  if (tId === "professional") {
    const body = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:24px;border-bottom:3px solid ${accent};flex-direction:${layout.logoPosition === "right" ? "row-reverse" : "row"};">
      <div style="display:flex;align-items:center;gap:16px;${layout.logoPosition === "center" ? "flex-direction:column;align-items:center;text-align:center;" : ""}${layout.logoPosition === "hidden" ? "display:none;" : ""}">
        ${logoHtml}
        <div>
          <h1 style="font-size:22px;font-weight:800;color:${accent};letter-spacing:-0.5px;">${escapeHtml(farmName)}</h1>
          ${profile.slogan ? `<p style="font-size:12px;color:#64748B;margin-top:2px;font-style:italic;">${escapeHtml(profile.slogan)}</p>` : ""}
          <div style="margin-top:8px;font-size:11px;color:#5F6E85;line-height:1.6;">${contactLines.map((l) => `<span style="display:block;">${l}</span>`).join("")}</div>
        </div>
      </div>
      <div style="text-align:${layout.headerPosition};${layout.logoPosition === "right" ? "order:-1;" : ""}">
        <div style="background:${accent};color:white;padding:8px 20px;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:1px;">${escapeHtml(docTitle)}</div>
        <p style="margin-top:12px;font-size:14px;font-weight:700;color:#0F172A;">${escapeHtml(invoice.invoiceNumber)}</p>
        <p style="font-size:12px;color:#5F6E85;margin-top:4px;">Date: ${invoiceDate}</p>
        ${dueDate ? `<p style="font-size:12px;color:#5F6E85;">Due: ${dueDate}</p>` : ""}
        ${validUntil ? `<p style="font-size:12px;color:#5F6E85;">Valid until: ${validUntil}</p>` : ""}
        <div style="margin-top:8px;">${statusBadgeHtml(invoice.paymentStatus, accent)}</div>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-bottom:32px;flex-direction:${layout.customerPosition === "right" ? "row-reverse" : "row"};">
      <div style="background:#F8FAFC;border-radius:12px;padding:20px;min-width:280px;text-align:${layout.customerPosition === "right" ? "right" : "left"};">
        <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#5F6E85;margin-bottom:8px;">Bill To</p>
        <p style="font-size:16px;font-weight:700;color:#0F172A;">${customerName}</p>
        ${customerPhone ? `<p style="font-size:13px;color:#64748B;margin-top:4px;">${customerPhone}</p>` : ""}
      </div>
      <div style="text-align:right;">
        <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:12px;padding:16px 24px;">
          <p style="font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:1px;">Total Amount</p>
          <p style="font-size:28px;font-weight:800;color:${accent};margin-top:4px;">${formatKES(total)}</p>
        </div>
      </div>
    </div>
    ${itemsTableHtml(items, accent, [
      { key: "i", label: "#", align: "left" },
      { key: "name", label: "Item", align: "left" },
      { key: "qty", label: "Qty", align: "center" },
      { key: "price", label: "Price", align: "right" },
      { key: "amount", label: "Total", align: "right" },
    ])}
    ${totalsHtml(total, paid, layout)}
    ${bankDetailsHtml(profile, accent)}
    ${notesTermsHtml(profile)}
    ${signatureFooterHtml(profile, accent)}
    <div style="text-align:center;padding-top:24px;border-top:2px solid ${accent};">
      <p style="font-size:12px;color:${accent};font-weight:600;">Thank you for your business!</p>
      <p style="font-size:10px;color:#5F6E85;margin-top:4px;">${escapeHtml(farmName)} · Generated by Wangari Farm OS</p>
    </div>`;
    return baseDoc(invoice.invoiceNumber, body);
  }

  /* ── SIMPLE ── */
  if (tId === "simple") {
    const body = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:40px;flex-direction:${layout.logoPosition === "right" ? "row-reverse" : "row"};">
      <div style="display:flex;align-items:center;gap:12px;${layout.logoPosition === "center" ? "flex-direction:column;align-items:center;text-align:center;" : ""}${layout.logoPosition === "hidden" ? "display:none;" : ""}">
        ${logoHtml}
        <div>
          <h1 style="font-size:20px;font-weight:700;color:#0F172A;">${escapeHtml(farmName)}</h1>
          ${contactLines.length > 0 ? `<p style="font-size:11px;color:#5F6E85;margin-top:2px;">${contactLines.join(" · ")}</p>` : ""}
        </div>
      </div>
      <div style="text-align:${layout.headerPosition};${layout.logoPosition === "right" ? "order:-1;" : ""}">
        <p style="font-size:24px;font-weight:800;color:#0F172A;">${escapeHtml(docTitle)}</p>
        <p style="font-size:13px;color:#64748B;margin-top:4px;">${escapeHtml(invoice.invoiceNumber)}</p>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-bottom:32px;padding:16px 0;border-top:1px solid #E5E7EB;border-bottom:1px solid #E5E7EB;">
      <div>
        <p style="font-size:11px;color:#5F6E85;text-transform:uppercase;letter-spacing:1px;">Bill To</p>
        <p style="font-size:15px;font-weight:700;color:#0F172A;margin-top:4px;">${customerName}</p>
        ${customerPhone ? `<p style="font-size:12px;color:#64748B;margin-top:2px;">${customerPhone}</p>` : ""}
      </div>
      <div style="text-align:right;">
        <p style="font-size:11px;color:#5F6E85;">Date: <span style="color:#0F172A;font-weight:600;">${invoiceDate}</span></p>
        ${dueDate ? `<p style="font-size:11px;color:#5F6E85;margin-top:2px;">Due: <span style="color:#0F172A;font-weight:600;">${dueDate}</span></p>` : ""}
        ${validUntil ? `<p style="font-size:11px;color:#5F6E85;">Valid until: <span style="color:#0F172A;font-weight:600;">${validUntil}</span></p>` : ""}
        <p style="margin-top:6px;">${statusBadgeHtml(invoice.paymentStatus, accent)}</p>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <thead>
        <tr style="border-bottom:2px solid #0F172A;">
          <th style="padding:10px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748B;text-align:left;">Item</th>
          <th style="padding:10px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748B;text-align:center;">Qty</th>
          <th style="padding:10px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748B;text-align:right;">Price</th>
          <th style="padding:10px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748B;text-align:right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item: any) => `
        <tr style="border-bottom:1px solid #F1F5F9;">
          <td style="padding:12px 16px;font-size:13px;color:#0F172A;font-weight:500;">${escapeHtml(item.name || "Item")}</td>
          <td style="padding:12px 16px;font-size:13px;color:#64748B;text-align:center;">${item.quantity || 1}</td>
          <td style="padding:12px 16px;font-size:13px;color:#64748B;text-align:right;">${formatKES(Number(item.price || 0))}</td>
          <td style="padding:12px 16px;font-size:13px;color:#0F172A;font-weight:600;text-align:right;">${formatKES(Number(item.quantity || 1) * Number(item.price || 0))}</td>
        </tr>`).join("") || `<tr><td colspan="4" style="padding:24px;text-align:center;color:#5F6E85;">No items</td></tr>`}
      </tbody>
    </table>
    ${totalsHtml(total, paid, layout)}
    ${profile.bankName ? `<div style="margin-top:24px;padding:16px;background:#F8FAFC;border-radius:8px;font-size:12px;color:#64748B;">
      <strong>Payment:</strong> ${escapeHtml(profile.bankName)}${profile.bankAccount ? ` · A/C ${escapeHtml(profile.bankAccount)}` : ""}${profile.bankBranch ? ` · ${escapeHtml(profile.bankBranch)}` : ""}
    </div>` : ""}
    ${profile.invoiceNotes ? `<p style="margin-top:16px;font-size:11px;color:#5F6E85;text-align:center;">${escapeHtml(profile.invoiceNotes)}</p>` : ""}
    ${signatureFooterHtml(profile, accent)}
    <p style="margin-top:24px;text-align:center;font-size:10px;color:#CBD5E1;">${escapeHtml(farmName)} · Wangari Farm OS</p>`;
    return baseDoc(invoice.invoiceNumber, body);
  }

  /* ── DETAILED ── */
  if (tId === "detailed") {
    const body = `
    <div style="background:linear-gradient(135deg,${accent} 0%,#166534 100%);color:white;padding:32px;border-radius:16px;margin-bottom:32px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div style="display:flex;align-items:center;gap:16px;${layout.logoPosition === "center" ? "flex-direction:column;text-align:center;" : ""}${layout.logoPosition === "hidden" ? "display:none;" : ""}">
          ${layout.logoPosition !== "hidden" && profile.logoUrl
            ? `<img src="${escapeHtml(profile.logoUrl)}" alt="Logo" style="height:64px;object-fit:contain;border-radius:8px;background:white;padding:4px;" />`
            : `<div style="width:64px;height:64px;border-radius:12px;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:bold;">${escapeHtml(farmName.charAt(0).toUpperCase())}</div>`}
          <div>
            <h1 style="font-size:24px;font-weight:800;letter-spacing:-0.5px;">${escapeHtml(farmName)}</h1>
            ${profile.slogan ? `<p style="font-size:13px;opacity:0.8;margin-top:4px;font-style:italic;">${escapeHtml(profile.slogan)}</p>` : ""}
          </div>
        </div>
        <div style="text-align:right;">
          <div style="background:rgba(255,255,255,0.15);padding:8px 20px;border-radius:8px;font-size:14px;font-weight:700;letter-spacing:2px;">${escapeHtml(docTitle).toUpperCase()}</div>
          <p style="margin-top:12px;font-size:16px;font-weight:700;">${escapeHtml(invoice.invoiceNumber)}</p>
          <p style="font-size:12px;opacity:0.7;margin-top:4px;">${invoiceDate}</p>
          ${dueDate ? `<p style="font-size:12px;opacity:0.7;">Due: ${dueDate}</p>` : ""}
          ${validUntil ? `<p style="font-size:12px;opacity:0.7;">Valid until: ${validUntil}</p>` : ""}
        </div>
      </div>
      <div style="margin-top:20px;display:flex;gap:24px;font-size:12px;opacity:0.8;flex-wrap:wrap;">
        ${contactLines.map((l) => `<span>${l}</span>`).join("")}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px;">
      <div>
        <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#5F6E85;margin-bottom:8px;">From</p>
        <p style="font-size:15px;font-weight:700;color:#0F172A;">${escapeHtml(farmName)}</p>
        ${profile.address ? `<p style="font-size:12px;color:#64748B;margin-top:4px;">${escapeHtml(profile.address)}</p>` : ""}
        ${profile.tinNumber ? `<p style="font-size:12px;color:#64748B;margin-top:2px;">TIN: ${escapeHtml(profile.tinNumber)}</p>` : ""}
      </div>
      <div>
        <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#5F6E85;margin-bottom:8px;">Bill To</p>
        <p style="font-size:15px;font-weight:700;color:#0F172A;">${customerName}</p>
        ${customerPhone ? `<p style="font-size:12px;color:#64748B;margin-top:4px;">${customerPhone}</p>` : ""}
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;background:#F8FAFC;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
      <div style="display:flex;gap:24px;font-size:13px;flex-wrap:wrap;">
        <div><span style="color:#5F6E85;">No:</span> <strong>${escapeHtml(invoice.invoiceNumber)}</strong></div>
        <div><span style="color:#5F6E85;">Date:</span> <strong>${invoiceDate}</strong></div>
        ${dueDate ? `<div><span style="color:#5F6E85;">Due:</span> <strong>${dueDate}</strong></div>` : ""}
      </div>
      ${statusBadgeHtml(invoice.paymentStatus, accent)}
    </div>
    ${itemsTableHtml(items, accent, [
      { key: "i", label: "#", align: "left" },
      { key: "name", label: "Description", align: "left" },
      { key: "qty", label: "Qty", align: "center" },
      { key: "price", label: "Unit Price", align: "right" },
      { key: "amount", label: "Amount", align: "right" },
    ], true)}
    ${totalsHtml(total, paid, layout)}
    ${bankDetailsHtml(profile, accent)}
    ${notesTermsHtml(profile)}
    ${signatureFooterHtml(profile, accent)}
    <div style="text-align:center;padding-top:24px;border-top:2px solid ${accent};">
      <p style="font-size:13px;color:${accent};font-weight:600;">${escapeHtml(farmName)}</p>
      ${profile.phone || profile.email ? `<p style="font-size:11px;color:#5F6E85;margin-top:4px;">${[profile.phone, profile.email].filter(Boolean).join(" · ")}</p>` : ""}
      <p style="font-size:10px;color:#CBD5E1;margin-top:8px;">Generated by Wangari Farm OS</p>
    </div>`;
    return baseDoc(invoice.invoiceNumber, body);
  }

  /* ── MINIMAL (Morgan Maxwell signature style) ── */
  if (tId === "minimal") {
    const body = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:48px;flex-direction:${layout.logoPosition === "right" ? "row-reverse" : "row"};${layout.headerPosition === "center" ? "flex-direction:column;text-align:center;" : ""}">
      <h1 style="font-size:44px;font-weight:800;color:#1F2937;letter-spacing:6px;">${escapeHtml(docTitle)}</h1>
      ${profile.logoUrl
        ? `<img src="${escapeHtml(profile.logoUrl)}" alt="Logo" style="height:80px;object-fit:contain;" />`
        : `<div style="width:80px;height:80px;border:3px solid #1F2937;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:700;color:#1F2937;">${escapeHtml(farmName.charAt(0).toUpperCase())}</div>`}
    </div>
    <div style="display:flex;justify-content:space-between;margin-bottom:56px;">
      <div>
        <p style="font-size:13px;font-weight:800;letter-spacing:2px;color:#1F2937;margin-bottom:6px;">ISSUED TO:</p>
        <p style="font-size:15px;color:#374151;">${customerName}</p>
        ${customerPhone ? `<p style="font-size:13px;color:#6B7280;">${customerPhone}</p>` : ""}
      </div>
      <div style="font-size:13px;color:#374151;">
        <p><span style="font-weight:800;letter-spacing:1px;">${escapeHtml(docTitle)} NO:</span> <strong>${escapeHtml(invoice.invoiceNumber)}</strong></p>
        <p style="margin-top:4px;"><span style="font-weight:800;letter-spacing:1px;">DATE:</span> ${invoiceDate}</p>
        ${dueDate ? `<p style="margin-top:4px;"><span style="font-weight:800;letter-spacing:1px;">DUE DATE:</span> ${dueDate}</p>` : ""}
        ${validUntil ? `<p style="margin-top:4px;"><span style="font-weight:800;letter-spacing:1px;">VALID UNTIL:</span> ${validUntil}</p>` : ""}
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <thead>
        <tr style="border-top:2px solid #1F2937;border-bottom:1px solid #1F2937;">
          <th style="padding:12px 8px;font-size:12px;font-weight:800;letter-spacing:2px;color:#1F2937;text-align:left;">DESCRIPTION</th>
          <th style="padding:12px 8px;font-size:12px;font-weight:800;letter-spacing:2px;color:#1F2937;text-align:right;">RATE</th>
          <th style="padding:12px 8px;font-size:12px;font-weight:800;letter-spacing:2px;color:#1F2937;text-align:right;">QTY</th>
          <th style="padding:12px 8px;font-size:12px;font-weight:800;letter-spacing:2px;color:#1F2937;text-align:right;">TOTAL</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item: any) => `
        <tr style="border-bottom:1px solid #E5E7EB;">
          <td style="padding:14px 8px;font-size:14px;color:#374151;">${escapeHtml(item.name || "Item")}</td>
          <td style="padding:14px 8px;font-size:14px;color:#374151;text-align:right;">${Number(item.price || 0).toLocaleString()}</td>
          <td style="padding:14px 8px;font-size:14px;color:#374151;text-align:right;">${item.quantity || 1}</td>
          <td style="padding:14px 8px;font-size:14px;color:#111827;font-weight:600;text-align:right;">${formatKES(Number(item.quantity || 1) * Number(item.price || 0))}</td>
        </tr>`).join("") || `<tr><td colspan="4" style="padding:24px;text-align:center;color:#5F6E85;">No items</td></tr>`}
      </tbody>
      <tfoot>
        <tr style="border-top:2px solid #1F2937;">
          <td colspan="3" style="padding:14px 8px;font-size:14px;font-weight:800;letter-spacing:1px;color:#1F2937;">SUBTOTAL</td>
          <td style="padding:14px 8px;font-size:14px;font-weight:700;color:#111827;text-align:right;">${formatKES(total)}</td>
        </tr>
        <tr>
          <td colspan="3" style="padding:4px 8px;font-size:13px;color:#6B7280;text-align:right;">${paid >= total ? "Paid in full" : `Balance ${formatKES(total - paid)}`}</td>
          <td style="padding:8px;font-size:18px;font-weight:800;color:#1F2937;text-align:right;">${formatKES(total)}</td>
        </tr>
      </tfoot>
    </table>
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:56px;">
      <div style="font-size:12px;color:#6B7280;line-height:1.8;">
        ${profile.bankName ? `<p style="font-weight:800;letter-spacing:1px;color:#1F2937;">PAYMENT INFO:</p><p>${escapeHtml(profile.bankName)}</p>${profile.bankAccount ? `<p>Account No.: ${escapeHtml(profile.bankAccount)}</p>` : ""}` : ""}
      </div>
      <div style="text-align:right;">
        ${signatureFooterHtml(profile, accent, "right")}
      </div>
    </div>
    <p style="text-align:center;font-size:10px;color:#CBD5E1;margin-top:48px;">${escapeHtml(farmName)} · Wangari Farm OS</p>`;
    return baseDoc(invoice.invoiceNumber, body);
  }

  /* ── BUSINESS (classic form layout) ── */
  if (tId === "business") {
    const body = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0F172A;padding-bottom:20px;margin-bottom:24px;flex-direction:${layout.logoPosition === "right" ? "row-reverse" : "row"};">
      <div style="display:flex;align-items:center;gap:14px;${layout.logoPosition === "center" ? "flex-direction:column;align-items:center;text-align:center;" : ""}${layout.logoPosition === "hidden" ? "display:none;" : ""}">
        ${logoHtml}
        <div>
          <p style="font-size:18px;font-weight:800;color:#0F172A;">${escapeHtml(farmName)}</p>
          ${profile.address ? `<p style="font-size:11px;color:#64748B;margin-top:2px;">${escapeHtml(profile.address)}</p>` : ""}
          ${profile.tinNumber ? `<p style="font-size:11px;color:#64748B;">TIN/PIN: ${escapeHtml(profile.tinNumber)}</p>` : ""}
        </div>
      </div>
      <div style="text-align:right;font-size:12px;color:#334155;">
        <p style="font-size:20px;font-weight:800;letter-spacing:3px;color:#0F172A;">${escapeHtml(docTitle)}</p>
        <p style="margin-top:6px;">No. <strong>${escapeHtml(invoice.invoiceNumber)}</strong></p>
        <p>Date: <strong>${invoiceDate}</strong></p>
        ${dueDate ? `<p>Due: <strong>${dueDate}</strong></p>` : ""}
        ${validUntil ? `<p>Valid until: <strong>${validUntil}</strong></p>` : ""}
        <p style="margin-top:4px;">${statusBadgeHtml(invoice.paymentStatus, accent)}</p>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:28px;font-size:12px;">
      <tr>
        <td style="width:50%;vertical-align:top;padding-right:16px;">
          <div style="background:#F8FAFC;border-left:3px solid ${accent};padding:12px 16px;">
            <p style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#5F6E85;margin-bottom:4px;">From</p>
            <p style="font-weight:700;color:#0F172A;">${escapeHtml(farmName)}</p>
            ${profile.phone ? `<p style="color:#64748B;margin-top:2px;">${escapeHtml(profile.phone)}</p>` : ""}
            ${profile.email ? `<p style="color:#64748B;">${escapeHtml(profile.email)}</p>` : ""}
          </div>
        </td>
        <td style="width:50%;vertical-align:top;padding-left:16px;">
          <div style="background:#F8FAFC;border-left:3px solid #94A3B8;padding:12px 16px;">
            <p style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#5F6E85;margin-bottom:4px;">To</p>
            <p style="font-weight:700;color:#0F172A;">${customerName}</p>
            ${customerPhone ? `<p style="color:#64748B;margin-top:2px;">${customerPhone}</p>` : ""}
          </div>
        </td>
      </tr>
    </table>
    ${itemsTableHtml(items, accent, [
      { key: "i", label: "#", align: "left" },
      { key: "name", label: "Description", align: "left" },
      { key: "qty", label: "Qty", align: "center" },
      { key: "price", label: "Unit Price", align: "right" },
      { key: "amount", label: "Amount", align: "right" },
    ])}
    ${totalsHtml(total, paid, layout)}
    ${bankDetailsHtml(profile, accent)}
    ${notesTermsHtml(profile)}
    ${signatureFooterHtml(profile, accent, "left")}
    <div style="display:flex;justify-content:space-between;align-items:center;border-top:2px solid #0F172A;padding-top:16px;margin-top:8px;">
      <p style="font-size:11px;color:#64748B;">${escapeHtml(farmName)} — Wangari Farm OS</p>
      <p style="font-size:11px;color:#64748B;font-style:italic;">Thank you for your business.</p>
    </div>`;
    return baseDoc(invoice.invoiceNumber, body);
  }

  /* ── MODERN BLUE (big grand total, service rows) ── */
  if (tId === "modern-blue") {
    const rows = (Array.isArray(items) ? items : [])
      .map((item: any, i: number) => `
      <tr style="border-bottom:1px solid #E5E7EB;">
        <td style="padding:14px 8px 14px 0;">
          <p style="font-size:14px;font-weight:600;color:#0F172A;">${escapeHtml(item.name || "Item")}</p>
        </td>
        <td style="padding:14px 8px;font-size:13px;color:#64748B;text-align:right;">${Number(item.price || 0).toLocaleString()}</td>
        <td style="padding:14px 8px;font-size:13px;color:#64748B;text-align:center;">${item.quantity || 1}</td>
        <td style="padding:14px 0;font-size:13px;color:#0F172A;font-weight:600;text-align:right;">${formatKES(Number(item.quantity || 1) * Number(item.price || 0))}</td>
      </tr>`)
      .join("");
    const body = `
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:40px;justify-content:${layout.logoPosition === "center" ? "center" : layout.logoPosition === "right" ? "flex-end" : "flex-start"};">
      ${layout.logoPosition !== "hidden" ? logoHtml : ""}
      <h1 style="font-size:42px;font-weight:300;color:${accent};letter-spacing:8px;text-align:${layout.headerPosition};">${escapeHtml(docTitle)}</h1>
    </div>
    <div style="display:flex;gap:48px;border-bottom:2px solid ${accent};padding-bottom:24px;margin-bottom:32px;font-size:13px;">
      <div>
        <p style="font-size:10px;font-weight:800;letter-spacing:2px;color:${accent};margin-bottom:6px;">${escapeHtml(docTitle)} #</p>
        <p style="font-weight:700;color:#0F172A;">${escapeHtml(invoice.invoiceNumber)}</p>
      </div>
      <div>
        <p style="font-size:10px;font-weight:800;letter-spacing:2px;color:${accent};margin-bottom:6px;">DATE OF ISSUE</p>
        <p style="font-weight:700;color:#0F172A;">${invoiceDate}</p>
      </div>
      ${dueDate ? `<div>
        <p style="font-size:10px;font-weight:800;letter-spacing:2px;color:${accent};margin-bottom:6px;">DUE DATE</p>
        <p style="font-weight:700;color:#0F172A;">${dueDate}</p>
      </div>` : ""}
      ${validUntil ? `<div>
        <p style="font-size:10px;font-weight:800;letter-spacing:2px;color:${accent};margin-bottom:6px;">VALID UNTIL</p>
        <p style="font-weight:700;color:#0F172A;">${validUntil}</p>
      </div>` : ""}
    </div>
    <div style="display:flex;justify-content:space-between;margin-bottom:36px;">
      <div>
        <p style="font-size:11px;font-weight:800;letter-spacing:2px;color:${accent};margin-bottom:8px;">BILL TO</p>
        <p style="font-size:14px;font-weight:600;color:#0F172A;">${customerName}</p>
        ${customerPhone ? `<p style="font-size:12px;color:#64748B;margin-top:2px;">${customerPhone}</p>` : ""}
      </div>
      <div style="text-align:right;">
        <p style="font-size:11px;color:#64748B;">${escapeHtml(farmName)}</p>
        ${profile.phone ? `<p style="font-size:11px;color:#64748B;">${escapeHtml(profile.phone)}</p>` : ""}
        ${profile.email ? `<p style="font-size:11px;color:#64748B;">${escapeHtml(profile.email)}</p>` : ""}
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
      <thead>
        <tr style="border-top:2px solid ${accent};border-bottom:2px solid ${accent};">
          <th style="padding:10px 8px 10px 0;font-size:11px;font-weight:800;letter-spacing:1px;color:${accent};text-align:left;">DESCRIPTION</th>
          <th style="padding:10px 8px;font-size:11px;font-weight:800;letter-spacing:1px;color:${accent};text-align:right;">UNIT COST</th>
          <th style="padding:10px 8px;font-size:11px;font-weight:800;letter-spacing:1px;color:${accent};text-align:center;">QTY</th>
          <th style="padding:10px 0;font-size:11px;font-weight:800;letter-spacing:1px;color:${accent};text-align:right;">AMOUNT</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="4" style="padding:24px;text-align:center;color:#5F6E85;">No items</td></tr>`}</tbody>
    </table>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;">
      <div>
        <p style="font-size:13px;color:#64748B;">GRAND TOTAL</p>
        <p style="font-size:40px;font-weight:300;color:${accent};">${formatKES(total)}</p>
      </div>
      <div style="min-width:260px;font-size:13px;">
        <div style="display:flex;justify-content:space-between;padding:6px 0;"><strong style="color:#0F172A;">SUBTOTAL</strong><span>${formatKES(total)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #E5E7EB;"><strong style="color:#0F172A;">PAID</strong><span style="color:#166534;">${formatKES(paid)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:10px 0;"><strong style="color:#0F172A;font-size:14px;">BALANCE</strong><strong style="color:${total - paid > 0 ? "#DC2626" : "#166534"};font-size:15px;">${formatKES(total - paid)}</strong></div>
      </div>
    </div>
    ${notesTermsHtml(profile)}
    ${bankDetailsHtml(profile, accent)}
    ${signatureFooterHtml(profile, accent, "right")}
    <div style="text-align:right;margin-top:24px;border-top:2px solid ${accent};padding-top:16px;">
      <p style="font-size:13px;font-weight:600;color:${accent};">THANK YOU FOR YOUR BUSINESS!</p>
      <p style="font-size:10px;color:#CBD5E1;margin-top:4px;">${escapeHtml(farmName)} · Wangari Farm OS</p>
    </div>`;
    return baseDoc(invoice.invoiceNumber, body);
  }

  /* ── TEAL ESTIMATE (PBC-style From/To bars + notes) ── */
  if (tId === "teal-estimate") {
    const body = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:44px;flex-direction:${layout.logoPosition === "right" ? "row-reverse" : "row"};">
      <div style="display:flex;align-items:center;gap:14px;${layout.logoPosition === "center" ? "flex-direction:column;align-items:center;text-align:center;" : ""}${layout.logoPosition === "hidden" ? "display:none;" : ""}">
        ${logoHtml}
        <div>
          <p style="font-size:26px;font-weight:800;color:#1F2937;line-height:1.1;">${escapeHtml(farmName)}</p>
          ${profile.slogan ? `<p style="font-size:12px;color:#64748B;">${escapeHtml(profile.slogan)}</p>` : ""}
        </div>
      </div>
      <div style="font-size:13px;color:#374151;text-align:right;line-height:1.9;">
        <p><strong>Date:</strong> ${invoiceDate}</p>
        <p><strong>${escapeHtml(docTitle)} Number:</strong> ${escapeHtml(invoice.invoiceNumber)}</p>
        <p><strong>${docTitle === "QUOTE" || docTitle === "ESTIMATE" ? "Estimate For:" : "Customer:"}</strong> ${customerName}</p>
        ${validUntil ? `<p><strong>Valid Until:</strong> ${validUntil}</p>` : ""}
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:36px;">
      <tr>
        <td style="width:50%;padding-right:20px;vertical-align:top;">
          <div style="background:${accent};color:white;text-align:center;padding:8px;border-radius:4px;font-size:12px;font-weight:700;margin-bottom:12px;">From</div>
          <p style="font-size:14px;font-weight:700;color:#1F2937;">${escapeHtml(farmName)}</p>
          ${profile.address ? `<p style="font-size:13px;color:#4B5563;margin-top:4px;white-space:pre-line;">${escapeHtml(profile.address)}</p>` : ""}
          ${profile.phone ? `<p style="font-size:13px;color:#4B5563;margin-top:6px;">${escapeHtml(profile.phone)}</p>` : ""}
          ${profile.email ? `<p style="font-size:13px;color:#4B5563;">${escapeHtml(profile.email)}</p>` : ""}
        </td>
        <td style="width:50%;padding-left:20px;vertical-align:top;">
          <div style="background:${accent};color:white;text-align:center;padding:8px;border-radius:4px;font-size:12px;font-weight:700;margin-bottom:12px;">To</div>
          <p style="font-size:14px;font-weight:700;color:#1F2937;">${customerName}</p>
          ${customerPhone ? `<p style="font-size:13px;color:#4B5563;margin-top:4px;">${customerPhone}</p>` : ""}
        </td>
      </tr>
    </table>
    <table style="width:100%;border-collapse:collapse;margin-bottom:36px;">
      <thead>
        <tr style="background:${accent};">
          <th style="padding:10px;color:white;font-size:12px;font-weight:700;text-align:left;">Description</th>
          <th style="padding:10px;color:white;font-size:12px;font-weight:700;text-align:right;">Unit Cost</th>
          <th style="padding:10px;color:white;font-size:12px;font-weight:700;text-align:center;">Qty</th>
          <th style="padding:10px;color:white;font-size:12px;font-weight:700;text-align:right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${(Array.isArray(items) ? items : []).map((item: any, i: number) => `
        <tr style="background:${i % 2 === 1 ? "#F9FAFB" : "white"};border:1px solid #E5E7EB;">
          <td style="padding:12px;font-size:13px;color:#1F2937;">${escapeHtml(item.name || "Item")}</td>
          <td style="padding:12px;font-size:13px;color:#6B7280;text-align:right;">${Number(item.price || 0).toLocaleString()}</td>
          <td style="padding:12px;font-size:13px;color:#6B7280;text-align:center;">${item.quantity || 1}</td>
          <td style="padding:12px;font-size:13px;color:#1F2937;font-weight:600;text-align:right;">${formatKES(Number(item.quantity || 1) * Number(item.price || 0))}</td>
        </tr>`).join("") || `<tr><td colspan="4" style="padding:24px;text-align:center;color:#5F6E85;">No items</td></tr>`}
      </tbody>
    </table>
    <table style="width:100%;border-collapse:collapse;margin-bottom:36px;">
      <tr>
        <td style="width:50%;vertical-align:top;">
          ${profile.invoiceNotes || profile.invoiceTerms ? `
          <div style="background:${accent};color:white;text-align:center;padding:8px;border-radius:4px;font-size:12px;font-weight:700;margin-bottom:12px;">Notes</div>
          <p style="font-size:13px;color:#4B5563;line-height:1.7;">${escapeHtml(profile.invoiceNotes || profile.invoiceTerms)}</p>` : ""}
        </td>
        <td style="width:50%;vertical-align:top;padding-left:24px;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            ${[
              ["Subtotal", formatKES(total)],
              ["Discount", "—"],
              ["Tax", paid >= total ? "—" : "—"],
              ["Total " + docTitle.toLowerCase(), formatKES(total)],
            ].map(([l, v], i) => `
            <tr style="background:${i % 2 === 1 ? "#F9FAFB" : "white"};border:1px solid #E5E7EB;">
              <td style="padding:10px 14px;color:#6B7280;${i === 3 ? "font-weight:700;color:#1F2937;" : ""}">${l}</td>
              <td style="padding:10px 14px;text-align:right;${i === 3 ? "font-weight:800;color:#1F2937;" : "color:#1F2937;"}">${v}</td>
            </tr>`).join("")}
          </table>
        </td>
      </tr>
    </table>
    ${signatureFooterHtml(profile, accent, "left")}
    <p style="text-align:center;font-size:11px;color:#9CA3AF;border-top:1px solid #E5E7EB;padding-top:20px;">Generated by Wangari Farm OS</p>`;
    return baseDoc(invoice.invoiceNumber, body);
  }

  /* ── CORPORATE NAVY (quote form w/ acceptance block) ── */
  if (tId === "corporate-navy") {
    const body = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;flex-direction:${layout.logoPosition === "right" ? "row-reverse" : "row"};">
      <div style="display:flex;align-items:center;gap:16px;${layout.logoPosition === "center" ? "flex-direction:column;align-items:center;text-align:center;" : ""}${layout.logoPosition === "hidden" ? "display:none;" : ""}">
        ${logoHtml}
        <div>
          <p style="font-size:22px;font-weight:600;color:#1F2937;">${escapeHtml(farmName)}</p>
          <div style="font-size:11px;color:#6B7280;line-height:1.7;margin-top:4px;">
            ${profile.address ? `<span style="display:block;">${escapeHtml(profile.address)}</span>` : ""}
            ${profile.phone ? `<span style="display:block;">Phone: ${escapeHtml(profile.phone)}</span>` : ""}
            ${profile.email ? `<span style="display:block;">${escapeHtml(profile.email)}</span>` : ""}
            ${profile.tinNumber ? `<span style="display:block;">TIN/PIN: ${escapeHtml(profile.tinNumber)}</span>` : ""}
          </div>
        </div>
      </div>
      <div style="text-align:${layout.headerPosition};${layout.logoPosition === "right" ? "order:-1;" : ""}">
        <p style="font-size:38px;font-weight:800;color:${accent};letter-spacing:4px;">${escapeHtml(docTitle)}</p>
        <table style="margin-left:auto;margin-top:12px;font-size:12px;border-collapse:collapse;">
          <tr><td style="padding:3px 8px;color:#6B7280;text-align:right;">DATE</td><td style="border:1px solid #D1D5DB;padding:3px 10px;font-weight:600;">${invoiceDate}</td></tr>
          <tr><td style="padding:3px 8px;color:#6B7280;text-align:right;">${escapeHtml(docTitle)} #</td><td style="border:1px solid #D1D5DB;padding:3px 10px;font-weight:600;">${escapeHtml(invoice.invoiceNumber)}</td></tr>
          ${validUntil ? `<tr><td style="padding:3px 8px;color:#6B7280;text-align:right;">VALID UNTIL</td><td style="border:1px solid #D1D5DB;padding:3px 10px;font-weight:600;">${validUntil}</td></tr>` : ""}
          ${dueDate ? `<tr><td style="padding:3px 8px;color:#6B7280;text-align:right;">DUE</td><td style="border:1px solid #D1D5DB;padding:3px 10px;font-weight:600;">${dueDate}</td></tr>` : ""}
        </table>
      </div>
    </div>
    <div style="background:${accent};color:white;padding:8px 16px;font-size:12px;font-weight:700;letter-spacing:1px;display:inline-block;margin-bottom:12px;">CUSTOMER</div>
    <div style="font-size:13px;color:#374151;line-height:1.7;margin-bottom:24px;">
      <p style="font-weight:700;color:#0F172A;">${customerName}</p>
      ${customerPhone ? `<p>${customerPhone}</p>` : ""}
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <thead>
        <tr style="background:${accent};">
          <th style="padding:10px 14px;color:white;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;text-align:left;">Description</th>
          <th style="padding:10px 14px;color:white;font-size:11px;font-weight:700;text-transform:uppercase;text-align:right;">Unit Price</th>
          <th style="padding:10px 14px;color:white;font-size:11px;font-weight:700;text-transform:uppercase;text-align:center;">Qty</th>
          <th style="padding:10px 14px;color:white;font-size:11px;font-weight:700;text-transform:uppercase;text-align:right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${(Array.isArray(items) ? items : []).map((item: any, i: number) => `
        <tr style="border:1px solid #E5E7EB;${i % 2 === 1 ? "background:#F8FAFC;" : ""}">
          <td style="padding:11px 14px;font-size:13px;color:#0F172A;font-weight:600;">${escapeHtml(item.name || "Item")}</td>
          <td style="padding:11px 14px;font-size:13px;color:#64748B;text-align:right;">${Number(item.price || 0).toLocaleString()}</td>
          <td style="padding:11px 14px;font-size:13px;color:#64748B;text-align:center;">${item.quantity || 1}</td>
          <td style="padding:11px 14px;font-size:13px;color:#0F172A;font-weight:600;text-align:right;">${formatKES(Number(item.quantity || 1) * Number(item.price || 0))}</td>
        </tr>`).join("") || `<tr><td colspan="4" style="padding:24px;text-align:center;color:#5F6E85;">No items</td></tr>`}
      </tbody>
    </table>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:32px;margin-bottom:28px;">
      <div style="flex:1;">
        ${profile.invoiceTerms ? `
        <div style="background:${accent};color:white;padding:8px 16px;font-size:12px;font-weight:700;letter-spacing:1px;display:inline-block;margin-bottom:10px;">TERMS AND CONDITIONS</div>
        <p style="font-size:11px;color:#6B7280;line-height:1.8;">${escapeHtml(profile.invoiceTerms)}</p>` : ""}
      </div>
      <table style="min-width:240px;border-collapse:collapse;font-size:13px;">
        <tr><td style="padding:6px 10px;color:#6B7280;text-align:right;">Subtotal</td><td style="padding:6px 10px;text-align:right;font-weight:600;">${formatKES(total)}</td></tr>
        <tr><td style="padding:6px 10px;color:#6B7280;text-align:right;">Paid</td><td style="padding:6px 10px;text-align:right;font-weight:600;color:#166534;">${formatKES(paid)}</td></tr>
        <tr><td style="padding:10px;border-top:2px solid #0F172A;font-weight:800;color:#0F172A;">TOTAL</td><td style="padding:10px;border-top:2px solid #0F172A;text-align:right;background:${accent};color:white;font-weight:800;font-size:16px;">${formatKES(total - paid)}</td></tr>
      </table>
    </div>
    <div style="border:1px solid #E5E7EB;border-radius:8px;padding:20px;margin-bottom:28px;">
      <p style="font-size:11px;color:#6B7280;font-style:italic;margin-bottom:20px;">Customer acceptance (sign below):</p>
      <div style="display:flex;justify-content:space-between;gap:40px;">
        <div style="flex:1;border-bottom:1px solid #94A3B8;padding-bottom:4px;min-height:40px;">
          ${signatureFooterHtml(profile, accent, "left")}
        </div>
        <div style="flex:1;border-bottom:1px solid #94A3B8;padding-bottom:4px;">
          <p style="font-size:10px;color:#5F6E85;margin-top:36px;">Print Name:</p>
        </div>
      </div>
    </div>
    ${notesTermsHtml(profile)}
    <p style="text-align:center;font-size:12px;color:#6B7280;">If you have any questions about this ${docTitle.toLowerCase()}, please contact ${escapeHtml(profile.phone || profile.email || farmName)}</p>
    <p style="text-align:center;font-size:13px;font-weight:700;color:${accent};margin-top:8px;font-style:italic;">Thank You For Your Business!</p>
    <p style="text-align:center;font-size:10px;color:#CBD5E1;margin-top:12px;">${escapeHtml(farmName)} · Wangari Farm OS</p>`;
    return baseDoc(invoice.invoiceNumber, body);
  }

  /* ── LEDGER REPORT (spreadsheet-style) ── */
  if (tId === "ledger") {
    const rows = (Array.isArray(items) ? items : [])
      .map((item: any, i: number) => `
      <tr style="background:${i % 2 === 1 ? "#F3F4F6" : "white"};">
        <td style="padding:10px 14px;font-size:13px;color:#374151;border-bottom:1px solid #E5E7EB;">${safeDate(item.date || invoice.createdAt)}</td>
        <td style="padding:10px 14px;font-size:13px;color:#111827;font-weight:600;border-bottom:1px solid #E5E7EB;">${escapeHtml(item.name || "Item")}</td>
        <td style="padding:10px 14px;font-size:13px;color:#6B7280;border-bottom:1px solid #E5E7EB;text-align:center;">${item.quantity || 1}</td>
        <td style="padding:10px 14px;font-size:13px;color:#374151;border-bottom:1px solid #E5E7EB;text-align:right;">${Number(item.price || 0).toLocaleString()}</td>
        <td style="padding:10px 14px;font-size:13px;color:#111827;font-weight:600;border-bottom:1px solid #E5E7EB;text-align:right;">${formatKES(Number(item.quantity || 1) * Number(item.price || 0))}</td>
      </tr>`)
      .join("");
    const body = `
    <div style="border-top:6px solid #1E3A8A;margin-bottom:28px;"></div>
    <div style="margin-bottom:28px;">
      <p style="font-size:20px;font-weight:600;color:${accent};">${escapeHtml(farmName)}</p>
      <p style="font-size:12px;color:#6B7280;margin-top:2px;">${[profile.address, profile.phone].filter(Boolean).map(escapeHtml).join(" · ")}</p>
    </div>
    <h1 style="font-size:34px;font-weight:800;color:#1E3A8A;margin-bottom:6px;text-align:${layout.headerPosition};">${escapeHtml(docTitle)}</h1>
    <p style="font-size:13px;color:#DB2777;font-weight:600;margin-bottom:24px;">${invoiceDate}${dueDate ? ` — ${dueDate}` : ""} · Ref ${escapeHtml(invoice.invoiceNumber)}</p>
    <div style="display:flex;gap:40px;margin-bottom:28px;font-size:13px;">
      <div><p style="font-weight:700;color:#1F2937;">Customer</p><p style="color:#6B7280;">${customerName}</p></div>
      ${customerPhone ? `<div><p style="font-weight:700;color:#1F2937;">Phone</p><p style="color:#6B7280;">${customerPhone}</p></div>` : ""}
      <div><p style="font-weight:700;color:#1F2937;">Status</p><p style="color:#6B7280;text-transform:capitalize;">${escapeHtml(invoice.paymentStatus || "pending")}</p></div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <thead>
        <tr style="border-bottom:2px solid #1E3A8A;">
          <th style="padding:10px 14px;font-size:12px;font-weight:700;color:#1E3A8A;text-align:left;">Date</th>
          <th style="padding:10px 14px;font-size:12px;font-weight:700;color:#1E3A8A;text-align:left;">Description</th>
          <th style="padding:10px 14px;font-size:12px;font-weight:700;color:#1E3A8A;text-align:center;">Qty</th>
          <th style="padding:10px 14px;font-size:12px;font-weight:700;color:#1E3A8A;text-align:right;">Unit</th>
          <th style="padding:10px 14px;font-size:12px;font-weight:700;color:#1E3A8A;text-align:right;">Amount</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="5" style="padding:24px;text-align:center;color:#5F6E85;">No entries</td></tr>`}</tbody>
    </table>
    <div style="display:flex;justify-content:flex-end;margin-bottom:32px;">
      <table style="min-width:280px;border-collapse:collapse;font-size:13px;">
        <tr style="background:#EEF2FF;"><td style="padding:8px 14px;font-weight:700;color:#1E3A8A;">TOTAL</td><td style="padding:8px 14px;text-align:right;font-weight:800;color:#1E3A8A;">${formatKES(total)}</td></tr>
        <tr><td style="padding:8px 14px;color:#6B7280;">Paid</td><td style="padding:8px 14px;text-align:right;color:#166534;">${formatKES(paid)}</td></tr>
        <tr style="background:#F3F4F6;"><td style="padding:8px 14px;font-weight:700;color:#1F2937;">Balance</td><td style="padding:8px 14px;text-align:right;font-weight:700;color:${total - paid > 0 ? "#DC2626" : "#166534"};">${formatKES(total - paid)}</td></tr>
      </table>
    </div>
    ${notesTermsHtml(profile)}
    ${signatureFooterHtml(profile, accent, "right")}
    <p style="text-align:center;font-size:10px;color:#CBD5E1;border-top:1px solid #E5E7EB;padding-top:16px;">${escapeHtml(farmName)} · Generated by Wangari Farm OS</p>`;
    return baseDoc(invoice.invoiceNumber, body);
  }

  /* ── THERMAL SLIP (80mm receipt style) ── */
  const slip = `
    <div style="font-family:'Courier New',monospace;font-size:12px;color:#0F172A;max-width:320px;margin:0 auto;">
      <div style="text-align:center;border-bottom:1px dashed #0F172A;padding-bottom:10px;margin-bottom:10px;">
        <p style="font-size:15px;font-weight:800;">${escapeHtml(farmName.toUpperCase())}</p>
        ${profile.phone ? `<p style="font-size:11px;">Tel: ${escapeHtml(profile.phone)}</p>` : ""}
        ${profile.tinNumber ? `<p style="font-size:11px;">PIN: ${escapeHtml(profile.tinNumber)}</p>` : ""}
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;">
        <span>${escapeHtml(invoice.invoiceNumber)}</span>
        <span>${new Date(invoice.createdAt).toLocaleDateString("en-KE")}</span>
      </div>
      <div style="font-size:11px;margin-bottom:8px;">Customer: ${customerName}</div>
      <div style="border-top:1px dashed #0F172A;border-bottom:1px dashed #0F172A;padding:8px 0;margin-bottom:8px;">
        ${(Array.isArray(items) ? items : []).map((item: any) => `
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span>${escapeHtml(item.name || "Item")} x${item.quantity || 1}</span>
          <span>${formatKES(Number(item.quantity || 1) * Number(item.price || 0))}</span>
        </div>`).join("") || `<div>No items</div>`}
      </div>
      <div style="display:flex;justify-content:space-between;font-weight:800;font-size:14px;">
        <span>TOTAL</span><span>${formatKES(total)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;">
        <span>PAID</span><span>${formatKES(paid)}</span>
      </div>
      ${total - paid > 0 ? `<div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;">
        <span>BALANCE</span><span>${formatKES(total - paid)}</span>
      </div>` : `<div style="text-align:center;font-weight:700;margin-top:4px;">** PAID IN FULL **</div>`}
      ${profile.signatureDataUrl ? `<div style="text-align:center;margin-top:10px;"><img src="${profile.signatureDataUrl}" alt="Signature" style="height:40px;object-fit:contain;" onerror="this.style.display='none'" /></div>` : ""}
      <div style="text-align:center;border-top:1px dashed #0F172A;margin-top:10px;padding-top:10px;font-size:10px;">
        <p>Thank you for your business!</p>
        ${profile.ctaText ? `<p style="margin-top:2px;">${escapeHtml(profile.ctaText)}</p>` : ""}
        ${profile.invoiceNotes ? `<p style="margin-top:2px;">${escapeHtml(profile.invoiceNotes)}</p>` : ""}
        <p style="margin-top:4px;">Wangari Farm OS</p>
      </div>
    </div>`;
  return baseDoc(invoice.invoiceNumber, slip, "420px", "@page { margin: 0; } @media print { .page { padding: 8px; max-width: 80mm; } }");
}

/* ────────────────────────────────────────────────────────────
   Sale receipt generator — same templates, receipt-shaped data
   ──────────────────────────────────────────────────────────── */
export function generateReceiptHtml(
  sale: any,
  templateId: string,
  profile: FarmProfile,
  receiptNumber?: string
): string {
  // Reuse the invoice pipeline: a sale receipt is just an invoice with a
  // receipt number, fully-paid status, and receipt wording.
  const items = Array.isArray(sale.items)
    ? sale.items
    : [{ name: sale.items || sale.productType || "Sale", quantity: 1, price: Number(sale.totalAmount || 0) }];
  const invoiceShaped = {
    invoiceNumber: receiptNumber || `RCP-${String(sale.id).padStart(5, "0")}`,
    items,
    totalAmount: sale.totalAmount,
    amountPaid: sale.amountPaid ?? sale.totalAmount,
    paymentStatus: "paid",
    createdAt: sale.saleDate || sale.createdAt,
    dueDate: null,
    customer: sale.customer,
  };
  return generateInvoiceHtml(invoiceShaped, templateId, profile, "RECEIPT");
}

/* ────────────────────────────────────────────────────────────
   Quote generator — quote wording on the same engines
   ──────────────────────────────────────────────────────────── */
export function generateQuoteHtml(
  quote: any,
  templateId: string,
  profile: FarmProfile
): string {
  const shaped = {
    ...quote,
    paymentStatus: quote.status === "accepted" ? "paid" : quote.status || "pending",
  };
  return generateInvoiceHtml(shaped, templateId, profile, "QUOTE");
}
