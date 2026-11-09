/* The Grand Slam - staging-only data adapter.
 * No DOM, HTML, CSS or payment UI changes. Not connected to production.
 * Requires a Supabase Auth session obtained securely by the host app.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GrandSlamStagingBookingAdapter = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PROJECT = 'kssxxizhpoxxlbsehymk';
  function create(client) {
    if (!client || typeof client.functions?.invoke !== 'function' ||
        typeof client.auth?.getSession !== 'function') {
      throw new TypeError('Supabase client with functions and auth required');
    }

    async function invoke(action, params) {
      const { data: sessionData, error: authError } = await client.auth.getSession();
      if (authError || !sessionData?.session?.access_token) {
        return { success: false, error: 'AUTH_REQUIRED' };
      }
      const { data, error } = await client.functions.invoke('staging-booking-gateway', {
        body: Object.assign({ action }, params),
      });
      if (error) {
        return { success: false, error: 'NETWORK_OR_GATEWAY_ERROR' };
      }
      if (!data || data.environment !== 'staging') {
        return { success: false, error: 'UNTRUSTED_ENVIRONMENT' };
      }
      return data;
    }

    return Object.freeze({
      project: PROJECT,
      async availability(date) {
        const r = await invoke('availability', { date });
        if (!r.success) return r;
        const busy = new Set((r.busy_slots || []).map(x => x.slot));
        // Existing Web App expects anonymous slot states, NEVER customer PII.
        return { success: true, busySlots: [...busy], bookings: [...busy].map(slot => ({
          date, slot, status: 'confirmed', name: '', phone: '', email: '', court: 'Main Court',
        })) };
      },
      async hold(date, slots) {
        const r = await invoke('create', { date, slots, court: 'Main Court' });
        if (!r.success) return r;
        return { success: true, holdToken: r.hold_token, expiresAt: r.expires_at };
      },
      async confirm({ holdToken, requestId, name, phone, email }) {
        const r = await invoke('confirm', {
          hold_token: holdToken, request_id: requestId, name, phone, email,
        });
        if (!r.success) return r;
        // Booking success and payment verification are separate status axes.
        return { success: true, status: 'confirmed', paymentStatus: 'pending_verification',
          paymentVerified: false, bookingIds: r.booking_ids || [], invoiceNo: r.invoice_no };
      },
      async release(holdToken) {
        return invoke('release', { hold_token: holdToken });
      },
    });
  }
  return Object.freeze({ create, STAGING_PROJECT: PROJECT });
});
