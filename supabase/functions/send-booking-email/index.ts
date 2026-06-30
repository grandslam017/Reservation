import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

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

  try {
    const payload = await req.json();
    
    // Check if it's a Supabase Webhook payload
    // { type: 'INSERT', table: 'bookings', record: { ... } }
    const booking = payload.record || payload;

    if (!booking || !booking.email) {
      return new Response(JSON.stringify({ message: "No email address or record provided" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (!RESEND_API_KEY) {
      console.warn("RESEND_API_KEY is not set. Skipping email sending.");
      return new Response(JSON.stringify({ error: "Resend API Key is missing on backend" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const emailSubject = `ยืนยันการจองสนาม The Grand Slam - ใบเสร็จเลขที่ ${booking.receipt_no}`;
    const emailBody = `สวัสดีคุณ ${booking.customer_name},

ระบบได้ทำการบันทึกข้อมูลการจองของคุณเรียบร้อยแล้ว

รายละเอียดการจอง:
- สนาม: ${booking.court}
- วันที่จอง: ${booking.booking_date}
- เวลา: ${booking.time_slot}
- บริการผู้ฝึกสอน (Coach): ${booking.require_coach ? "รับโค้ช" : "ไม่รับโค้ช"}
- ค่าบริการรวม: ${booking.fee} บาท
- หมายเลขใบแจ้งหนี้ (Invoice): ${booking.invoice_no}
- หมายเลขใบเสร็จ (Receipt): ${booking.receipt_no}

ขอขอบคุณที่ใช้บริการ The Grand Slam Tennis Court ครับ`;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: "The Grand Slam <onboarding@resend.dev>", // Replace with verified domain in production
        to: [booking.email],
        subject: emailSubject,
        text: emailBody
      })
    });

    const resData = await response.json();
    return new Response(JSON.stringify(resData), {
      status: response.status,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
});
