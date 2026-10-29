const { db, settings, nextCounter, audit } = require('./db');
const cfg = require('./config');
const U = require('./util');
const phonepe = require('./phonepe');

// ------------------------------------------------------------------ members
function approveMember(id, by = 'system') {
  const m = db.prepare('SELECT * FROM members WHERE id=?').get(id);
  if (!m) throw new Error('Member not found');
  const years = Math.max(1, parseInt(settings().membership_valid_years) || 1);
  const till = new Date(Date.now() + 5.5 * 3600e3);
  till.setUTCFullYear(till.getUTCFullYear() + years);
  let no = m.member_no;
  if (!no) {
    const seq = nextCounter('member');
    no = `BMM-${m.state_code || 'XX'}-${String(new Date().getFullYear()).slice(2)}-${String(seq).padStart(6, '0')}`;
  }
  db.prepare(`UPDATE members SET status='active', member_no=?, approved_by=?, approved_at=?, valid_till=COALESCE(NULLIF(valid_till,''),?) WHERE id=?`)
    .run(no, by, U.nowSql(), till.toISOString().slice(0, 10), id);
  return no;
}

function createMember(d, { source = 'web' } = {}) {
  const st = U.stateByCode(d.state_code);
  const info = db.prepare(`INSERT INTO members(name,father_name,dob,gender,mobile,email,state_code,state,district,city,address,pincode,occupation,qualification,photo,referral,source,designation)
    VALUES(@name,@father_name,@dob,@gender,@mobile,@email,@state_code,@state,@district,@city,@address,@pincode,@occupation,@qualification,@photo,@referral,@source,@designation)`)
    .run({
      name: d.name, father_name: d.father_name || null, dob: d.dob || null, gender: d.gender || null, mobile: d.mobile, email: d.email || null,
      state_code: d.state_code || null, state: st ? st.hi : d.state || null, district: d.district || null, city: d.city || null,
      address: d.address || null, pincode: d.pincode || null, occupation: d.occupation || null, qualification: d.qualification || null,
      photo: d.photo || null, referral: d.referral || null, source, designation: d.designation || 'सदस्य',
    });
  return info.lastInsertRowid;
}

// ---------------------------------------------------------------- donations
function newOrderId() { return 'BMM' + Date.now().toString(36).toUpperCase() + U.rand(3).toUpperCase(); }

function paymentConfig() {
  return {
    mode: cfg.PAYMENT_MODE,
    upiId: cfg.UPI_ID,
    upiName: cfg.UPI_NAME,
  };
}

/** Create a pending donation / membership payment and (if gateway based) a checkout redirect. */
async function startPayment({ name, mobile, email, pan, address, amountPaise, campaign_id, purpose = 'donation', member_id = null, anonymous = 0, notes = '' }) {
  const orderId = newOrderId();
  const mode = cfg.PAYMENT_MODE;
  db.prepare(`INSERT INTO donations(order_id,name,mobile,email,pan,address,amount,campaign_id,purpose,member_id,mode,status,anonymous,notes)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,'created',?,?)`)
    .run(orderId, name, mobile, email || null, pan ? pan.toUpperCase() : null, address || null, amountPaise, campaign_id || null, purpose, member_id, mode, anonymous ? 1 : 0, notes || null);

  if (mode === 'phonepe') {
    const out = await phonepe.createPayment({
      merchantOrderId: orderId, amountPaise,
      redirectUrl: `${cfg.SITE_URL}/pay/status/${orderId}?k=${U.hmac(orderId)}`,
      message: purpose === 'membership' ? 'Membership' : 'Donation',
      meta: { udf1: purpose },
    });
    db.prepare(`UPDATE donations SET status='pending', gateway_ref=? WHERE order_id=?`).run(out.gatewayRef || null, orderId);
    return { orderId, redirectUrl: out.redirectUrl };
  }
  db.prepare(`UPDATE donations SET status='pending' WHERE order_id=?`).run(orderId);
  const k = U.hmac(orderId);
  if (mode === 'mock') return { orderId, redirectUrl: `/pay/mock/${orderId}?k=${k}` };
  return { orderId, redirectUrl: `/pay/upi/${orderId}?k=${k}` }; // manual UPI
}

/** Idempotent settle. state: 'success' | 'failed' */
function settle(orderId, state, { gatewayRef, utr, raw } = {}) {
  return db.transaction(() => {
    const d = db.prepare('SELECT * FROM donations WHERE order_id=?').get(orderId);
    if (!d) return null;
    if (d.status === 'success') return d;
    if (state === 'success') {
      const receipt = `BMM/${U.financialYear()}/${String(nextCounter('receipt-' + U.financialYear())).padStart(5, '0')}`;
      db.prepare(`UPDATE donations SET status='success', paid_at=?, receipt_no=?, gateway_ref=COALESCE(?,gateway_ref), utr=COALESCE(?,utr), raw=COALESCE(?,raw) WHERE order_id=?`)
        .run(U.nowSql(), receipt, gatewayRef || null, utr || null, raw ? JSON.stringify(raw).slice(0, 4000) : null, orderId);
      if (d.purpose === 'membership' && d.member_id) {
        db.prepare('UPDATE members SET fee_paid=1 WHERE id=?').run(d.member_id);
        if (settings().auto_approve === '1') approveMember(d.member_id, 'auto');
      }
      audit('system', 'payment.success', `${orderId} ${d.amount}`);
    } else if (state === 'failed') {
      db.prepare(`UPDATE donations SET status='failed', raw=COALESCE(?,raw) WHERE order_id=? AND status!='success'`).run(raw ? JSON.stringify(raw).slice(0, 4000) : null, orderId);
    }
    return db.prepare('SELECT * FROM donations WHERE order_id=?').get(orderId);
  })();
}

/** Ask PhonePe for the truth and settle accordingly. */
async function refreshFromGateway(orderId) {
  const d = db.prepare('SELECT * FROM donations WHERE order_id=?').get(orderId);
  if (!d || d.status === 'success' || d.mode !== 'phonepe') return d;
  const { state, raw } = await phonepe.orderStatus(orderId);
  if (state === 'COMPLETED') return settle(orderId, 'success', { raw });
  if (state === 'FAILED') return settle(orderId, 'failed', { raw });
  return d;
}

function upiLink(order) {
  const p = new URLSearchParams({ pa: cfg.UPI_ID, pn: cfg.UPI_NAME, am: (order.amount / 100).toFixed(2), cu: 'INR', tn: 'BMM ' + order.order_id, tr: order.order_id });
  return 'upi://pay?' + p.toString();
}

module.exports = { approveMember, createMember, startPayment, settle, refreshFromGateway, paymentConfig, upiLink, newOrderId };
