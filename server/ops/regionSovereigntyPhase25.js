/**
 * Phase 25: 테넌트·리전 규칙 + EU/US VAT 참고율(힌트·설정 — 법적 확정 세액은 외부 세무 엔진).
 */

const KEY = "p2p.tenant_region_rules";

function readJson(db) {
  const row = db.prepare(`SELECT value_json FROM platform_settings WHERE setting_key = ?`).get(KEY);
  try {
    return row?.value_json ? JSON.parse(String(row.value_json)) : {};
  } catch {
    return {};
  }
}

function writeJson(db, obj) {
  db.prepare(`
    INSERT INTO platform_settings (setting_key, value_json, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP
  `).run(KEY, JSON.stringify(obj));
}

const DEFAULT_VAT_BPS = { EU: 2000, US: 0 };

function normalizeDoc(raw) {
  const tenants =
    raw.tenants && typeof raw.tenants === "object" && !Array.isArray(raw.tenants)
      ? { ...raw.tenants }
      : {};
  const vat_reference_bps = { ...DEFAULT_VAT_BPS };
  if (raw.vat_reference_bps && typeof raw.vat_reference_bps === "object") {
    for (const [k, v] of Object.entries(raw.vat_reference_bps)) {
      const key = String(k || "").trim().toUpperCase().slice(0, 8);
      const bps = Math.min(50_000, Math.max(0, Math.floor(Number(v) || 0)));
      if (key) vat_reference_bps[key] = bps;
    }
  }
  return { version: 1, tenants, vat_reference_bps, notes: String(raw.notes || "").slice(0, 2000) };
}

export function readTenantRegionRulesAdmin(db) {
  return normalizeDoc(readJson(db));
}

export function mergeTenantRegionRulesPatch(db, body) {
  const prev = normalizeDoc(readJson(db));
  const next = { ...prev, updated_at: new Date().toISOString() };
  if (body && typeof body === "object") {
    if (body.tenants && typeof body.tenants === "object" && !Array.isArray(body.tenants)) {
      for (const [code, rule] of Object.entries(body.tenants)) {
        const c = String(code || "")
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9_-]/g, "")
          .slice(0, 48);
        if (!c) continue;
        if (rule === null) {
          delete next.tenants[c];
          continue;
        }
        if (rule && typeof rule === "object") {
          next.tenants[c] = {
            data_region_default: String(rule.data_region_default || "")
              .trim()
              .toUpperCase()
              .slice(0, 16),
            vat_profile: String(rule.vat_profile || "")
              .trim()
              .toUpperCase()
              .slice(0, 32),
            eu_vat_bps_override:
              rule.eu_vat_bps_override != null && Number.isFinite(Number(rule.eu_vat_bps_override))
                ? Math.min(50_000, Math.max(0, Math.floor(Number(rule.eu_vat_bps_override))))
                : null,
            us_sales_tax_bps_override:
              rule.us_sales_tax_bps_override != null && Number.isFinite(Number(rule.us_sales_tax_bps_override))
                ? Math.min(50_000, Math.max(0, Math.floor(Number(rule.us_sales_tax_bps_override))))
                : null,
            notes: String(rule.notes || "").slice(0, 500),
          };
        }
      }
    }
    if (body.vat_reference_bps && typeof body.vat_reference_bps === "object") {
      next.vat_reference_bps = { ...next.vat_reference_bps };
      for (const [k, v] of Object.entries(body.vat_reference_bps)) {
        const key = String(k || "").trim().toUpperCase().slice(0, 8);
        if (!key) continue;
        next.vat_reference_bps[key] = Math.min(50_000, Math.max(0, Math.floor(Number(v) || 0)));
      }
    }
    if (body.notes != null) next.notes = String(body.notes).slice(0, 2000);
  }
  writeJson(db, next);
  return normalizeDoc(readJson(db));
}

/**
 * 테넌트 코드(대문자)와 과세 표준 리전 키(EU|US)로 VAT/세일즈세 **추정** minor.
 * @param {import("better-sqlite3").Database} db
 * @param {string} tenantCode
 * @param {"EU"|"US"} regionKey
 * @param {number} taxableBaseMinor
 */
export function estimateVatMinorForTenantRegion(db, tenantCode, regionKey, taxableBaseMinor) {
  const doc = normalizeDoc(readJson(db));
  const t = String(tenantCode || "")
    .trim()
    .toUpperCase()
    .slice(0, 48);
  const rk = String(regionKey || "").trim().toUpperCase();
  const base = Math.trunc(Number(taxableBaseMinor) || 0);
  if (!t || base <= 0 || (rk !== "EU" && rk !== "US")) {
    return { vat_minor: 0, vat_bps_applied: 0, source: "none" };
  }
  const tr = doc.tenants[t];
  let bps = rk === "EU" ? doc.vat_reference_bps.EU ?? DEFAULT_VAT_BPS.EU : doc.vat_reference_bps.US ?? DEFAULT_VAT_BPS.US;
  let source = "vat_reference_bps";
  if (tr) {
    if (rk === "EU" && tr.eu_vat_bps_override != null) {
      bps = tr.eu_vat_bps_override;
      source = "tenant.eu_vat_bps_override";
    }
    if (rk === "US" && tr.us_sales_tax_bps_override != null) {
      bps = tr.us_sales_tax_bps_override;
      source = "tenant.us_sales_tax_bps_override";
    }
  }
  const vat_minor = Math.floor((base * bps) / 10_000);
  return { vat_minor, vat_bps_applied: bps, vat_profile: tr?.vat_profile || null, source };
}

/** 공개·세일즈용 — 금액·PII 없음 */
export function getRegionSovereigntyPublicHints(db) {
  const doc = normalizeDoc(readJson(db));
  return {
    vat_reference_bps: doc.vat_reference_bps,
    tenant_rule_count: Object.keys(doc.tenants).length,
    hints: [
      "EU/US bps는 참고용이며 실제 VAT/GST/Sales tax는 거주지·공급지 규칙에 따릅니다.",
      "테넌트별 규칙은 GET /api/public/tenant-hints 와 별도로 ops에서 tenant-region-rules 로 관리합니다.",
    ],
  };
}
