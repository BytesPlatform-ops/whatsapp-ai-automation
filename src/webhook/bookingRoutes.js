const { Router } = require('express');
const { getSiteById } = require('../db/sites');
const {
  createAppointment,
  getAppointmentsForSiteInRange,
  getAppointmentByCancelToken,
  cancelAppointment,
} = require('../db/appointments');
const {
  wallClockToUtc,
  generateSlotsForDate,
  filterAgainstAppointments,
  renderLocalHHMM,
  renderLocalDateTime,
} = require('../booking/slots');
const {
  sendCustomerBookingConfirmation,
  sendOwnerNewBookingAlert,
  sendCustomerCancellation,
  sendOwnerCancellationAlert,
} = require('../notifications/bookingEmails');
const { logger } = require('../utils/logger');

const router = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Salon sites on Netlify call these endpoints cross-origin. Allow any origin —
// bookings are scoped by (public) site_id, so there's no auth leak surface.
function cors(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}
router.use('/api/booking', cors);

function loadBookingSettings(site) {
  const settings = site.booking_settings || {};
  const services = Array.isArray(settings.services) ? settings.services : [];
  return {
    mode: site.booking_mode,
    url: site.booking_url,
    timezone: settings.timezone || 'Europe/Dublin',
    weeklyHours: settings.weeklyHours || null,
    slotMinutes: settings.slotMinutes || 30,
    services,
  };
}

function findService(services, name) {
  const lower = String(name || '').trim().toLowerCase();
  return services.find((s) => s.name.toLowerCase() === lower)
    || services.find((s) => s.name.toLowerCase().includes(lower) || lower.includes(s.name.toLowerCase()));
}

