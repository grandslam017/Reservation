import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8"

const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    });
  }

  // Security Check: Verify that this is triggered by cron or authorised system
  // We can check if a secret token is provided in the headers, or just run.
  // In production, you'd verify a secret token (e.g. Authorization header matching a cron secret)

  try {
    if (!LINE_CHANNEL_ACCESS_TOKEN) {
      throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not set.");
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials are not configured in environment variables.");
    }

    // Initialize Supabase Client with service role key to read all bookings
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get tomorrow's date string (YYYY-MM-DD) in Asia/Bangkok time zone
    const tomorrow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const dd = String(tomorrow.getDate()).padStart(2, '0');
    const tomorrowStr = `${yyyy}-${mm}-${dd}`;

    console.log(`Checking bookings for tomorrow: ${tomorrowStr}`);

    // Query active bookings for tomorrow that have a line_user_id starting with 'U'
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('customer_name, time_slot, line_user_id, court')
      .eq('booking_date', tomorrowStr)
      .neq('status', 'cancelled');

    if (error) throw error;

    if (!bookings || bookings.length === 0) {
      return new Response(JSON.stringify({ message: "No bookings found for tomorrow." }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    const notifiedUsers = [];
    const errors = [];

    // Send notifications to each customer
    for (const booking of bookings) {
      const uid = booking.line_user_id;
      if (!uid || !uid.startsWith('U')) {
        console.log(`Skipping notification for ${booking.customer_name} (No valid LINE UID)`);
        continue;
      }

      const messageText = `คุณ ${booking.customer_name} ครับ\n\nพรุ่งนี้คุณมีนัดจองใช้บริการสนามเทนนิส 🎾\n\nรายละเอียด:\n- สนาม: ${booking.court}\n- เวลา: ${booking.time_slot}\n\nแล้วพบกันครับ!`;
      
      try {
        const lineResponse = await fetch("https://api.line.me/v2/bot/message/push", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
          },
          body: JSON.stringify({
            to: uid,
            messages: [
              {
                "type": "text",
                "text": messageText
              }
            ]
          })
        });

        if (!lineResponse.ok) {
          const errBody = await lineResponse.text();
          throw new Error(`LINE API error: ${lineResponse.status} - ${errBody}`);
        }

        notifiedUsers.push(booking.customer_name);
      } catch (err) {
        console.error(`Failed to send LINE message to ${booking.customer_name}:`, err);
        errors.push({ customer: booking.customer_name, error: err.message });
      }
    }

    return new Response(JSON.stringify({ 
      message: `Notification run completed.`, 
      notified: notifiedUsers,
      failed: errors 
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Cron Job Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
