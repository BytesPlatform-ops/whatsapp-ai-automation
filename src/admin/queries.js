const { supabase } = require('../config/database');

/**
 * Get overview metrics for the dashboard.
 */
async function getOverviewMetrics() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Run all queries in parallel
  const [
    usersResult,
    activeTodayResult,
    activeWeekResult,
    sitesResult,
    auditsResult,
    meetingsResult,
    messagesWeekResult,
  ] = await Promise.all([
    supabase.from('users').select('id, state, metadata, created_at'),
    supabase.from('conversations').select('user_id').gte('created_at', todayStart),
    supabase.from('conversations').select('user_id').gte('created_at', weekAgo),
    supabase.from('generated_sites').select('id, status'),
    supabase.from('website_audits').select('id, status'),
    supabase.from('meetings').select('id, status'),
    supabase.from('conversations').select('id').gte('created_at', weekAgo),
  ]);

  const users = usersResult.data || [];
  const activeToday = new Set((activeTodayResult.data || []).map((r) => r.user_id)).size;
  const activeWeek = new Set((activeWeekResult.data || []).map((r) => r.user_id)).size;
  const sites = sitesResult.data || [];
  const audits = auditsResult.data || [];
  const meetings = meetingsResult.data || [];
  const messagesWeek = (messagesWeekResult.data || []).length;

  const qualified = users.filter((u) => u.metadata?.leadBriefSent).length;
  const closed = users.filter((u) => u.metadata?.leadClosed).length;
  const hotLeads = users.filter((u) => u.metadata?.leadTemperature === 'HOT').length;
  const warmLeads = users.filter((u) => u.metadata?.leadTemperature === 'WARM').length;
  const coldLeads = users.filter((u) => u.metadata?.leadTemperature === 'COLD').length;

  // State distribution
  const stateDistribution = {};
  users.forEach((u) => {
    stateDistribution[u.state] = (stateDistribution[u.state] || 0) + 1;
  });

  return {
    totalUsers: users.length,
    activeToday,
    activeWeek,
    qualified,
    closed,
    hotLeads,
    warmLeads,
    coldLeads,
    conversionRate: users.length > 0 ? ((closed / users.length) * 100).toFixed(1) : '0',
    qualificationRate: users.length > 0 ? ((qualified / users.length) * 100).toFixed(1) : '0',
    messagesWeek,
    sites: {
      total: sites.length,
      collecting: sites.filter((s) => s.status === 'collecting').length,
      preview: sites.filter((s) => s.status === 'preview').length,
      approved: sites.filter((s) => s.status === 'approved').length,
    },
    audits: {
      total: audits.length,
      pending: audits.filter((a) => a.status === 'pending').length,
      completed: audits.filter((a) => a.status === 'completed').length,
      failed: audits.filter((a) => a.status === 'failed').length,
    },
    meetings: {
      total: meetings.length,
      pending: meetings.filter((m) => m.status === 'pending').length,
      confirmed: meetings.filter((m) => m.status === 'confirmed').length,
      cancelled: meetings.filter((m) => m.status === 'cancelled').length,
    },
    stateDistribution,
  };
}

/**
 * Get all leads with last activity info.
 */
async function getLeads() {
  const { data: users, error } = await supabase
    .from('users')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) throw error;

  // Get last message time for each user
  const userIds = (users || []).map((u) => u.id);
  const { data: lastMessages } = await supabase
    .from('conversations')
    .select('user_id, created_at')
    .in('user_id', userIds.length > 0 ? userIds : ['none'])
    .order('created_at', { ascending: false });

  // Build a map of user_id -> last_message_at
  const lastMessageMap = {};
  (lastMessages || []).forEach((m) => {
    if (!lastMessageMap[m.user_id]) {
      lastMessageMap[m.user_id] = m.created_at;
    }
  });

  // Get message counts per user
  const { data: messageCounts } = await supabase
    .from('conversations')
    .select('user_id')
    .in('user_id', userIds.length > 0 ? userIds : ['none']);

  const countMap = {};
  (messageCounts || []).forEach((m) => {
    countMap[m.user_id] = (countMap[m.user_id] || 0) + 1;
  });

  return (users || []).map((u) => ({
    id: u.id,
    phone_number: u.phone_number,
    name: u.name || '',
    business_name: u.business_name || '',
    state: u.state,
    created_at: u.created_at,
    updated_at: u.updated_at,
    last_message_at: lastMessageMap[u.id] || u.updated_at,
    message_count: countMap[u.id] || 0,
    is_qualified: !!u.metadata?.leadBriefSent,
    is_closed: !!u.metadata?.leadClosed,
    lead_brief: u.metadata?.leadBrief || null,
    lead_temperature: u.metadata?.leadTemperature || null,
    closing_technique: u.metadata?.closingTechnique || null,
    services_used: {
      website: !!u.metadata?.websiteDemoTriggered,
      seo: !!u.metadata?.seoAuditTriggered,
      returnToSales: !!u.metadata?.returnToSales,
    },
    ad_source: u.metadata?.adSource || '',
    channel: u.channel || 'whatsapp',
  }));
}

