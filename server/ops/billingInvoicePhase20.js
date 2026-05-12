/**
 * Phase 20: 인보이스 PDF·결제 링크·이메일(선택 SMTP).
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import nodemailer from "nodemailer";
import { getMonetizationPublic } from "./betaPhase17.js";

function invoicePdfDir() {
  const dir = path.resolve(process.cwd(), "server", "invoices-pdf");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {object} inv billing_invoices row
 */
export async function generateInvoicePdfFile(db, inv) {
  const id = Number(inv.id);
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const title = `Tetherget — Invoice #${id}`;
  const lines = [
    title,
    `Period: ${inv.period_start} .. ${inv.period_end}`,
    `Tier: ${inv.tier_label}`,
    `Currency: ${inv.currency}`,
    `Fee (minor units): ${inv.fee_minor_total}`,
    `Ledger rows: ${inv.ledger_row_count}`,
    `Status: ${inv.status}`,
    `Issued at: ${inv.issued_at || ""}`,
  ];
  let y = 800;
  for (const line of lines) {
    page.drawText(String(line).slice(0, 120), { x: 48, y, size: 11, font, color: rgb(0.1, 0.1, 0.15) });
    y -= 18;
  }
  const bytes = await doc.save();
  const fp = path.join(invoicePdfDir(), `invoice-${id}.pdf`);
  fs.writeFileSync(fp, bytes);
  db.prepare(`UPDATE billing_invoices SET pdf_local_path = ? WHERE id = ?`).run(fp, id);
  return { path: fp, bytes: bytes.length };
}

export function buildInvoicePayToken(jwtSecret, invoiceId, issuedAtIso) {
  const h = crypto.createHmac("sha256", String(jwtSecret || "x"));
  h.update(`inv:${invoiceId}:${issuedAtIso}`);
  return h.digest("base64url").slice(0, 48);
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {NodeJS.ProcessEnv} env
 * @param {object} inv row after issue
 */
export function buildPaymentLinkForInvoice(db, env, inv) {
  const pub = getMonetizationPublic(db, env);
  const base = String(pub?.billing_portal_url || env.BILLING_PORTAL_URL || "").trim();
  if (!base) return "";
  const secret = String(env.JWT_SECRET || "").trim() || "tetherget-dev-secret-change-me";
  const token = buildInvoicePayToken(secret, inv.id, inv.issued_at || "");
  const u = new URL(base.includes("://") ? base : `https://${base}`);
  u.searchParams.set("invoiceId", String(inv.id));
  u.searchParams.set("t", token);
  return u.toString();
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {NodeJS.ProcessEnv} env
 * @param {number} invoiceId
 * @param {string} token
 */
export function verifyInvoicePayToken(db, env, invoiceId, token) {
  const inv = db.prepare(`SELECT * FROM billing_invoices WHERE id = ?`).get(invoiceId);
  if (!inv || inv.status !== "issued") return { ok: false };
  const secret = String(env.JWT_SECRET || "").trim() || "tetherget-dev-secret-change-me";
  const expect = buildInvoicePayToken(secret, inv.id, inv.issued_at || "");
  const a = String(token || "").trim();
  if (!a || a.length !== expect.length) return { ok: false };
  try {
    if (!crypto.timingSafeEqual(Buffer.from(a), Buffer.from(expect))) return { ok: false };
  } catch {
    return { ok: false };
  }
  return { ok: true, invoice: inv };
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {{ to: string; subject: string; text: string; html?: string; attachmentPath?: string }} p
 */
export async function sendInvoiceEmailOptional(env, p) {
  const host = String(env.SMTP_HOST || "").trim();
  if (!host) {
    return { ok: false, skipped: true, reason: "no_smtp_host" };
  }
  const port = Math.max(1, Number(env.SMTP_PORT || 587));
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: String(env.SMTP_SECURE || "0") === "1",
    auth: env.SMTP_USER
      ? {
          user: String(env.SMTP_USER),
          pass: String(env.SMTP_PASS || ""),
        }
      : undefined,
  });
  const attachments = [];
  if (p.attachmentPath && fs.existsSync(p.attachmentPath)) {
    attachments.push({ filename: path.basename(p.attachmentPath), path: p.attachmentPath });
  }
  await transporter.sendMail({
    from: String(env.SMTP_FROM || env.SMTP_USER || "billing@localhost"),
    to: p.to,
    subject: p.subject,
    text: p.text,
    html: p.html,
    attachments,
  });
  return { ok: true };
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {NodeJS.ProcessEnv} env
 * @param {object} inv issued row
 */
export async function finalizeIssuedInvoiceArtifacts(db, env, inv) {
  const pdf = await generateInvoicePdfFile(db, inv);
  const payUrl = buildPaymentLinkForInvoice(db, env, inv);
  if (payUrl) {
    db.prepare(`UPDATE billing_invoices SET payment_link_url = ? WHERE id = ?`).run(payUrl, inv.id);
  }
  const to = String(env.BILLING_INVOICE_EMAIL_TO || "").trim();
  let email = { ok: false, skipped: true };
  if (to) {
    try {
      email = await sendInvoiceEmailOptional(env, {
        to,
        subject: `Invoice #${inv.id} issued`,
        text: `Invoice ${inv.id} for ${inv.period_start}–${inv.period_end}. Fee minor: ${inv.fee_minor_total}. Pay: ${payUrl || "(no portal URL)"}`,
        attachmentPath: pdf.path,
      });
    } catch (e) {
      email = { ok: false, error: String(e?.message || e) };
    }
  }
  const st = email.ok ? "sent" : email.skipped ? "skipped" : "failed";
  db.prepare(`UPDATE billing_invoices SET issued_email_status = ?, issued_email_detail = ? WHERE id = ?`).run(
    st,
    JSON.stringify(email).slice(0, 2000),
    inv.id,
  );
  return { pdf, payment_link_url: payUrl || null, email };
}
