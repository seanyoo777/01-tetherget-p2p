/** P2P membership tiers (mock) — aligned for future OneAI Points bridge. */

export const MEMBERSHIP_TIER_IDS = Object.freeze({
  BASIC: "basic",
  SILVER: "silver",
  GOLD: "gold",
  PLATINUM: "platinum",
  VIP: "vip",
});

/** @type {readonly { id: string, label: string, discountPct: number, pointsRequired: number }[]} */
export const MEMBERSHIP_TIERS = Object.freeze([
  { id: MEMBERSHIP_TIER_IDS.BASIC, label: "Basic", discountPct: 0, pointsRequired: 0 },
  { id: MEMBERSHIP_TIER_IDS.SILVER, label: "Silver", discountPct: 5, pointsRequired: 1_000 },
  { id: MEMBERSHIP_TIER_IDS.GOLD, label: "Gold", discountPct: 10, pointsRequired: 5_000 },
  { id: MEMBERSHIP_TIER_IDS.PLATINUM, label: "Platinum", discountPct: 20, pointsRequired: 15_000 },
  { id: MEMBERSHIP_TIER_IDS.VIP, label: "VIP", discountPct: 30, pointsRequired: 50_000 },
]);

/**
 * @param {string} tierId
 */
export function getMembershipTierById(tierId) {
  return MEMBERSHIP_TIERS.find((t) => t.id === tierId) ?? MEMBERSHIP_TIERS[0];
}

/**
 * @param {number} points
 */
export function resolveTierFromPoints(points) {
  const pts = Math.max(0, Number(points) || 0);
  let current = MEMBERSHIP_TIERS[0];
  for (const tier of MEMBERSHIP_TIERS) {
    if (pts >= tier.pointsRequired) current = tier;
  }
  return current;
}

/**
 * @param {number} points
 */
export function getNextMembershipTier(points) {
  const pts = Math.max(0, Number(points) || 0);
  const current = resolveTierFromPoints(pts);
  const idx = MEMBERSHIP_TIERS.findIndex((t) => t.id === current.id);
  if (idx < 0 || idx >= MEMBERSHIP_TIERS.length - 1) return null;
  return MEMBERSHIP_TIERS[idx + 1];
}

/**
 * @param {number} points
 */
export function computeTierProgress(points) {
  const pts = Math.max(0, Number(points) || 0);
  const current = resolveTierFromPoints(pts);
  const next = getNextMembershipTier(pts);
  if (!next) {
    return { current, next: null, progressPct: 100, pointsToNext: 0, pointsInBand: pts - current.pointsRequired };
  }
  const band = next.pointsRequired - current.pointsRequired;
  const inBand = pts - current.pointsRequired;
  const progressPct = band > 0 ? Math.min(100, Math.round((inBand / band) * 100)) : 0;
  return {
    current,
    next,
    progressPct,
    pointsToNext: Math.max(0, next.pointsRequired - pts),
    pointsInBand: inBand,
  };
}
