import { Router, Request, Response } from "express";
import { prisma } from "../db.js";

/**
 * POST /api/contact — marketing site contact form → CRM lead.
 * Public but rate-limited (global /api limiter applies). Never leaks whether
 * an email already exists; always answers the same.
 */
const router = Router();

router.post("/contact", async (req: Request, res: Response) => {
  try {
    const { name, email, phone, message, company, source = "contact_form" } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: "Name is required" });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
      return res.status(400).json({ error: "A valid email is required" });
    }
    if (!message || !String(message).trim()) return res.status(400).json({ error: "Message is required" });
    if (String(message).length > 3000) return res.status(400).json({ error: "Message too long (max 3000 chars)" });

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanSource = String(source).trim().slice(0, 40) || "contact_form";

    await prisma.crmContact.create({
      data: {
        name: String(name).trim().slice(0, 120),
        email: cleanEmail,
        phone: phone ? String(phone).trim().slice(0, 30) : null,
        company: company ? String(company).trim().slice(0, 120) : null,
        type: cleanSource === "coop_pilot" ? "partner" : "lead",
        stage: "lead",
        source: cleanSource,
      },
    });

    // Store the message itself as the first note.
    const contact = await prisma.crmContact.findFirst({
      where: { email: cleanEmail, source: cleanSource },
      orderBy: { id: "desc" },
    });
    if (contact) {
      await prisma.crmContactNote.create({
        data: { contactId: contact.id, body: `Inquiry (${cleanSource}):\n${String(message).trim()}` },
      });
    }

    // Background notification for cooperative pilot requests
    (async () => {
      try {
        const { sendEmail, wrapHtml } = await import("../lib/email.js");
        const adminEmail = process.env.ADMIN_EMAIL || "info@imeantech.com";
        if (cleanSource === "coop_pilot") {
          // Notify sales/admin team
          await sendEmail({
            to: adminEmail,
            subject: `🏛️ New Cooperative Pilot Request: ${company || name}`,
            html: wrapHtml(
              "New Cooperative Pilot Request",
              `<p><strong>Name:</strong> ${name}</p>
               <p><strong>Organization:</strong> ${company || "Not specified"}</p>
               <p><strong>Email:</strong> ${cleanEmail}</p>
               <p><strong>Phone:</strong> ${phone || "Not specified"}</p>
               <p><strong>Message:</strong><br/>${String(message).replace(/\n/g, "<br/>")}</p>`
            ),
            template: "oneoff",
          });

          // Send confirmation to the applicant
          await sendEmail({
            to: cleanEmail,
            subject: "We received your Cooperative Pilot Request — Wangari",
            html: wrapHtml(
              "Thank you for contacting Wangari",
              `<p>Dear ${name},</p>
               <p>We received your request for a 30-day cooperative digital pilot for <strong>${company || "your group"}</strong>.</p>
               <p>Our agricultural enterprise team is reviewing your details and will call or message you on WhatsApp within 24 hours to schedule an introductory demonstration for your collection centers.</p>
               <p style="color:#64748b;font-size:13px;">If you have immediate questions, feel free to reply directly to this email or reach us at info@imeantech.com.</p>`
            ),
            template: "oneoff",
          });
        }
      } catch (notifyErr) {
        console.warn("[contact] Notification email failed:", notifyErr);
      }
    })();

    res.json({ success: true });
  } catch (error) {
    console.error("Contact form error:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
});

export default router;
