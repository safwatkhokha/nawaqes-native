// ─── Wallet & Transactions Routes ────────────────────────────────────
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import db from '../database/index.js';
import { authMiddleware, adminMiddleware, JwtPayload } from '../middleware/auth.js';

const router = Router();

// Maximum charge request amount (EGP)
const MAX_CHARGE_AMOUNT = 50000;
// Maximum withdrawal amount (EGP)
const MAX_WITHDRAW_AMOUNT = 50000;
// Minimum withdrawal amount (EGP)
const MIN_WITHDRAW_AMOUNT = 50;

// Maximum transfer amount per transaction (EGP)
const MAX_TRANSFER_AMOUNT = 10000;

// Gift withdrawal platform fee (10% — deducted from gift_balance when
// converting to wallet_balance; the platform keeps this as revenue).
const GIFT_WITHDRAWAL_FEE_RATE = 0.10;

// External withdrawal platform fee (5% — deducted from the withdrawal
// amount when sending money OUTSIDE the platform to Vodafone Cash,
// InstaPay, etc. The platform keeps this as revenue).
const EXTERNAL_WITHDRAWAL_FEE_RATE = 0.05;

// Allowed external payout networks for withdrawals.
const WITHDRAWAL_NETWORKS = [
  'vodafone_cash',
  'instapay',
  'fawry',
  'etisalat_cash',
  'orange_cash',
  'bank_transfer',
] as const;
type WithdrawalNetwork = typeof WITHDRAWAL_NETWORKS[number];

// GET /api/wallet/balance
router.get('/balance', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const user = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(payload.userId) as any;
    res.json({ balance: user?.wallet_balance || 0 });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب الرصيد', details: err.message });
  }
});

// GET /api/wallet/transactions (with pagination)
router.get('/transactions', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const transactions = db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?').all(payload.userId, limit, offset);
    const total = db.prepare('SELECT COUNT(*) as count FROM transactions WHERE user_id = ?').get(payload.userId) as any;
    res.json({ transactions, total: total.count, limit, offset });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب المعاملات', details: err.message });
  }
});

// POST /api/wallet/charge-request
router.post('/charge-request', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { amount, method, receiptImage, additionalPhone } = req.body;
    if (!amount || !method) { res.status(400).json({ error: 'المبلغ وطريقة الدفع مطلوبان' }); return; }
    if (amount <= 0) { res.status(400).json({ error: 'المبلغ يجب أن يكون أكبر من صفر' }); return; }
    if (amount > MAX_CHARGE_AMOUNT) { res.status(400).json({ error: `الحد الأقصى للشحن ${MAX_CHARGE_AMOUNT.toLocaleString()} ج.م` }); return; }
    if (!receiptImage || receiptImage.trim() === '') { res.status(400).json({ error: 'صورة الإيصال مطلوبة - يرجى رفع صورة إيصال التحويل' }); return; }

    const user = db.prepare('SELECT name, avatar, phone FROM users WHERE id = ?').get(payload.userId) as any;

    // Require phone number for wallet charging
    if (!user.phone || user.phone.trim() === '') {
      res.status(400).json({ error: 'يجب إضافة رقم هاتف لحسابك أولاً لشحن المحفظة' });
      return;
    }

    // Create charging request first to get the ID
    const crId = crypto.randomBytes(16).toString('hex');
    const crResult = db.prepare('INSERT INTO charging_requests (id, user_id, user_name, user_avatar, user_phone, additional_phone, amount, method, receipt_image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(crId, payload.userId, user.name, user.avatar, user.phone, additionalPhone || '', amount, method, receiptImage || '');

    // Create transaction linked to this specific charging request
    db.prepare('INSERT INTO transactions (user_id, type, amount, method, status, reference_id) VALUES (?, ?, ?, ?, ?, ?)')
      .run(payload.userId, 'charge_request', amount, method, 'pending', crId);

    // ─── Notify the user that their charge request was submitted ───
    db.prepare('INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)')
      .run(payload.userId, 'payment', `تم إرسال طلب شحن ${Number(amount).toLocaleString()} ج.م وسيتم مراجعته من الإدارة`, '/wallet');

    // ─── Notify all admins about the new charge request ───
    const hasReceipt = receiptImage && receiptImage.trim() !== '';
    const phoneInfo = additionalPhone && additionalPhone.trim() !== ''
      ? `${user.phone} / رقم آخر: ${additionalPhone}`
      : user.phone;
    const adminMessage = hasReceipt
      ? `طلب شحن جديد من ${user.name} (${phoneInfo}) بمبلغ ${Number(amount).toLocaleString()} ج.م عبر ${method} مع صورة إيصال`
      : `طلب شحن جديد من ${user.name} (${phoneInfo}) بمبلغ ${Number(amount).toLocaleString()} ج.م عبر ${method} بدون صورة إيصال`;

    const admins = db.prepare('SELECT id FROM users WHERE is_admin = 1').all() as any[];
    const insertNotif = db.prepare('INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)');
    for (const admin of admins) {
      insertNotif.run(admin.id, 'payment', adminMessage, '/admin/charging');
    }

    res.status(201).json({ message: 'تم إرسال طلب الشحن بنجاح', requestId: crId });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إرسال طلب الشحن', details: err.message });
  }
});

// ─── Admin: Charging Requests ────────────────────────────────────────

// GET /api/wallet/admin/charging-requests
router.get('/admin/charging-requests', authMiddleware, adminMiddleware, (req: Request, res: Response) => {
  try {
    const requests = db.prepare('SELECT * FROM charging_requests ORDER BY created_at DESC').all();
    res.json(requests);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب طلبات الشحن', details: err.message });
  }
});