/**
 * Get full conversation history for a user.
 */
async function getConversation(userId) {
  const [userResult, messagesResult] = await Promise.all([
    supabase.from('users').select('*').eq('id', userId).single(),
    supabase
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true }),
  ]);

  return {
    user: userResult.data,
    messages: messagesResult.data || [],
  };
}

/**
 * Get drop-off analysis — users who stopped at collection states.
 */
async function getDropoffs() {
  const { data: users } = await supabase.from('users').select('*');

  // Get last message time for each
  const userIds = (users || []).map((u) => u.id);
  const { data: lastMessages } = await supabase
    .from('conversations')
    .select('user_id, created_at, message_text, role')
    .in('user_id', userIds.length > 0 ? userIds : ['none'])
    .order('created_at', { ascending: false });

  const lastMsgMap = {};
  const lastUserMsgMap = {};
  (lastMessages || []).forEach((m) => {
    if (!lastMsgMap[m.user_id]) lastMsgMap[m.user_id] = m;
    if (!lastUserMsgMap[m.user_id] && m.role === 'user') lastUserMsgMap[m.user_id] = m;
  });

  const now = new Date();
  const dropoffs = (users || [])
    .map((u) => {
      const lastMsg = lastMsgMap[u.id];
      const lastUserMsg = lastUserMsgMap[u.id];
      const lastActive = lastMsg ? new Date(lastMsg.created_at) : new Date(u.updated_at);
      const hoursInactive = (now - lastActive) / (1000 * 60 * 60);

      return {
        id: u.id,
        phone_number: u.phone_number,
        name: u.name || '',
        state: u.state,
        hours_inactive: Math.round(hoursInactive),
        last_message_at: lastMsg?.created_at || u.updated_at,
        last_bot_message: lastMsg?.role === 'assistant' ? (lastMsg.message_text || '').slice(0, 150) : '',
        last_user_message: lastUserMsg ? (lastUserMsg.message_text || '').slice(0, 150) : '',
        is_qualified: !!u.metadata?.leadBriefSent,
        is_closed: !!u.metadata?.leadClosed,
      };
    })
    .filter((u) => u.hours_inactive > 24 && !u.is_closed)
    .sort((a, b) => a.hours_inactive - b.hours_inactive);

  return dropoffs;
}

/**
 * Get all generated sites with user info.
 */
async function getSites() {
  const { data } = await supabase
    .from('generated_sites')
    .select('*, users(phone_number, name)')
    .order('created_at', { ascending: false });

  return (data || []).map((s) => ({
    id: s.id,
    user_phone: s.users?.phone_number || '',
    user_name: s.users?.name || '',
    template_id: s.template_id,
    status: s.status,
    preview_url: s.preview_url || '',
    created_at: s.created_at,
    updated_at: s.updated_at,
    business_name: s.site_data?.businessName || '',
  }));
}

/**
 * Get all SEO audits with user info and scraped data.
 */
