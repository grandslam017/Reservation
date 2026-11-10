import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8"
import { LOGO_BASE64 } from "./logo.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
const LINE_ADMIN_USER_ID = Deno.env.get("LINE_ADMIN_USER_ID"); // Optional: Admin LINE User ID to receive daily summary

// Helper: Convert number to Thai Baht text (e.g. 3100 -> "สามพันหนึ่งร้อยบาทถ้วน")
function thaiBahtText(num: number): string {
  if (isNaN(num) || num === 0) return "ศูนย์บาทถ้วน";
  const numText = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
  const unitText = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"];

  const fixed = num.toFixed(2);
  const [intPart, decPart] = fixed.split(".");

  function convertInteger(digits: string): string {
    let text = "";
    const len = digits.length;
    for (let i = 0; i < len; i++) {
      const d = parseInt(digits[i], 10);
      const pos = len - i - 1;
      if (d !== 0) {
        if (pos === 0 && d === 1 && len > 1) {
          text += "เอ็ด";
        } else if (pos === 1 && d === 1) {
          text += ""; // "สิบ" instead of "หนึ่งสิบ"
        } else if (pos === 1 && d === 2) {
          text += "ยี่";
        } else {
          text += numText[d];
        }
        text += unitText[pos];
      }
    }
    return text;
  }

  let result = "";
  // Handle numbers over 1 million
  if (intPart.length > 6) {
    const millions = intPart.slice(0, intPart.length - 6);
    const remainder = intPart.slice(intPart.length - 6);
    result += convertInteger(millions) + "ล้าน" + convertInteger(remainder);
  } else {
    result += convertInteger(intPart);
  }
  result += "บาท";

  const decNum = parseInt(decPart, 10);
  if (decNum === 0) {
    result += "ถ้วน";
  } else {
    result += convertInteger(decPart) + "สตางค์";
  }

  return `"${result}"`;
}

// Helper: Format YYYY-MM-DD to Thai Date (e.g. "2026-11-10" -> "10 พฤศจิกายน 2569")
function formatThaiDate(dateStr: string): string {
  const thaiMonths = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
  ];
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const year = parseInt(parts[0], 10) + 543;
  const month = thaiMonths[parseInt(parts[1], 10) - 1] || "";
  const day = parseInt(parts[2], 10);
  return `${day} ${month} ${year}`;
}

