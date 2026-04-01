const { supabase } = require('../config/database');
const { logger } = require('../utils/logger');

/**
 * Create a payment record.
 */
async function createPayment(data) {
  const { data: payment, error } = await supabase
    .from('payments')
    .insert({
      user_id: data.userId,
      phone_number: data.phoneNumber,
      stripe_payment_link_id: data.paymentLinkId || null,
      stripe_payment_link_url: data.paymentLinkUrl || null,
      amount: data.amount,
      currency: data.currency || 'usd',
      status: 'pending',
      service_type: data.serviceType || null,
      package_tier: data.packageTier || null,
      description: data.description || null,
      customer_email: data.customerEmail || null,
      customer_name: data.customerName || null,
      metadata: data.metadata || {},
    })
    .select()
    .single();

  if (error) {
    logger.error('[PAYMENTS] Create payment error:', error.message);
    throw error;
  }
  return payment;
}

/**
 * Update a payment record.
 */
async function updatePayment(paymentId, fields) {
  const { data, error } = await supabase
    .from('payments')
    .update(fields)
    .eq('id', paymentId)
    .select()
    .single();

  if (error) {
    logger.error('[PAYMENTS] Update payment error:', error.message);
    throw error;
  }
  return data;
}

/**
 * Find payment by Stripe session ID.
 */
async function findPaymentBySessionId(sessionId) {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('stripe_session_id', sessionId)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error('[PAYMENTS] Find by session error:', error.message);
  }
  return data;
}

/**
 * Find payment by Stripe payment link ID.
 */
async function findPaymentByLinkId(linkId) {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('stripe_payment_link_id', linkId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error('[PAYMENTS] Find by link error:', error.message);
  }
  return data;
}

/**
 * Get all payments for a user.
 */
async function getUserPayments(userId) {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('[PAYMENTS] Get user payments error:', error.message);
    throw error;
  }
  return data || [];
}

/**
 * Get latest pending payment for a user.
 */
async function getLatestPendingPayment(userId) {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error('[PAYMENTS] Get latest pending error:', error.message);
  }
  return data;
}

/**
 * Get all payments (for admin).
 */
async function getAllPayments() {
  const { data, error } = await supabase
    .from('payments')
    .select('*, users(phone_number, name)')
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('[PAYMENTS] Get all payments error:', error.message);
    throw error;
  }
  return data || [];
}

/**
 * Get revenue stats.
 */
async function getRevenueStats() {
  const { data: payments, error } = await supabase
    .from('payments')
    .select('amount, currency, status, service_type, package_tier, paid_at, created_at');

  if (error) {
    logger.error('[PAYMENTS] Revenue stats error:', error.message);
    throw error;
  }

  const all = payments || [];
  const paid = all.filter(p => p.status === 'paid');
  const pending = all.filter(p => p.status === 'pending');

  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();

  const paidThisMonth = paid.filter(p => p.paid_at >= thisMonth);
  const paidLastMonth = paid.filter(p => p.paid_at >= lastMonth && p.paid_at <= lastMonthEnd);

  const totalRevenue = paid.reduce((sum, p) => sum + p.amount, 0);
  const revenueThisMonth = paidThisMonth.reduce((sum, p) => sum + p.amount, 0);
  const revenueLastMonth = paidLastMonth.reduce((sum, p) => sum + p.amount, 0);
  const pendingAmount = pending.reduce((sum, p) => sum + p.amount, 0);

  // Revenue by service
  const byService = {};
  paid.forEach(p => {
    const svc = p.service_type || 'other';
    byService[svc] = (byService[svc] || 0) + p.amount;
  });

  // Revenue by month (last 6 months)
  const byMonth = {};
  paid.forEach(p => {
    const month = (p.paid_at || p.created_at || '').slice(0, 7);
    if (month) byMonth[month] = (byMonth[month] || 0) + p.amount;
  });

  return {
    totalRevenue,
    revenueThisMonth,
    revenueLastMonth,
    pendingAmount,
    totalPaid: paid.length,
    totalPending: pending.length,
    totalPayments: all.length,
    avgDealSize: paid.length > 0 ? Math.round(totalRevenue / paid.length) : 0,
    byService,
    byMonth,
  };
}

module.exports = {
  createPayment,
  updatePayment,
  findPaymentBySessionId,
  findPaymentByLinkId,
  getUserPayments,
  getLatestPendingPayment,
  getAllPayments,
  getRevenueStats,
};