async function getAudits() {
  const { data } = await supabase
    .from('website_audits')
    .select('*, users(phone_number, name)')
    .order('created_at', { ascending: false });

  return (data || []).map((a) => {
    const raw = a.raw_data || {};
    // Extract a score from the analysis text if present
    const scoreMatch = (a.analysis_text || '').match(/(?:overall\s*score|score)\s*[:\-]?\s*(\d{1,3})\s*(?:\/\s*100|out of 100)?/i);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : null;

    return {
      id: a.id,
      user_phone: a.users?.phone_number || '',
      user_name: a.users?.name || '',
      url: a.url,
      status: a.status,
      created_at: a.created_at,
      score,
      analysis: a.analysis_text || '',
      // Scraped metrics
      metrics: {
        title: raw.title || '',
        metaDescription: raw.metaDescription || '',
        hasViewport: !!raw.hasViewport,
        isHttps: !!raw.isHttps,
        loadTimeMs: raw.loadTimeMs || 0,
        bodyTextLength: raw.bodyTextLength || 0,
        htmlSize: raw.htmlSize || 0,
        totalImages: raw.totalImages || 0,
        imagesWithoutAlt: raw.imagesWithoutAlt || 0,
        totalLinks: raw.totalLinks || 0,
        externalLinks: raw.externalLinks || 0,
        h1: (raw.headings?.h1 || []),
        h2Count: (raw.headings?.h2 || []).length,
        ogTitle: raw.og?.title || '',
        ogDescription: raw.og?.description || '',
        ogImage: raw.og?.image || '',
      },
    };
  });
}

/**
 * Get all meetings with details.
 */
async function getMeetings() {
  const { data } = await supabase
    .from('meetings')
    .select('*')
    .order('created_at', { ascending: false });

  return data || [];
}

/**
 * Get funnel data: how users progress through stages.
 */
async function getFunnel() {
  const { data: users } = await supabase.from('users').select('state, metadata, created_at');
  const allUsers = users || [];

  // Define funnel stages
  const stages = [
    { name: 'Total Visitors', count: allUsers.length },
    { name: 'Engaged (past Welcome)', count: allUsers.filter((u) => u.state !== 'WELCOME').length },
    {
      name: 'Service Selected',
      count: allUsers.filter(
        (u) =>
          u.state !== 'WELCOME' && u.state !== 'SERVICE_SELECTION'
      ).length,
    },
    {
      name: 'Used a Service',
      count: allUsers.filter(
        (u) => u.metadata?.websiteDemoTriggered || u.metadata?.seoAuditTriggered
      ).length,
    },
    { name: 'Lead Qualified', count: allUsers.filter((u) => u.metadata?.leadBriefSent).length },
    { name: 'Lead Closed', count: allUsers.filter((u) => u.metadata?.leadClosed).length },
  ];

  return stages;
}

/**
 * Get hourly message volume for the past 7 days.
 */
async function getMessageVolume() {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('conversations')
    .select('created_at, role')
    .gte('created_at', weekAgo)
    .order('created_at');

  // Group by day
  const byDay = {};
  (data || []).forEach((m) => {
    const day = m.created_at.slice(0, 10);
    if (!byDay[day]) byDay[day] = { user: 0, assistant: 0 };
    byDay[day][m.role]++;
  });

  return byDay;
}

/**
 * Get all payments with user info.
 */
async function getPayments() {
  const { data } = await supabase
    .from('payments')
    .select('*, users(phone_number, name)')
    .order('created_at', { ascending: false });

  return (data || []).map(p => ({
    id: p.id,
    user_phone: p.users?.phone_number || p.phone_number || '',
    user_name: p.users?.name || p.customer_name || '',
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    service_type: p.service_type || '',
    package_tier: p.package_tier || '',
    description: p.description || '',
    customer_email: p.customer_email || '',
    stripe_payment_link_url: p.stripe_payment_link_url || '',
    paid_at: p.paid_at,
    created_at: p.created_at,
  }));
}

/**
 * Get revenue stats for the dashboard.
 */
