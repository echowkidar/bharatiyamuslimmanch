/**
 * PhonePe Payment Gateway - Standard Checkout (v2, OAuth based).
 *
 *   Auth   : POST {identity}/v1/oauth/token                (client_id, client_secret, client_version)
 *   Pay    : POST {pg}/checkout/v2/pay                     -> { orderId, state, redirectUrl }
 *   Status : GET  {pg}/checkout/v2/order/{merchantOrderId}/status
 *   Webhook: Authorization header = SHA256("username:password") configured in the PhonePe dashboard.
 *
 * Endpoints/field names follow PhonePe's published v2 docs. If PhonePe changes anything for your
 * merchant account, only this file needs to be touched.
 */
const crypto = require('crypto');
const cfg = require('./config');

const HOSTS = {
  production: { identity: 'https://api.phonepe.com/apis/identity-manager', pg: 'https://api.phonepe.com/apis/pg' },
  sandbox: { identity: 'https://api-preprod.phonepe.com/apis/pg-sandbox', pg: 'https://api-preprod.phonepe.com/apis/pg-sandbox' },
};
const H = () => HOSTS[cfg.PHONEPE.env];

let tok = { value: null, exp: 0 };
async function getToken() {
  if (tok.value && Date.now() < tok.exp - 60e3) return tok.value;
  const body = new URLSearchParams({
    client_id: cfg.PHONEPE.clientId,
    client_version: cfg.PHONEPE.clientVersion,
    client_secret: cfg.PHONEPE.clientSecret,
    grant_type: 'client_credentials',
  });
  const r = await fetch(H().identity + '/v1/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('PhonePe auth failed: ' + (j.message || j.code || r.status));
  tok = { value: j.access_token, exp: (j.expires_at ? j.expires_at * 1000 : Date.now() + 3300e3) };
  return tok.value;
}

async function createPayment({ merchantOrderId, amountPaise, redirectUrl, message, meta = {} }) {
  const token = await getToken();
  const r = await fetch(H().pg + '/checkout/v2/pay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'O-Bearer ' + token },
    body: JSON.stringify({
      merchantOrderId,
      amount: amountPaise,
      expireAfter: 1200,
      metaInfo: meta,
      paymentFlow: { type: 'PG_CHECKOUT', message: message || 'Bharatiya Muslim Manch', merchantUrls: { redirectUrl } },
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.redirectUrl) throw new Error('PhonePe pay failed: ' + (j.message || j.code || r.status));
  return { redirectUrl: j.redirectUrl, gatewayRef: j.orderId, raw: j };
}

// returns { state: 'COMPLETED'|'FAILED'|'PENDING', raw }
async function orderStatus(merchantOrderId) {
  const token = await getToken();
  const r = await fetch(`${H().pg}/checkout/v2/order/${encodeURIComponent(merchantOrderId)}/status?details=false`, {
    headers: { 'Content-Type': 'application/json', Authorization: 'O-Bearer ' + token },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('PhonePe status failed: ' + (j.message || j.code || r.status));
  return { state: j.state || 'PENDING', raw: j };
}

function verifyWebhookAuth(header) {
  const { webhookUser, webhookPass } = cfg.PHONEPE;
  if (!webhookUser || !webhookPass || !header) return false;
  const expected = crypto.createHash('sha256').update(`${webhookUser}:${webhookPass}`).digest('hex');
  const got = String(header).replace(/^SHA256\s*\(?|\)?$/gi, '').trim().toLowerCase();
  return got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

module.exports = { createPayment, orderStatus, verifyWebhookAuth };
