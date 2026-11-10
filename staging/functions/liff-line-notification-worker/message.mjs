export function formatBookingConfirmedMessage(payload) {
 if (!payload || payload.kind !== "booking_confirmed" || payload.booking_status !== "confirmed")
   throw new Error("INVALID_BOOKING_EVENT");
 if (typeof payload.invoice_no !== "string" ||
     !/^\d{4}-\d{2}-\d{2}$/.test(payload.booking_date) ||
     !Array.isArray(payload.slots) || payload.slots.length < 1 ||
     !Number.isFinite(Number(payload.amount))) throw new Error("INVALID_BOOKING_DETAILS");
 const slots=payload.slots.map(x=>String(x).slice(0,20)).join(", ");
 return ["🎾 THE GRAND SLAM","✅ Booking Confirmed",
         "เลขที่จอง: "+payload.invoice_no,
         "วันที่: "+payload.booking_date,
         "เวลา: "+slots,
         "ยอดค่าบริการ: "+Number(payload.amount).toLocaleString("th-TH")+" บาท",
         "สถานะการจอง: ยืนยันแล้ว",
         "สถานะชำระเงิน: รอตรวจสอบยอดโอน",
         "ขอบคุณที่ใช้บริการ The Grand Slam"].join("\n");
}