async function getRevenue() {
  const { data: payments } = await supabase
    .from('payments')
    .select('amount, currency, status, service_type, package_tier, paid_at, created_at');

  const all = payments || [];
  const paid = all.filter(p => p.status === 'paid');
  const pending = all.filter(p => p.status === 'pending');

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();

  const paidThisMonth = paid.filter(p => p.paid_at && p.paid_at >= thisMonthStart);
  const paidLastMonth = paid.filter(p => p.paid_at && p.paid_at >= lastMonthStart && p.paid_at <= lastMonthEnd);

  const totalRevenue = paid.reduce((s, p) => s + p.amount, 0);
  const revenueThisMonth = paidThisMonth.reduce((s, p) => s + p.amount, 0);
  const revenueLastMonth = paidLastMonth.reduce((s, p) => s + p.amount, 0);
  const pendingAmount = pending.reduce((s, p) => s + p.amount, 0);

  // Revenue by service type
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

/**
 * Get detailed lead profiles for the sales prep page.
 * Includes conversation summary, meetings, payments, websites, audits - everything
 * a salesperson needs before calling a lead.
 */
async function getSalesPrep() {
  // Get all users who are qualified or closed (worth calling)
  const { data: users } = await supabase
    .from('users')
    .select('*')
    .order('updated_at', { ascending: false });

  if (!users || users.length === 0) return [];

  const userIds = users.map(u => u.id);

  // Fetch all related data in parallel
  const [messagesRes, meetingsRes, paymentsRes, sitesRes, auditsRes] = await Promise.all([
    supabase.from('conversations').select('user_id, message_text, role, created_at').in('user_id', userIds).order('created_at', { ascending: true }),
    supabase.from('meetings').select('*').in('user_id', userIds).order('created_at', { ascending: false }),
    supabase.from('payments').select('*').in('user_id', userIds).order('created_at', { ascending: false }),
    supabase.from('generated_sites').select('id, user_id, preview_url, status, site_data, created_at').in('user_id', userIds).order('created_at', { ascending: false }),
    supabase.from('website_audits').select('id, user_id, url, status, analysis_text, created_at').in('user_id', userIds).order('created_at', { ascending: false }),
  ]);

  // Build lookup maps
  const msgMap = {};
  (messagesRes.data || []).forEach(m => {
    if (!msgMap[m.user_id]) msgMap[m.user_id] = [];
    msgMap[m.user_id].push(m);
  });

  const meetingMap = {};
  (meetingsRes.data || []).forEach(m => {
    if (!meetingMap[m.user_id]) meetingMap[m.user_id] = [];
    meetingMap[m.user_id].push(m);
  });

  const paymentMap = {};
  (paymentsRes.data || []).forEach(p => {
    if (!paymentMap[p.user_id]) paymentMap[p.user_id] = [];
    paymentMap[p.user_id].push(p);
  });

  const siteMap = {};
  (sitesRes.data || []).forEach(s => {
    if (!siteMap[s.user_id]) siteMap[s.user_id] = [];
    siteMap[s.user_id].push(s);
  });

  const auditMap = {};
  (auditsRes.data || []).forEach(a => {
    if (!auditMap[a.user_id]) auditMap[a.user_id] = [];
    auditMap[a.user_id].push(a);
  });

  return users.map(u => {
    const msgs = msgMap[u.id] || [];
    const meetings = meetingMap[u.id] || [];
    const payments = paymentMap[u.id] || [];
    const sites = siteMap[u.id] || [];
    const audits = auditMap[u.id] || [];
    const meta = u.metadata || {};

    // Build conversation highlights - key messages
    const userMessages = msgs.filter(m => m.role === 'user').map(m => m.message_text).filter(Boolean);
    const lastUserMsg = userMessages.length > 0 ? userMessages[userMessages.length - 1] : '';
    const lastBotMsg = msgs.filter(m => m.role === 'assistant').map(m => m.message_text).filter(Boolean).pop() || '';

    // Extract key topics from conversation
    const allText = userMessages.join(' ').toLowerCase();
    const topics = [];
    if (/website|site|landing page|redesign/i.test(allText)) topics.push('Website');
    if (/seo|google|rank|search/i.test(allText)) topics.push('SEO');
    if (/app|mobile|android|ios/i.test(allText)) topics.push('App Dev');
    if (/social media|smm|instagram|facebook|tiktok/i.test(allText)) topics.push('Social Media');
    if (/ecommerce|store|shop|product/i.test(allText)) topics.push('Ecommerce');
    if (/marketing|ads|advertis/i.test(allText)) topics.push('Marketing');

    return {
      id: u.id,
      phone_number: u.phone_number,
      name: u.name || '',
      business_name: u.business_name || meta.websiteData?.businessName || '',
      industry: meta.websiteData?.industry || '',
      state: u.state,
      created_at: u.created_at,
      updated_at: u.updated_at,

      // Status flags
      is_qualified: !!meta.leadBriefSent,
      is_closed: !!meta.leadClosed,
      payment_confirmed: !!meta.paymentConfirmed,
      ad_source: meta.adSource || '',
      lead_temperature: meta.leadTemperature || null,
      closing_technique: meta.closingTechnique || null,

      // Lead brief (AI-generated qualification summary)
      lead_brief: meta.leadBrief || null,

      // Conversation stats
      total_messages: msgs.length,
      user_messages: userMessages.length,
      last_user_message: lastUserMsg.slice(0, 200),
      last_bot_message: lastBotMsg.slice(0, 200),
      last_activity: msgs.length > 0 ? msgs[msgs.length - 1].created_at : u.updated_at,
      topics_discussed: topics,

      // Meetings
      meetings: meetings.filter(m => m.preferred_date || m.preferred_time).map(m => {
        // Clean summary - strip lead brief content that sometimes leaks into chat_summary
        const rawSummary = m.chat_summary || '';
        const cleanSummary = (rawSummary.includes('Lead Name') || rawSummary.includes('**')) ? '' : rawSummary;
        return {
          id: m.id,
          date: m.preferred_date,
          time: m.preferred_time,
          timezone: m.preferred_timezone,
          topic: m.topic,
          status: m.status,
          summary: cleanSummary,
        };
      }),

      // Payments
      payments: payments.map(p => ({
        amount: p.amount,
        status: p.status,
        service: p.service_type,
        tier: p.package_tier,
        description: p.description,
        paid_at: p.paid_at,
        created_at: p.created_at,
      })),

      // Websites generated
      websites: sites.map(s => ({
        preview_url: s.preview_url,
        status: s.status,
        business_name: s.site_data?.businessName || '',
        created_at: s.created_at,
      })),

      // SEO audits
      audits: audits.map(a => ({
        url: a.url,
        status: a.status,
        summary: (a.analysis_text || '').slice(0, 300),
        created_at: a.created_at,
      })),

      // Services used
      services_used: {
        website_demo: !!meta.websiteDemoTriggered,
        seo_audit: !!meta.seoAuditTriggered,
      },
    };
  });
}

/**
 * Generate a lead summary from conversation history using LLM.
 */
async function generateLeadSummary(userId) {
  // Fetch conversation
  const { data: messages } = await supabase
    .from('conversations')
    .select('message_text, role, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(60);

  if (!messages || messages.length < 4) return null;

  // Fetch user metadata
  const { data: user } = await supabase.from('users').select('name, phone_number, metadata').eq('id', userId).single();

  const chatLog = messages.map(m => (m.role === 'user' ? 'Client' : 'Bot') + ': ' + (m.message_text || '').slice(0, 300)).join('\n');

  const { generateResponse } = require('../llm/provider');
  const prompt = `You are a sales operations assistant. Analyze this WhatsApp conversation between a sales bot and a lead, then produce a structured brief for the human salesperson who will call this lead.

Return ONLY this exact format (fill in each field):

Name: [client name or "Unknown"]
Business: [business name or "Unknown"]
Industry: [industry or "Unknown"]
Service Needed: [what they want]
Budget: [their budget or stated price point]
Timeline: [when they need it]
Package Discussed: [what package/tier was discussed and at what price]
Pain Point: [their main goal or problem]
Personality: [Cool/Professional/Unsure/Negotiator - based on how they write]
Language: [what language they communicate in]
Objections: [any pushback or concerns they raised, or "None"]
Payment Status: [whether they paid, and how much, or "No payment yet"]
Conversation Summary: [2-3 sentence summary of how the conversation went, what was discussed, what the client cares about, and what the salesperson should focus on during the call. Be specific and actionable.]`;

  try {
    const response = await generateResponse(prompt, [{ role: 'user', content: chatLog }]);

    // Save it to user metadata so we don't regenerate every time
    await supabase.from('users').update({
      metadata: { ...(user?.metadata || {}), leadBrief: response, leadBriefSent: true }
    }).eq('id', userId);

    return response;
  } catch (err) {
    return null;
  }
}

async function getLeadSummaries() {
  const { data, error } = await supabase
    .from('lead_summaries')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

module.exports = {
  getOverviewMetrics,
  getLeads,
  getConversation,
  getDropoffs,
  getSites,
  getAudits,
  getMeetings,
  getFunnel,
  getMessageVolume,
  getPayments,
  getRevenue,
  getSalesPrep,
  generateLeadSummary,
  getLeadSummaries,
};