// Helper: Format Currency (e.g. 1000 -> "1,000.00")
function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Render the official approved HTML Invoice
function renderInvoiceHtml(params: {
  invoiceNo: string;
  thaiDate: string;
  dayHours: number;
  dayAmount: number;
  nightHours: number;
  nightAmount: number;
  totalHours: number;
  totalAmount: number;
  totalAmountText: string;
}): string {
  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ใบแจ้งหนี้ / INVOICE ${params.invoiceNo} - The Grand Slam Services Co., Ltd.</title>
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;500;600;700&family=Sarabun:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body {
      font-family: 'Sarabun', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .font-prompt { font-family: 'Prompt', sans-serif; }
    @media print {
      body { background: white !important; padding: 0 !important; }
      .no-print { display: none !important; }
      .invoice-card { box-shadow: none !important; border: none !important; width: 100% !important; max-width: 100% !important; padding: 0 !important; margin: 0 !important; }
    }
  </style>
</head>
<body class="bg-slate-100 text-slate-800 p-4 md:p-8 min-h-screen flex flex-col items-center">

  <div class="no-print w-full max-w-4xl mb-4 bg-white p-3.5 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
    <div class="flex items-center gap-2">
      <span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs">✓</span>
      <div>
        <h3 class="font-bold text-slate-900 text-sm font-prompt">ใบแจ้งหนี้รายได้ประจำวัน (Daily Revenue Invoice)</h3>
        <p class="text-xs text-slate-500">เลขที่: ${params.invoiceNo} | วันที่บริการ: ${params.thaiDate}</p>
      </div>
    </div>
    <button onclick="window.print()" class="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm font-prompt">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
      พิมพ์ / บันทึก PDF
    </button>
  </div>

  <div class="invoice-card bg-white w-full max-w-4xl p-8 md:p-12 rounded-2xl shadow-xl border border-slate-200 relative overflow-hidden my-2">
    <div class="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-amber-600 via-amber-400 to-amber-600"></div>

    <!-- Header Section -->
    <div class="flex flex-col md:flex-row justify-between items-start gap-6 border-b-2 border-slate-900 pb-6 pt-3">
      <div class="flex items-start gap-4">
        <img src="data:image/jpeg;base64,${LOGO_BASE64}" alt="The Grand Slam Logo" class="w-24 h-24 object-contain rounded-full shadow-md border-2 border-amber-300 flex-shrink-0">
        <div>
          <h1 class="text-xl font-bold text-slate-900 leading-tight">บริษัท เดอะ แกรนด์สแลม เซอร์วิสเซส จำกัด</h1>
          <h2 class="text-sm md:text-base font-bold text-amber-700 tracking-wide uppercase mt-1">THE GRAND SLAM SERVICES CO., LTD.</h2>
          <div class="mt-2.5 text-xs text-slate-800 space-y-0.5 leading-relaxed">
            <p><span class="font-semibold text-slate-800">เลขประจำตัวผู้เสียภาษี:</span> <span class="font-mono font-bold tracking-wider text-slate-900">0105569192114</span></p>
            <p><span class="font-semibold text-slate-800">ที่ตั้ง:</span> <span class="text-slate-800">288/114 หมู่บ้าน เมอร์ราญาเพลส ซอย คู้บอน 34 ถนนคู้บอน</span></p>
            <p class="text-slate-800">แขวงบางชัน เขตคลองสามวา กรุงเทพมหานคร 10510</p>
            <p><span class="font-semibold text-slate-800">โทรศัพท์:</span> <span class="font-mono font-bold text-slate-900">089-4932242</span></p>
          </div>
        </div>
      </div>

      <div class="flex flex-col items-start md:items-end text-left md:text-right w-full md:w-auto self-stretch justify-between">
        <div>
          <h2 class="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight font-prompt">ใบแจ้งหนี้</h2>
          <p class="text-sm font-bold text-amber-600 tracking-widest uppercase font-prompt">INVOICE</p>
        </div>

        <div class="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1.5 w-full md:w-60 shadow-sm">
          <div class="flex justify-between">
            <span class="text-slate-600 font-medium">เลขที่เอกสาร:</span>
            <span class="font-mono font-bold text-slate-900 text-sm">${params.invoiceNo}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-600 font-medium">วันที่:</span>
            <span class="font-bold text-slate-800">${params.thaiDate}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Items Table -->
    <div class="mt-8 border border-slate-300 rounded-xl overflow-hidden shadow-sm">
      <table class="w-full text-left border-collapse text-xs md:text-sm">
        <thead>
          <tr class="bg-slate-900 text-white font-semibold font-prompt">
            <th class="py-3.5 px-4 w-16 text-center border-r border-slate-700">ลำดับ</th>
            <th class="py-3.5 px-6 border-r border-slate-700">รายการ</th>
            <th class="py-3.5 px-4 text-center w-28 border-r border-slate-700">จำนวนชม.</th>
            <th class="py-3.5 px-4 text-right w-32 border-r border-slate-700">ราคา/ชม. (บาท)</th>
            <th class="py-3.5 px-6 text-right w-36">จำนวนเงิน (บาท)</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 bg-white">
          <tr class="hover:bg-slate-50/80 transition">
            <td class="py-4 px-4 text-center font-medium text-slate-600 border-r border-slate-200">1</td>
            <td class="py-4 px-6 font-semibold text-slate-900 border-r border-slate-200">
              ค่าบริการสนามเทนนิส ช่วงเวลา 08.00-16.00
            </td>
            <td class="py-4 px-4 text-center font-mono font-bold text-slate-800 border-r border-slate-200">${params.dayHours}</td>
            <td class="py-4 px-4 text-right font-mono text-slate-700 border-r border-slate-200">250.00</td>
            <td class="py-4 px-6 text-right font-mono font-bold text-slate-900">${formatCurrency(params.dayAmount)}</td>
          </tr>

          <tr class="hover:bg-slate-50/80 transition bg-slate-50/30">
            <td class="py-4 px-4 text-center font-medium text-slate-600 border-r border-slate-200">2</td>
            <td class="py-4 px-6 font-semibold text-slate-900 border-r border-slate-200">
              ค่าบริการสนามเทนนิส ช่วงเวลา 16.00-23.00
            </td>
            <td class="py-4 px-4 text-center font-mono font-bold text-slate-800 border-r border-slate-200">${params.nightHours}</td>
            <td class="py-4 px-4 text-right font-mono text-slate-700 border-r border-slate-200">350.00</td>
            <td class="py-4 px-6 text-right font-mono font-bold text-slate-900">${formatCurrency(params.nightAmount)}</td>
          </tr>
        </tbody>
        <tfoot class="border-t-2 border-slate-900 bg-slate-50 text-xs md:text-sm font-prompt">
          <tr>
            <td colspan="3" class="py-4 px-6 border-r border-slate-300">
              <span class="text-slate-600 font-normal">จำนวนเงินตัวอักษร:</span>
              <span class="font-bold text-slate-900 ml-1.5">${params.totalAmountText}</span>
            </td>
            <td class="py-4 px-4 text-right font-bold text-slate-900 whitespace-nowrap border-r border-slate-300">
              ยอดรวมทั้งหมด:
            </td>
            <td class="py-4 px-6 text-right font-bold font-mono text-slate-900 text-base">
              ${formatCurrency(params.totalAmount)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Bottom Section: Signature & System Footer -->
    <div class="mt-12 pt-8 border-t border-slate-200">
      <div class="flex justify-start mb-8">
        <div class="w-72 text-center">
          <div class="h-16 flex items-end justify-center pb-2">
            <!-- Signature Space -->
          </div>
          <div class="border-b border-black mb-2"></div>
          <p class="font-bold text-slate-900 text-sm font-prompt">ผู้มีอำนาจลงนาม</p>
          <p class="text-xs text-slate-700 mt-0.5">บริษัท เดอะ แกรนด์สแลม เซอร์วิสเซส จำกัด</p>
          <p class="text-xs text-slate-400 mt-1 font-mono">วันที่ ...... / ...... / .........</p>
        </div>
      </div>

      <div class="pt-4 border-t border-slate-100 text-center text-xs text-slate-400 font-medium">
        เอกสารนี้ออกโดยระบบบริหารจัดการ The Grand Slam Services Management System
      </div>
    </div>
  </div>

</body>
</html>`;
}

serve(async (req) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials are not configured in environment variables.");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const url = new URL(req.url);

    let targetDateStr = url.searchParams.get("date") || "";
    let isViewHtml = url.searchParams.get("view") === "html" || (req.headers.get("accept") || "").includes("text/html");
    let notifyLine = url.searchParams.get("notify") !== "false";

    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body.date) targetDateStr = String(body.date).trim();
        if (body.view === "html") isViewHtml = true;
        if (body.notify !== undefined) notifyLine = Boolean(body.notify);
      } catch (_) {}
    }

    // Default to today's date in Asia/Bangkok time
    if (!targetDateStr) {
      const nowBangkok = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
      const yyyy = nowBangkok.getFullYear();
      const mm = String(nowBangkok.getMonth() + 1).padStart(2, '0');
      const dd = String(nowBangkok.getDate()).padStart(2, '0');
      targetDateStr = `${yyyy}-${mm}-${dd}`;
    }

    console.log(`Processing daily revenue invoice for service date: ${targetDateStr}`);

    // Query confirmed bookings for this service date (Accrual Basis)
    const { data: bookings, error: dbError } = await supabase
      .from('bookings')
      .select('id, booking_date, time_slot, court, fee, status')
      .eq('booking_date', targetDateStr)
      .eq('status', 'confirmed');

    if (dbError) throw dbError;

    let dayHours = 0;
    let nightHours = 0;
    const bookingIds: string[] = [];

    (bookings || []).forEach(b => {
      bookingIds.push(b.id);
      const slotStr = String(b.time_slot || "");
      // Time slots can be comma separated e.g. "08:00 - 09:00, 09:00 - 10:00"
      const slots = slotStr.split(",").map(s => s.trim()).filter(Boolean);

      slots.forEach(slot => {
        const startPart = slot.split("-")[0] || "";
        const hour = parseInt(startPart.split(":")[0], 10);
        if (!isNaN(hour)) {
          if (hour >= 8 && hour < 16) {
            dayHours += 1;
          } else if (hour >= 16 && hour < 23) {
            nightHours += 1;
          }
        }
      });
    });

    const dayAmount = dayHours * 250;
    const nightAmount = nightHours * 350;
    const totalHours = dayHours + nightHours;
    const totalAmount = dayAmount + nightAmount;
    const totalAmountText = thaiBahtText(totalAmount);

    // Document Number: YYYYMMDD
    const invoiceNo = targetDateStr.replace(/-/g, "");
    const thaiDate = formatThaiDate(targetDateStr);

    const htmlContent = renderInvoiceHtml({
      invoiceNo,
      thaiDate,
      dayHours,
      dayAmount,
      nightHours,
      nightAmount,
      totalHours,
      totalAmount,
      totalAmountText
    });

    // Save to daily_invoices table in Supabase
    const { error: upsertError } = await supabase
      .from('daily_invoices')
      .upsert({
        invoice_date: targetDateStr,
        invoice_no: invoiceNo,
        day_hours: dayHours,
        day_rate: 250,
        day_amount: dayAmount,
        night_hours: nightHours,
        night_rate: 350,
        night_amount: nightAmount,
        total_hours: totalHours,
        total_amount: totalAmount,
        total_amount_text: totalAmountText,
        html_content: htmlContent,
        booking_ids: bookingIds,
        updated_at: new Date().toISOString()
      }, { onConflict: 'invoice_date' });

    if (upsertError) {
      console.error("Failed to upsert daily_invoices:", upsertError);
    }

    // Optional: Send LINE Notification to Admin if configured
    if (notifyLine && LINE_CHANNEL_ACCESS_TOKEN && LINE_ADMIN_USER_ID) {
      try {
        const lineMsg = {
          to: LINE_ADMIN_USER_ID,
          messages: [{
            type: "flex",
            altText: `📄 สรุปใบแจ้งหนี้รายได้สนาม วันที่ ${thaiDate} (${invoiceNo})`,
            contents: {
              type: "bubble",
              header: {
                type: "box",
                layout: "vertical",
                backgroundColor: "#0F172A",
                contents: [
                  { type: "text", text: "THE GRAND SLAM SERVICES", color: "#F59E0B", size: "xs", weight: "bold" },
                  { type: "text", text: "สรุปใบแจ้งหนี้รายได้ประจำวัน", color: "#FFFFFF", size: "lg", weight: "bold", margin: "xs" },
                  { type: "text", text: `เลขที่: ${invoiceNo}`, color: "#94A3B8", size: "xs" }
                ]
              },
              body: {
                type: "box",
                layout: "vertical",
                contents: [
                  {
                    type: "box",
                    layout: "horizontal",
                    contents: [
                      { type: "text", text: "วันที่บริการ", color: "#64748B", size: "sm" },
                      { type: "text", text: thaiDate, color: "#1E293B", size: "sm", weight: "bold", align: "end" }
                    ]
                  },
                  {
                    type: "box",
                    layout: "horizontal",
                    margin: "md",
                    contents: [
                      { type: "text", text: "ช่วง 08.00-16.00", color: "#64748B", size: "sm" },
                      { type: "text", text: `${dayHours} ชม. (${formatCurrency(dayAmount)} บ.)`, color: "#1E293B", size: "sm", align: "end" }
                    ]
                  },
                  {
                    type: "box",
                    layout: "horizontal",
                    margin: "sm",
                    contents: [
                      { type: "text", text: "ช่วง 16.00-23.00", color: "#64748B", size: "sm" },
                      { type: "text", text: `${nightHours} ชม. (${formatCurrency(nightAmount)} บ.)`, color: "#1E293B", size: "sm", align: "end" }
                    ]
                  },
                  { type: "separator", margin: "md" },
                  {
                    type: "box",
                    layout: "horizontal",
                    margin: "md",
                    contents: [
                      { type: "text", text: "ยอดรวมทั้งหมด", color: "#0F172A", size: "md", weight: "bold" },
                      { type: "text", text: `${formatCurrency(totalAmount)} บ.`, color: "#059669", size: "lg", weight: "bold", align: "end" }
                    ]
                  }
                ]
              }
            }
          }]
        };

        await fetch("https://api.line.me/v2/bot/message/push", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
          },
          body: JSON.stringify(lineMsg)
        });
      } catch (lineErr) {
        console.error("LINE push notification error:", lineErr);
      }
    }

    // If requested as HTML view, stream the rendered invoice directly
    if (isViewHtml) {
      return new Response(htmlContent, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // Otherwise return JSON API response
    return new Response(JSON.stringify({
      success: true,
      data: {
        invoice_date: targetDateStr,
        invoice_no: invoiceNo,
        thai_date: thaiDate,
        day_hours: dayHours,
        day_rate: 250,
        day_amount: dayAmount,
        night_hours: nightHours,
        night_rate: 350,
        night_amount: nightAmount,
        total_hours: totalHours,
        total_amount: totalAmount,
        total_amount_text: totalAmountText,
        bookings_count: bookings?.length || 0,
        saved_to_db: !upsertError
      }
    }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });

  } catch (error) {
    console.error("Error generating daily invoice:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || String(error)
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
});