// POST /api/wallet/admin/charging-requests/:id/approve
router.post('/admin/charging-requests/:id/approve', authMiddleware, adminMiddleware, (req: Request, res: Response) => {
  try {
    const cr = db.prepare('SELECT * FROM charging_requests WHERE id = ?').get(req.params.id) as any;
    if (!cr) { res.status(404).json({ error: 'الطلب غير موجود' }); return; }
    if (cr.status !== 'pending') { res.status(400).json({ error: 'تم معالجة هذا الطلب بالفعل' }); return; }

    // Update charging request status
    db.prepare("UPDATE charging_requests SET status = 'approved' WHERE id = ?").run(req.params.id);

    // ✅ FIX: Find the transaction linked to THIS specific charging request via reference_id
    // Falls back to most recent pending if reference_id not set (backward compatibility)
    let pendingTx = db.prepare("SELECT id FROM transactions WHERE user_id = ? AND type = 'charge_request' AND status = 'pending' AND reference_id = ?").get(cr.user_id, req.params.id) as any;
    if (!pendingTx) {
      // Backward compatibility: if no reference_id match, find most recent pending
      pendingTx = db.prepare("SELECT id FROM transactions WHERE user_id = ? AND type = 'charge_request' AND status = 'pending' ORDER BY created_at DESC LIMIT 1").get(cr.user_id) as any;
    }
    if (pendingTx) {
      db.prepare("UPDATE transactions SET status = 'approved' WHERE id = ?").run(pendingTx.id);
    }

    // Add to wallet balance
    db.prepare("UPDATE users SET wallet_balance = wallet_balance + ?, updated_at = datetime('now') WHERE id = ?")
      .run(cr.amount, cr.user_id);

    // Create deposit transaction linked to this charging request
    db.prepare('INSERT INTO transactions (user_id, type, amount, method, status, reference_id) VALUES (?, ?, ?, ?, ?, ?)')
      .run(cr.user_id, 'deposit', cr.amount, cr.method, 'completed', req.params.id);

    // Create notification
    db.prepare('INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)')
      .run(cr.user_id, 'payment', `تم شحن ${cr.amount.toLocaleString()} ج.م في محفظتك بنجاح`, '/wallet');

    // 🔧 BROADCAST to user to refresh wallet
    try {
      const wsManager = (req.app as any).locals?.wsManager;
      if (wsManager) {
        wsManager.sendToUser(cr.user_id, { type: "wallet:updated", data: { userId: cr.user_id, amount: cr.amount } });
      }
    } catch {}

    res.json({ message: "تم الموافقة على طلب الشحن" });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل الموافقة على الطلب', details: err.message });
  }
});

