/**
 * @typedef {object} PriceFeedSnapshot
 * @property {string} provider
 * @property {string} sourceLabel
 * @property {Record<string, Record<string, number>>} fiatRates
 * @property {Record<string, Record<string, number>>} coinRates
 * @property {string} fetchedAt
 * @property {string} [error]
 * @property {Record<string, unknown>} [extra]
 */

/**
 * @typedef {object} PriceFeedContext
 * @property {string} providerId
 * @property {string} fetchedAt
 * @property {Record<string, unknown>} options buildPriceSnapshot 에 넘긴 옵션
 * @property {(id: string) => Promise<PriceFeedSnapshot>} delegate 다른 등록된 제공자로 위임 (동일 fetchedAt)
 */

/** @typedef {(ctx: PriceFeedContext) => Promise<PriceFeedSnapshot>} PriceFeedHandler */

export {};