/** GET /api/booking/:siteId/availability?service=X&date=YYYY-MM-DD */
router.get('/api/booking/:siteId/availability', async (req, res) => {
  try {
    const { siteId } = req.params;
    const { service, date } = req.query;
    if (!UUID_RE.test(siteId)) return res.status(400).json({ error: 'Invalid site id' });
    if (!service) return res.status(400).json({ error: 'service is required' });
    if (!ISO_DATE_RE.test(date || '')) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });

    const site = await getSiteById(siteId);
    if (!site) return res.status(404).json({ error: 'Site not found' });
    if (site.booking_mode !== 'native') return res.status(400).json({ error: 'This salon is not using native booking' });

    const settings = loadBookingSettings(site);
    const svc = findService(settings.services, service);
    if (!svc) return res.status(400).json({ error: 'Unknown service' });

    const duration = svc.durationMinutes || 30;
    const candidates = generateSlotsForDate({
      dateStr: date,
      weeklyHours: settings.weeklyHours,
      timezone: settings.timezone,
      slotMinutes: settings.slotMinutes,
      durationMinutes: duration,
    });
    if (candidates.length === 0) return res.json({ slots: [] });

    // Pull confirmed appointments for the day ± one day to catch overlaps.
    const dayStart = new Date(candidates[0].getTime() - 12 * 3600 * 1000).toISOString();
    const dayEnd = new Date(candidates[candidates.length - 1].getTime() + 24 * 3600 * 1000).toISOString();
    const existing = await getAppointmentsForSiteInRange(siteId, dayStart, dayEnd);
    const available = filterAgainstAppointments(candidates, existing, duration);

    res.json({
      timezone: settings.timezone,
      slots: available.map((d) => ({
        startAt: d.toISOString(),
        label: renderLocalHHMM(d, settings.timezone),
      })),
    });
  } catch (err) {
    logger.error('[BOOKING] availability error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/** POST /api/booking/:siteId  { service, startAt, customerName, customerEmail, customerPhone, notes } */
router.post('/api/booking/:siteId', async (req, res) => {
  try {
    const { siteId } = req.params;
    if (!UUID_RE.test(siteId)) return res.status(400).json({ error: 'Invalid site id' });
    const { service, startAt, customerName, customerEmail, customerPhone, notes, consentGiven } = req.body || {};

    if (!service || !startAt || !customerName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!customerEmail && !customerPhone) {
      return res.status(400).json({ error: 'Please provide an email or phone so we can confirm' });
    }
    // GDPR consent gate — booking forms collect personal data + an
    // appointment time; the privacy checkbox is required at the form
    // level, double-checked here.
    if (consentGiven !== true && String(consentGiven).toLowerCase() !== 'yes') {
      return res.status(400).json({ error: 'Please agree to the Privacy Policy to continue' });
    }

    const site = await getSiteById(siteId);
    if (!site) return res.status(404).json({ error: 'Site not found' });
    if (site.booking_mode !== 'native') return res.status(400).json({ error: 'Native booking not enabled for this site' });

    const settings = loadBookingSettings(site);
    const svc = findService(settings.services, service);
    if (!svc) return res.status(400).json({ error: 'Unknown service' });

    const start = new Date(startAt);
    if (isNaN(start.getTime())) return res.status(400).json({ error: 'Invalid startAt' });
    if (start.getTime() < Date.now() - 60 * 1000) {
      return res.status(400).json({ error: 'Cannot book a time in the past' });
    }

    // Revalidate against the salon's schedule — don't trust the client's slot blindly.
    const dateStr = start.toISOString().slice(0, 10);
    // Rebuild the candidates for that date (include the previous/next day in case of tz rollover).
    const candidates = [];
    for (const offset of [-1, 0, 1]) {
      const d = new Date(start.getTime() + offset * 24 * 3600 * 1000);
      const ds = d.toISOString().slice(0, 10);
      candidates.push(
        ...generateSlotsForDate({
          dateStr: ds,
          weeklyHours: settings.weeklyHours,
          timezone: settings.timezone,
          slotMinutes: settings.slotMinutes,
          durationMinutes: svc.durationMinutes,
        })
      );
    }
    const isValidSlot = candidates.some((c) => c.getTime() === start.getTime());
    if (!isValidSlot) return res.status(409).json({ error: 'That time is no longer available' });

    const end = new Date(start.getTime() + svc.durationMinutes * 60 * 1000);

    const { appointment, conflict } = await createAppointment({
      siteId,
      serviceName: svc.name,
      durationMinutes: svc.durationMinutes,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      customerName: String(customerName).slice(0, 120),
      customerEmail: customerEmail ? String(customerEmail).slice(0, 160) : null,
      customerPhone: customerPhone ? String(customerPhone).slice(0, 40) : null,
      notes: notes ? String(notes).slice(0, 1000) : null,
      consentGiven: true,
      consentAt: new Date().toISOString(),
    });
    if (conflict) return res.status(409).json({ error: 'That slot was just taken. Please pick another.' });

    // Fire-and-forget email sends — don't block the booking response on SendGrid.
    sendCustomerBookingConfirmation({ appointment, site, settings }).catch((e) =>
      logger.error('[BOOKING] customer email failed:', e.message)
    );
    sendOwnerNewBookingAlert({ appointment, site, settings }).catch((e) =>
      logger.error('[BOOKING] owner email failed:', e.message)
    );

    res.json({
      id: appointment.id,
      startAt: appointment.start_at,
      displayTime: renderLocalDateTime(start, settings.timezone),
    });
  } catch (err) {
    logger.error('[BOOKING] create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

function cancelPageHtml({ title, message, cta }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui,sans-serif;max-width:520px;margin:48px auto;padding:24px;color:#222}h1{font-size:24px;margin-bottom:12px}.btn{display:inline-block;background:#1F2937;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600;margin-top:16px}form{display:inline}.btn[disabled]{opacity:0.5}</style>
</head><body><h1>${title}</h1><p>${message}</p>${cta || ''}</body></html>`;
}

/** GET /api/booking/cancel/:token — shows a confirm page (form POSTs to same URL). */
router.get('/api/booking/cancel/:token', async (req, res) => {
  try {
    const appt = await getAppointmentByCancelToken(req.params.token);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (!appt) {
      return res.status(404).send(cancelPageHtml({ title: 'Link not found', message: 'This cancellation link is invalid or has already been used.' }));
    }
    if (appt.status !== 'confirmed') {
      return res.send(cancelPageHtml({ title: 'Already cancelled', message: 'This appointment has already been cancelled.' }));
    }
    const site = await getSiteById(appt.site_id);
    const tz = site?.booking_settings?.timezone || 'Europe/Dublin';
    const when = renderLocalDateTime(new Date(appt.start_at), tz);
    const cta = `<form method="POST" action="/api/booking/cancel/${appt.cancel_token}"><button class="btn" type="submit">Cancel this appointment</button></form>`;
    res.send(cancelPageHtml({
      title: 'Cancel your appointment',
      message: `<strong>${appt.service_name}</strong> on ${when} (${tz}).`,
      cta,
    }));
  } catch (err) {
    logger.error('[BOOKING] cancel GET error:', err);
    res.status(500).send(cancelPageHtml({ title: 'Something went wrong', message: 'Please try again.' }));
  }
});

/** POST /api/booking/cancel/:token — actually cancels. */
router.post('/api/booking/cancel/:token', async (req, res) => {
  try {
    const appt = await getAppointmentByCancelToken(req.params.token);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (!appt) {
      return res.status(404).send(cancelPageHtml({ title: 'Link not found', message: 'This cancellation link is invalid.' }));
    }
    if (appt.status !== 'confirmed') {
      return res.send(cancelPageHtml({ title: 'Already cancelled', message: 'Nothing more to do.' }));
    }
    const cancelled = await cancelAppointment(appt.id);
    if (!cancelled) {
      return res.send(cancelPageHtml({ title: 'Already cancelled', message: 'This appointment has already been cancelled.' }));
    }
    const site = await getSiteById(appt.site_id);
    const settings = loadBookingSettings(site);
    sendCustomerCancellation({ appointment: cancelled, site, settings }).catch((e) => logger.error('[BOOKING] customer cancel email failed:', e.message));
    sendOwnerCancellationAlert({ appointment: cancelled, site, settings }).catch((e) => logger.error('[BOOKING] owner cancel email failed:', e.message));
    res.send(cancelPageHtml({ title: 'Cancelled', message: 'Your appointment has been cancelled. Hope to see you another time.' }));
  } catch (err) {
    logger.error('[BOOKING] cancel POST error:', err);
    res.status(500).send(cancelPageHtml({ title: 'Something went wrong', message: 'Please try again.' }));
  }
});

module.exports = router;