// POST /api/wallet/admin/charging-requests/:id/reject
router.post('/admin/charging-requests/:id/reject', authMiddleware, adminMiddleware, (req: Request, res: Response) => {
  try {
    const cr = db.prepare('SELECT * FROM charging_requests WHERE id = ?').get(req.params.id) as any;
    if (!cr) { res.status(404).json({ error: 'الطلب غير موجود' }); return; }

    db.prepare("UPDATE charging_requests SET status = 'rejected' WHERE id = ?").run(req.params.id);

    // ✅ FIX: Find the transaction linked to THIS specific charging request via reference_id
    let pendingTx = db.prepare("SELECT id FROM transactions WHERE user_id = ? AND type = 'charge_request' AND status = 'pending' AND reference_id = ?").get(cr.user_id, req.params.id) as any;
    if (!pendingTx) {
      // Backward compatibility: if no reference_id match, find most recent pending
      pendingTx = db.prepare("SELECT id FROM transactions WHERE user_id = ? AND type = 'charge_request' AND status = 'pending' ORDER BY created_at DESC LIMIT 1").get(cr.user_id) as any;
    }
    if (pendingTx) {
      db.prepare("UPDATE transactions SET status = 'rejected' WHERE id = ?").run(pendingTx.id);
    }

    db.prepare('INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)')
      .run(cr.user_id, 'payment', `تم رفض طلب شحن ${cr.amount.toLocaleString()} ج.م`, '/wallet');

    res.json({ message: 'تم رفض طلب الشحن' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل رفض الطلب', details: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════
// ─── External Withdrawal Routes (5% fee + admin approval) ───────────
// Users can withdraw their wallet_balance to an external payout network
// (Vodafone Cash, InstaPay, Fawry, Etisalat Cash, Orange Cash, Bank
// Transfer). The withdrawal amount is HELD (deducted from the wallet
// immediately) and a withdrawal_requests row is created with status
// 'pending'. An admin must approve the request to mark it 'approved'
// (the money has been sent outside), or reject it (the held amount is
// refunded to the wallet). A 5% fee is deducted from the amount — the
// user's external account receives `net_amount = amount - fee`.
// ════════════════════════════════════════════════════════════════════

// POST /api/wallet/withdraw — create external withdrawal request
// Body: { amount: number, network: WithdrawalNetwork, accountNumber: string }
router.post('/withdraw', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { amount, network, accountNumber } = req.body || {};

    // ─── Validate input ───────────────────────────────────────────
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      res.status(400).json({ error: 'المبلغ يجب أن يكون أكبر من صفر' }); return;
    }
    if (amt < MIN_WITHDRAW_AMOUNT) {
      res.status(400).json({ error: `الحد الأدنى للسحب ${MIN_WITHDRAW_AMOUNT.toLocaleString()} ج.م` }); return;
    }
    if (amt > MAX_WITHDRAW_AMOUNT) {
      res.status(400).json({ error: `الحد الأقصى للسحب ${MAX_WITHDRAW_AMOUNT.toLocaleString()} ج.م` }); return;
    }
    if (!network || !WITHDRAWAL_NETWORKS.includes(network)) {
      res.status(400).json({ error: 'شبكة السحب غير صالحة' }); return;
    }
    const acctNum = typeof accountNumber === 'string' ? accountNumber.trim() : '';
    if (!acctNum) {
      res.status(400).json({ error: 'رقم الحساب / المحفظة الخارجية مطلوب' }); return;
    }
    if (acctNum.length < 4 || acctNum.length > 64) {
      res.status(400).json({ error: 'رقم الحساب غير صالح' }); return;
    }

    // ─── Compute fee + net ────────────────────────────────────────
    const fee = Math.round(amt * EXTERNAL_WITHDRAWAL_FEE_RATE * 100) / 100;
    const net = Math.round((amt - fee) * 100) / 100;
    if (net <= 0) {
      res.status(400).json({ error: 'المبلغ صغير جداً بعد خصم الرسوم' }); return;
    }

    const user = db.prepare('SELECT id, name, wallet_balance, phone FROM users WHERE id = ?').get(payload.userId) as any;
    if (!user) { res.status(404).json({ error: 'المستخدم غير موجود' }); return; }

    const withdrawalId = crypto.randomBytes(16).toString('hex');
    const txId = crypto.randomBytes(16).toString('hex');
    const notifId = crypto.randomBytes(16).toString('hex');

    // ─── Atomic: deduct held amount + record withdrawal + tx + notif ─
    // The conditional UPDATE (wallet_balance >= ?) closes the race
    // where two concurrent withdrawals both pass the balance check.
    try {
      db.transaction(() => {
        const deduct = db.prepare(
          "UPDATE users SET wallet_balance = wallet_balance - ?, updated_at = datetime('now') WHERE id = ? AND wallet_balance >= ?"
        ).run(amt, payload.userId, amt);
        if (deduct.changes === 0) {
          throw new Error('INSUFFICIENT_BALANCE');
        }

        db.prepare(
          `INSERT INTO withdrawal_requests
            (id, user_id, amount, method, account_details, network, account_number, fee, net_amount, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
        ).run(
          withdrawalId, payload.userId, amt,
          network,                 // method (legacy column) — same as network
          acctNum,                 // account_details (legacy column)
          network, acctNum, fee, net,
        );

        db.prepare(
          'INSERT INTO transactions (id, user_id, type, amount, method, status, reference_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(txId, payload.userId, 'withdrawal', amt, `withdraw:${network}`, 'pending', withdrawalId);

        db.prepare(
          'INSERT INTO notifications (id, user_id, type, message, link) VALUES (?, ?, ?, ?, ?)'
        ).run(
          notifId, payload.userId, 'payment',
          `تم إنشاء طلب سحب بقيمة ${amt.toLocaleString()} ج.م (${network}) — سيتم مراجعته خلال 24 ساعة. المبلغ الصافي: ${net.toLocaleString()} ج.م (رسوم 5%: ${fee.toLocaleString()} ج.م)`,
          '/wallet',
        );
      })();
    } catch (err: any) {
      if (err.message === 'INSUFFICIENT_BALANCE') {
        res.status(400).json({ error: 'رصيد المحفظة غير كافٍ لإتمام السحب' }); return;
      }
      throw err;
    }

    // ─── Notify admins about the new withdrawal request ───────────
    try {
      const admins = db.prepare('SELECT id FROM users WHERE is_admin = 1').all() as any[];
      const adminMsg = `طلب سحب جديد من ${user.name} (${user.phone || 'لا رقم'}) بقيمة ${amt.toLocaleString()} ج.م عبر ${network} إلى ${acctNum} — بانتظار المراجعة`;
      const insertAdminNotif = db.prepare('INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)');
      for (const admin of admins) {
        insertAdminNotif.run(admin.id, 'payment', adminMsg, '/admin');
      }
    } catch {}

    // ─── Real-time wallet refresh for the user ────────────────────
    try {
      const wsManager = (req.app as any).locals?.wsManager;
      if (wsManager) {
        wsManager.sendToUser(payload.userId, { type: "wallet:updated", data: { userId: payload.userId, amount: -amt } });
      }
    } catch {}

    res.status(201).json({
      message: 'تم إنشاء طلب السحب، سيتم مراجعته خلال 24 ساعة',
      withdrawalId,
      amount: amt,
      fee,
      net,
      network,
      accountNumber: acctNum,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إنشاء طلب السحب', details: err.message });
  }
});

// GET /api/wallet/withdraw-requests — current user's withdrawal history
router.get('/withdraw-requests', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const rows = db.prepare(
      'SELECT * FROM withdrawal_requests WHERE user_id = ? ORDER BY created_at DESC'
    ).all(payload.userId) as any[];
    res.json(rows.map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      amount: Number(r.amount || 0),
      fee: Number(r.fee || 0),
      netAmount: Number(r.net_amount || 0),
      network: r.network || r.method || '',
      accountNumber: r.account_number || r.account_details || '',
      method: r.method || '',
      status: r.status,
      adminNote: r.admin_note || '',
      createdAt: r.created_at,
      processedAt: r.processed_at,
    })));
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب طلبات السحب', details: err.message });
  }
});

// GET /api/wallet/withdrawals
router.get('/withdrawals', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const userId = payload.userId;
    const withdrawals = db.prepare(`
      SELECT w.*, u.name as user_name, u.avatar as user_avatar, u.avatar_base64 as user_avatar_base64, u.phone as user_phone
      FROM withdrawal_requests w
      JOIN users u ON u.id = w.user_id
      WHERE w.user_id = ? OR ? = 1
      ORDER BY w.created_at DESC
    `).all(userId, payload.isAdmin ? 1 : 0) as any[];
    res.json(withdrawals.map((w: any) => ({
      id: w.id,
      userId: w.user_id,
      userName: w.user_name,
      userAvatar: w.user_avatar_base64 || w.user_avatar,
      userPhone: w.user_phone,
      amount: Number(w.amount || 0),
      fee: Number(w.fee || 0),
      netAmount: Number(w.net_amount || 0),
      network: w.network || w.method || '',
      accountNumber: w.account_number || w.account_details || '',
      method: w.method || '',
      accountDetails: w.account_details || '',
      status: w.status,
      adminNote: w.admin_note || '',
      createdAt: w.created_at,
      processedAt: w.processed_at,
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/wallet/withdrawals/:id/:action (approve/reject)
router.post('/withdrawals/:id/:action', authMiddleware, adminMiddleware, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const action = req.params.action; // 'approve' or 'reject'
    const { adminNote } = req.body;
    const withdrawal = db.prepare('SELECT * FROM withdrawal_requests WHERE id = ?').get(id) as any;
    if (!withdrawal) { res.status(404).json({ error: 'طلب السحب غير موجود' }); return; }
    if (withdrawal.status !== 'pending') { res.status(400).json({ error: 'تم معالجة هذا الطلب بالفعل' }); return; }

    if (action === 'approve') {
      db.prepare('UPDATE withdrawal_requests SET status = ?, admin_note = ?, processed_at = datetime(\'now\') WHERE id = ?').run('approved', adminNote || '', id);
      // Update the specific transaction linked to this withdrawal via reference_id
      const tx = db.prepare("SELECT id FROM transactions WHERE user_id = ? AND type = 'withdrawal' AND status = 'pending' AND reference_id = ?").get(withdrawal.user_id, id) as any;
      if (tx) {
        db.prepare("UPDATE transactions SET status = 'completed' WHERE id = ?").run(tx.id);
      } else {
        // Backward compatibility
        db.prepare("UPDATE transactions SET status = 'completed' WHERE user_id = ? AND type = 'withdrawal' AND method = ? AND status = 'pending'").run(withdrawal.user_id, withdrawal.method);
      }
    } else if (action === 'reject') {
      db.prepare('UPDATE withdrawal_requests SET status = ?, admin_note = ?, processed_at = datetime(\'now\') WHERE id = ?').run('rejected', adminNote || '', id);
      // Refund the balance
      db.prepare('UPDATE users SET wallet_balance = wallet_balance + ?, updated_at = datetime(\'now\') WHERE id = ?').run(withdrawal.amount, withdrawal.user_id);
      // Update the transaction status
      const tx = db.prepare("SELECT id FROM transactions WHERE user_id = ? AND type = 'withdrawal' AND status = 'pending' AND reference_id = ?").get(withdrawal.user_id, id) as any;
      if (tx) {
        db.prepare("UPDATE transactions SET status = 'failed' WHERE id = ?").run(tx.id);
      } else {
        db.prepare("UPDATE transactions SET status = 'failed' WHERE user_id = ? AND type = 'withdrawal' AND method = ? AND status = 'pending'").run(withdrawal.user_id, withdrawal.method);
      }
    } else {
      res.status(400).json({ error: 'إجراء غير صالح' }); return;
    }

    // Notify user
    const msg = action === 'approve'
      ? `تم الموافقة على طلب السحب بقيمة ${withdrawal.amount.toLocaleString()} ج.م`
      : `تم رفض طلب السحب بقيمة ${withdrawal.amount.toLocaleString()} ج.م${adminNote ? ': ' + adminNote : ''}`;
    db.prepare('INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)').run(
      withdrawal.user_id, 'payment', msg, '/wallet'
    );

    // Broadcast wallet update to user
    try {
      const wsManager = (req.app as any).locals?.wsManager;
      if (wsManager) {
        wsManager.sendToUser(withdrawal.user_id, { type: "wallet:updated", data: { userId: withdrawal.user_id } });
      }
    } catch {}

    res.json({ success: true, action });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════
// ─── Wallet-to-Wallet Transfers (pending acceptance flow) ────────────
// When user A transfers money to user B:
//   1. POST /api/wallet/transfer — deducts amount from A's wallet,
//      creates a `wallet_transfers` row with status='pending', and
//      sends a notification to B with a "قبول/رفض" prompt.
//   2. POST /api/wallet/transfer/:id/accept — B accepts; the held
//      amount is credited to B's wallet. Status → 'accepted'.
//   3. POST /api/wallet/transfer/:id/reject — B rejects; the held
//      amount is refunded to A's wallet. Status → 'rejected'.
// The money is HELD between step 1 and step 2/3 — it is removed from
// A's balance immediately, but only lands in B's wallet (or returns to
// A) when B responds.
// ════════════════════════════════════════════════════════════════════

// POST /api/wallet/transfer
router.post('/transfer', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { recipientId, amount, note } = req.body || {};

    if (!recipientId || typeof recipientId !== 'string') {
      res.status(400).json({ error: 'المستفيد مطلوب' }); return;
    }
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      res.status(400).json({ error: 'المبلغ يجب أن يكون أكبر من صفر' }); return;
    }
    if (amt > MAX_TRANSFER_AMOUNT) {
      res.status(400).json({ error: `الحد الأقصى للتحويل ${MAX_TRANSFER_AMOUNT.toLocaleString()} ج.م` }); return;
    }
    if (recipientId === payload.userId) {
      res.status(400).json({ error: 'لا يمكن التحويل إلى نفس الحساب' }); return;
    }

    const sender = db.prepare('SELECT id, name, wallet_balance FROM users WHERE id = ?').get(payload.userId) as any;
    if (!sender) { res.status(404).json({ error: 'المرسل غير موجود' }); return; }
    const recipient = db.prepare('SELECT id, name FROM users WHERE id = ?').get(recipientId) as any;
    if (!recipient) { res.status(404).json({ error: 'المستفيد غير موجود' }); return; }

    const transferId = crypto.randomBytes(16).toString('hex');
    const notifId = crypto.randomBytes(16).toString('hex');
    const txId = crypto.randomBytes(16).toString('hex');

    // Atomic: deduct from sender + record transfer + notify recipient.
    // The conditional UPDATE (wallet_balance >= ?) closes the race
    // where two concurrent transfers both pass the balance check.
    try {
      db.transaction(() => {
        const deduct = db.prepare(
          "UPDATE users SET wallet_balance = wallet_balance - ?, updated_at = datetime('now') WHERE id = ? AND wallet_balance >= ?"
        ).run(amt, payload.userId, amt);
        if (deduct.changes === 0) {
          throw new Error('INSUFFICIENT_BALANCE');
        }

        db.prepare(
          `INSERT INTO wallet_transfers (id, sender_id, recipient_id, amount, note, status) VALUES (?, ?, ?, ?, ?, 'pending')`
        ).run(transferId, payload.userId, recipientId, amt, (note || '').toString().slice(0, 200));

        // Record on sender's transaction history (pending)
        db.prepare(
          'INSERT INTO transactions (id, user_id, type, amount, method, status, reference_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(txId, payload.userId, 'transfer_out', amt, `transfer:${recipientId}`, 'pending', transferId);

        // Notification to recipient — message + link to /wallet. The
        // link will be intercepted by NotificationsPage which renders
        // Accept/Reject buttons for transfer notifications.
        const notifMsg = `لديك تحويل بقيمة ${amt.toLocaleString()} ج.م من ${sender.name}`;
        db.prepare(
          'INSERT INTO notifications (id, user_id, type, message, link, user_id_ref, post_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(
          notifId,
          recipientId,
          'payment',
          notifMsg,
          '/wallet?transfer=' + transferId,
          payload.userId,
          transferId, // store the transfer id in post_id so the frontend can find it
        );
      })();
    } catch (err: any) {
      if (err.message === 'INSUFFICIENT_BALANCE') {
        res.status(400).json({ error: 'رصيد المحفظة غير كافٍ لإتمام التحويل' });
        return;
      }
      throw err;
    }

    // Notify recipient via WebSocket (real-time bell badge update).
    try {
      const wsManager = (req.app as any).locals?.wsManager;
      if (wsManager && typeof wsManager.emitNotification === 'function') {
        wsManager.emitNotification(recipientId, {
          id: notifId,
          type: 'payment',
          message: `لديك تحويل بقيمة ${amt.toLocaleString()} ج.م من ${sender.name}`,
          link: '/wallet?transfer=' + transferId,
          userId: payload.userId,
          transferId,
          kind: 'transfer_request',
          time: new Date().toISOString(),
        });
      }
    } catch {}

    // Refresh sender's wallet view via WS.
    try {
      const wsManager = (req.app as any).locals?.wsManager;
      if (wsManager) {
        wsManager.sendToUser(payload.userId, { type: "wallet:updated", data: { userId: payload.userId, amount: -amt } });
      }
    } catch {}

    res.status(201).json({
      message: 'تم إرسال التحويل بنجاح — بانتظار موافقة المستلم',
      transferId,
      amount: amt,
      recipientName: recipient.name,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إرسال التحويل', details: err.message });
  }
});

// POST /api/wallet/transfer/:transferId/accept
router.post('/transfer/:transferId/accept', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { transferId } = req.params;

    const transfer = db.prepare('SELECT * FROM wallet_transfers WHERE id = ?').get(transferId) as any;
    if (!transfer) { res.status(404).json({ error: 'التحويل غير موجود' }); return; }
    if (transfer.recipient_id !== payload.userId) {
      res.status(403).json({ error: 'غير مصرح — هذا التحويل ليس لك' }); return;
    }
    if (transfer.status !== 'pending') {
      res.status(400).json({ error: 'تم الاستجابة لهذا التحويل بالفعل' }); return;
    }

    const txId = crypto.randomBytes(16).toString('hex');
    const notifId = crypto.randomBytes(16).toString('hex');
    const senderTx = db.prepare(
      "SELECT id FROM transactions WHERE user_id = ? AND type = 'transfer_out' AND reference_id = ?"
    ).get(transfer.sender_id, transferId) as any;

    db.transaction(() => {
      // Credit recipient
      db.prepare(
        "UPDATE users SET wallet_balance = wallet_balance + ?, updated_at = datetime('now') WHERE id = ?"
      ).run(transfer.amount, payload.userId);

      // Mark transfer as accepted
      db.prepare(
        "UPDATE wallet_transfers SET status = 'accepted', responded_at = datetime('now') WHERE id = ?"
      ).run(transferId);

      // Update sender's original transfer_out tx → completed
      if (senderTx) {
        db.prepare("UPDATE transactions SET status = 'completed' WHERE id = ?").run(senderTx.id);
      }

      // Record on recipient's transaction history (credit)
      db.prepare(
        'INSERT INTO transactions (id, user_id, type, amount, method, status, reference_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(txId, payload.userId, 'transfer_in', transfer.amount, `transfer:${transfer.sender_id}`, 'completed', transferId);

      // Notify sender that their transfer was accepted
      const senderName = (db.prepare('SELECT name FROM users WHERE id = ?').get(payload.userId) as any)?.name || 'المستلم';
      db.prepare(
        'INSERT INTO notifications (id, user_id, type, message, link, user_id_ref) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(
        notifId,
        transfer.sender_id,
        'payment',
        `تم قبول تحويلك بقيمة ${Number(transfer.amount).toLocaleString()} ج.م من قبل ${senderName}`,
        '/wallet',
        payload.userId,
      );
    })();

    // WS refresh recipient + sender
    try {
      const wsManager = (req.app as any).locals?.wsManager;
      if (wsManager) {
        wsManager.sendToUser(payload.userId, { type: "wallet:updated", data: { userId: payload.userId, amount: transfer.amount } });
        wsManager.sendToUser(transfer.sender_id, { type: "wallet:updated", data: { userId: transfer.sender_id } });
        if (typeof wsManager.emitNotification === 'function') {
          wsManager.emitNotification(transfer.sender_id, {
            id: notifId,
            type: 'payment',
            message: `تم قبول تحويلك بقيمة ${Number(transfer.amount).toLocaleString()} ج.م`,
            link: '/wallet',
            kind: 'transfer_accepted',
            time: new Date().toISOString(),
          });
        }
      }
    } catch {}

    res.json({ message: 'تم قبول التحويل وإضافة المبلغ إلى محفظتك', amount: transfer.amount });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل قبول التحويل', details: err.message });
  }
});

// POST /api/wallet/transfer/:transferId/reject
router.post('/transfer/:transferId/reject', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { transferId } = req.params;

    const transfer = db.prepare('SELECT * FROM wallet_transfers WHERE id = ?').get(transferId) as any;
    if (!transfer) { res.status(404).json({ error: 'التحويل غير موجود' }); return; }
    if (transfer.recipient_id !== payload.userId) {
      res.status(403).json({ error: 'غير مصرح — هذا التحويل ليس لك' }); return;
    }
    if (transfer.status !== 'pending') {
      res.status(400).json({ error: 'تم الاستجابة لهذا التحويل بالفعل' }); return;
    }

    const notifId = crypto.randomBytes(16).toString('hex');
    const senderTx = db.prepare(
      "SELECT id FROM transactions WHERE user_id = ? AND type = 'transfer_out' AND reference_id = ?"
    ).get(transfer.sender_id, transferId) as any;

    db.transaction(() => {
      // Refund sender
      db.prepare(
        "UPDATE users SET wallet_balance = wallet_balance + ?, updated_at = datetime('now') WHERE id = ?"
      ).run(transfer.amount, transfer.sender_id);

      // Mark transfer as rejected
      db.prepare(
        "UPDATE wallet_transfers SET status = 'rejected', responded_at = datetime('now') WHERE id = ?"
      ).run(transferId);

      // Update sender's original transfer_out tx → failed (refunded)
      if (senderTx) {
        db.prepare("UPDATE transactions SET status = 'failed' WHERE id = ?").run(senderTx.id);
      }

      // Notify sender that their transfer was rejected (and refunded)
      const recipientName = (db.prepare('SELECT name FROM users WHERE id = ?').get(payload.userId) as any)?.name || 'المستلم';
      db.prepare(
        'INSERT INTO notifications (id, user_id, type, message, link, user_id_ref) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(
        notifId,
        transfer.sender_id,
        'payment',
        `تم رفض تحويلك بقيمة ${Number(transfer.amount).toLocaleString()} ج.م من ${recipientName} — تم استرجاع المبلغ لمحفظتك`,
        '/wallet',
        payload.userId,
      );
    })();

    // WS refresh sender
    try {
      const wsManager = (req.app as any).locals?.wsManager;
      if (wsManager) {
        wsManager.sendToUser(transfer.sender_id, { type: "wallet:updated", data: { userId: transfer.sender_id, amount: transfer.amount } });
        if (typeof wsManager.emitNotification === 'function') {
          wsManager.emitNotification(transfer.sender_id, {
            id: notifId,
            type: 'payment',
            message: `تم رفض تحويلك بقيمة ${Number(transfer.amount).toLocaleString()} ج.م — تم استرجاع المبلغ`,
            link: '/wallet',
            kind: 'transfer_rejected',
            time: new Date().toISOString(),
          });
        }
      }
    } catch {}

    res.json({ message: 'تم رفض التحويل واسترجاع المبلغ للمرسل', amount: transfer.amount });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل رفض التحويل', details: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════
// ─── Gift Balance: history + conversion to wallet ───────────────────
// ════════════════════════════════════════════════════════════════════

// GET /api/wallet/gifts — gift balance + received gift history
router.get('/gifts', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const user = db.prepare('SELECT gift_balance FROM users WHERE id = ?').get(payload.userId) as any;
    const giftBalance = Number(user?.gift_balance || 0);

    const history = db.prepare(`
      SELECT
        g.id, g.gift_type, g.gift_name, g.gift_icon, g.amount,
        g.message, g.source, g.video_id, g.created_at,
        u.id AS sender_id, u.name AS sender_name, u.avatar AS sender_avatar, u.avatar_base64 AS sender_avatar_base64
      FROM gift_history g
      JOIN users u ON u.id = g.sender_id
      WHERE g.recipient_id = ?
      ORDER BY g.created_at DESC
      LIMIT 100
    `).all(payload.userId);

    const totalReceived = history.reduce((s: number, g: any) => s + Number(g.amount || 0), 0);

    res.json({
      giftBalance,
      totalReceived,
      history: history.map((g: any) => ({
        id: g.id,
        giftType: g.gift_type,
        giftName: g.gift_name,
        giftIcon: g.gift_icon,
        amount: Number(g.amount || 0),
        message: g.message || '',
        source: g.source,
        videoId: g.video_id,
        createdAt: g.created_at,
        sender: {
          id: g.sender_id,
          name: g.sender_name,
          avatar: g.sender_avatar_base64 || g.sender_avatar,
        },
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب بيانات الهدايا', details: err.message });
  }
});

// POST /api/wallet/withdraw-gifts — convert gift_balance → wallet_balance
// 🔧 FIX: NO FEE for internal transfer (gifts → wallet is inside the platform).
// Fees only apply to EXTERNAL withdrawals (Vodafone Cash, InstaPay, etc).
// 100 ج.م gift_balance → 100 ج.م wallet_balance (0 fee)
router.post('/withdraw-gifts', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    // Optional: allow partial withdrawal via `amount` in body. Default
    // to "withdraw everything".
    const requestedAmount = req.body?.amount != null ? Number(req.body.amount) : null;

    const user = db.prepare('SELECT gift_balance, wallet_balance FROM users WHERE id = ?').get(payload.userId) as any;
    if (!user) { res.status(404).json({ error: 'المستخدم غير موجود' }); return; }

    const giftBalance = Number(user.gift_balance || 0);
    if (giftBalance <= 0) {
      res.status(400).json({ error: 'لا يوجد رصيد هدايا لتحويله' }); return;
    }

    const amount = requestedAmount != null ? Math.min(requestedAmount, giftBalance) : giftBalance;
    if (amount <= 0) {
      res.status(400).json({ error: 'المبلغ يجب أن يكون أكبر من صفر' }); return;
    }

    const fee = 0; // 🔧 FIX: NO FEE — internal transfer (gifts → wallet is inside the platform)
    const net = amount; // Full amount goes to wallet

    const txId = crypto.randomBytes(16).toString('hex');
    const notifId = crypto.randomBytes(16).toString('hex');

    db.transaction(() => {
      // Conditional deduction to prevent race conditions. Only deduct
      // if the user still has at least `amount` in gift_balance.
      const deduct = db.prepare(
        "UPDATE users SET gift_balance = gift_balance - ?, wallet_balance = wallet_balance + ?, updated_at = datetime('now') WHERE id = ? AND gift_balance >= ?"
      ).run(amount, net, payload.userId, amount);
      if (deduct.changes === 0) {
        throw new Error('INSUFFICIENT_GIFT_BALANCE');
      }

      db.prepare(
        'INSERT INTO transactions (id, user_id, type, amount, method, status, reference_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(txId, payload.userId, 'gift_withdrawal', net, 'wallet', 'completed', `gift-fee:${fee}`);

      db.prepare(
        'INSERT INTO notifications (id, user_id, type, message, link) VALUES (?, ?, ?, ?, ?)'
      ).run(
        notifId, payload.userId, 'payment',
        `تم تحويل ${net.toLocaleString()} ج.م من هداياك إلى محفظتك (رسوم الخدمة: ${fee.toLocaleString()} ج.م)`,
        '/wallet',
      );
    })();

    // WS refresh wallet
    try {
      const wsManager = (req.app as any).locals?.wsManager;
      if (wsManager) {
        wsManager.sendToUser(payload.userId, { type: "wallet:updated", data: { userId: payload.userId, amount: net } });
      }
    } catch {}

    res.json({
      message: 'تم تحويل رصيد الهدايا إلى المحفظة بنجاح',
      amount,
      fee,
      net,
      newGiftBalance: Number((giftBalance - amount).toFixed(2)),
    });
  } catch (err: any) {
    if (err.message === 'INSUFFICIENT_GIFT_BALANCE') {
      res.status(400).json({ error: 'رصيد الهدايا غير كافٍ' }); return;
    }
    res.status(500).json({ error: 'فشل تحويل رصيد الهدايا', details: err.message });
  }
});

// ─── Savings Goals API ──────────────────────────────────────────────

// GET /api/wallet/savings-goals
router.get('/savings-goals', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const goals = db.prepare('SELECT * FROM savings_goals WHERE user_id = ? ORDER BY created_at DESC').all(payload.userId);
    res.json(goals);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب أهداف التوفير', details: err.message });
  }
});

// POST /api/wallet/savings-goals
router.post('/savings-goals', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { name, target, deadline } = req.body;
    if (!name || !target || target <= 0) {
      res.status(400).json({ error: 'اسم الهدف والمبلغ المستهدف مطلوبان' }); return;
    }
    const id = crypto.randomBytes(16).toString('hex');
    db.prepare('INSERT INTO savings_goals (id, user_id, name, target_amount, current_amount, deadline) VALUES (?, ?, ?, ?, ?, ?)').run(
      id, payload.userId, name.trim(), target, 0, deadline || null
    );
    const goal = db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(id);
    res.status(201).json(goal);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إنشاء هدف التوفير', details: err.message });
  }
});

// PUT /api/wallet/savings-goals/:id
// NOTE: 'current' is intentionally NOT accepted — money movements must
// go through /add and /withdraw only. Allowing direct current_amount
// edits would let users create money from nothing (set current=1M, then
// withdraw). See audit C2.
router.put('/savings-goals/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { name, target, deadline } = req.body;
    const goal = db.prepare('SELECT * FROM savings_goals WHERE id = ? AND user_id = ?').get(req.params.id, payload.userId) as any;
    if (!goal) { res.status(404).json({ error: 'الهدف غير موجود' }); return; }

    const newName = name !== undefined ? name : goal.name;
    const newTarget = target !== undefined ? target : goal.target_amount;
    const newDeadline = deadline !== undefined ? deadline : goal.deadline;
    // current_amount is NEVER changed by this endpoint — only by /add and /withdraw

    db.prepare('UPDATE savings_goals SET name = ?, target_amount = ?, deadline = ? WHERE id = ?').run(
      newName, newTarget, newDeadline, req.params.id
    );
    const updated = db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تحديث هدف التوفير', details: err.message });
  }
});

// POST /api/wallet/savings-goals/:id/add
router.post('/savings-goals/:id/add', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { amount } = req.body;
    if (!amount || amount <= 0) { res.status(400).json({ error: 'المبلغ مطلوب ويجب أن يكون أكبر من صفر' }); return; }

    const goal = db.prepare('SELECT * FROM savings_goals WHERE id = ? AND user_id = ?').get(req.params.id, payload.userId) as any;
    if (!goal) { res.status(404).json({ error: 'الهدف غير موجود' }); return; }

    // ─── Cap the amount to remaining capacity (C1 fix) ─────────────
    // Previously: if amount > (target - current), the full amount was
    // deducted from the wallet but only the capped portion landed in the
    // goal — the difference was silently lost. Now we cap the actual
    // deduction to what the goal can actually accept.
    const remainingCapacity = Math.max(0, goal.target_amount - goal.current_amount);
    if (remainingCapacity === 0) {
      res.status(400).json({ error: 'تم بلوغ الهدف المستهدف بالفعل' });
      return;
    }
    const actualAmount = Math.min(amount, remainingCapacity);
    if (actualAmount !== amount) {
      // Inform the client that only a partial amount was applied
      // (the response will still be 200 — the operation succeeded)
      res.setHeader('X-Partial-Amount', String(actualAmount));
    }

    // ─── Atomic balance check + deduction + goal increment ─────────
    // Use a transaction so the wallet deduction, goal increment, and
    // transaction record either all succeed or all fail. The conditional
    // UPDATE also closes the race where two concurrent /add calls both
    // pass the balance check before either deduction lands.
    const txId = crypto.randomBytes(16).toString('hex');
    const notifId = crypto.randomBytes(16).toString('hex');
    const newCurrent = goal.current_amount + actualAmount; // No Math.min needed — actualAmount is already capped
    const updated = db.transaction(() => {
      const deductResult = db.prepare(
        "UPDATE users SET wallet_balance = wallet_balance - ?, updated_at = datetime('now') WHERE id = ? AND wallet_balance >= ?"
      ).run(actualAmount, payload.userId, actualAmount);
      if (deductResult.changes === 0) {
        // Balance insufficient OR user not found — abort the whole txn.
        throw new Error('INSUFFICIENT_BALANCE');
      }
      db.prepare('UPDATE savings_goals SET current_amount = ? WHERE id = ?').run(newCurrent, req.params.id);
      db.prepare('INSERT INTO transactions (id, user_id, type, amount, method, status, reference_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        txId, payload.userId, 'savings_debit', actualAmount, 'wallet', 'completed', req.params.id
      );
      db.prepare('INSERT INTO notifications (id, user_id, type, message, link) VALUES (?, ?, ?, ?, ?)').run(
        notifId, payload.userId, 'payment', `تم إضافة ${Number(actualAmount).toLocaleString()} ج.م لهدف "${goal.name}"`, '/wallet'
      );
      return db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(req.params.id);
    })();

    // ─── Broadcast wallet update (outside the transaction) ─────────
    try {
      const wsManager = (req.app as any).locals?.wsManager;
      if (wsManager) {
        wsManager.sendToUser(payload.userId, { type: "wallet:updated", data: { userId: payload.userId, amount: -amount } });
      }
    } catch {}

    res.json(updated);
  } catch (err: any) {
    if (err.message === 'INSUFFICIENT_BALANCE') {
      res.status(400).json({ error: 'رصيد المحفظة غير كافٍ لإضافة هذا المبلغ للهدف' });
      return;
    }
    res.status(500).json({ error: 'فشل إضافة المبلغ لهدف التوفير', details: err.message });
  }
});

// POST /api/wallet/savings-goals/:id/withdraw — Move money from goal back to wallet
router.post('/savings-goals/:id/withdraw', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { amount } = req.body;
    if (!amount || amount <= 0) { res.status(400).json({ error: 'المبلغ مطلوب ويجب أن يكون أكبر من صفر' }); return; }

    const goal = db.prepare('SELECT * FROM savings_goals WHERE id = ? AND user_id = ?').get(req.params.id, payload.userId) as any;
    if (!goal) { res.status(404).json({ error: 'الهدف غير موجود' }); return; }

    if (amount > goal.current_amount) {
      res.status(400).json({ error: `لا يمكن سحب أكثر من المبلغ المُدَّخر (${goal.current_amount.toLocaleString()} ج.م)` });
      return;
    }

    const txId = crypto.randomBytes(16).toString('hex');
    const notifId = crypto.randomBytes(16).toString('hex');
    const updated = db.transaction(() => {
      // Conditional: only succeeds if goal.current_amount is still ≥ amount.
      // (Closes the race where two concurrent /withdraw calls both pass
      // the outer check before either deduction lands.)
      const deductResult = db.prepare(
        'UPDATE savings_goals SET current_amount = current_amount - ? WHERE id = ? AND current_amount >= ?'
      ).run(amount, req.params.id, amount);
      if (deductResult.changes === 0) {
        throw new Error('GOAL_INSUFFICIENT');
      }
      db.prepare("UPDATE users SET wallet_balance = wallet_balance + ?, updated_at = datetime('now') WHERE id = ?")
        .run(amount, payload.userId);
      db.prepare('INSERT INTO transactions (id, user_id, type, amount, method, status, reference_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        txId, payload.userId, 'savings_refund', amount, 'wallet', 'completed', req.params.id
      );
      db.prepare('INSERT INTO notifications (id, user_id, type, message, link) VALUES (?, ?, ?, ?, ?)').run(
        notifId, payload.userId, 'payment', `تم سحب ${Number(amount).toLocaleString()} ج.م من هدف "${goal.name}" إلى محفظتك`, '/wallet'
      );
      return db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(req.params.id);
    })();

    try {
      const wsManager = (req.app as any).locals?.wsManager;
      if (wsManager) {
        wsManager.sendToUser(payload.userId, { type: "wallet:updated", data: { userId: payload.userId, amount } });
      }
    } catch {}

    res.json(updated);
  } catch (err: any) {
    if (err.message === 'GOAL_INSUFFICIENT') {
      res.status(400).json({ error: 'المبلغ المُدَّخر في الهدف غير كافٍ (ربما تم سحبه من تبويب آخر)' });
      return;
    }
    res.status(500).json({ error: 'فشل سحب المبلغ من هدف التوفير', details: err.message });
  }
});

// DELETE /api/wallet/savings-goals/:id — Refund remaining balance to wallet
router.delete('/savings-goals/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const goal = db.prepare('SELECT * FROM savings_goals WHERE id = ? AND user_id = ?').get(req.params.id, payload.userId) as any;
    if (!goal) { res.status(404).json({ error: 'الهدف غير موجود' }); return; }

    const txId = crypto.randomBytes(16).toString('hex');
    const notifId = crypto.randomBytes(16).toString('hex');
    db.transaction(() => {
      // ─── Refund remaining balance to wallet ────────────────────────
      if (goal.current_amount > 0) {
        db.prepare("UPDATE users SET wallet_balance = wallet_balance + ?, updated_at = datetime('now') WHERE id = ?")
          .run(goal.current_amount, payload.userId);

        db.prepare('INSERT INTO transactions (id, user_id, type, amount, method, status, reference_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
          txId, payload.userId, 'savings_refund', goal.current_amount, 'wallet', 'completed', req.params.id
        );

        db.prepare('INSERT INTO notifications (id, user_id, type, message, link) VALUES (?, ?, ?, ?, ?)').run(
          notifId, payload.userId, 'payment', `تم استرداد ${goal.current_amount.toLocaleString()} ج.م من حذف هدف "${goal.name}"`, '/wallet'
        );
      }

      const result = db.prepare('DELETE FROM savings_goals WHERE id = ? AND user_id = ?').run(req.params.id, payload.userId);
      if (result.changes === 0) {
        throw new Error('GOAL_NOT_FOUND');
      }
    })();

    try {
      const wsManager = (req.app as any).locals?.wsManager;
      if (wsManager && goal.current_amount > 0) {
        wsManager.sendToUser(payload.userId, { type: "wallet:updated", data: { userId: payload.userId, amount: goal.current_amount } });
      }
    } catch {}

    res.json({ success: true });
  } catch (err: any) {
    if (err.message === 'GOAL_NOT_FOUND') {
      res.status(404).json({ error: 'الهدف غير موجود' });
      return;
    }
    res.status(500).json({ error: 'فشل حذف هدف التوفير', details: err.message });
  }
});

export default router;
