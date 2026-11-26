// ==========================================
// CONFIGURATION (ตั้งค่าการเชื่อมต่อ)
// ==========================================
function getCleanScriptProperty(key) {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(key) || "";
    return String(raw).trim().replace(/^['"]+|['"]+$/g, "").trim();
  } catch(e) {
    return "";
  }
}

// โหลดรหัสผ่าน Script Properties สำหรับ LINE และ Calendar
const LINE_CHANNEL_ACCESS_TOKEN = getCleanScriptProperty("LINE_CHANNEL_ACCESS_TOKEN");
const ADMIN_LINE_USER_ID = getCleanScriptProperty("ADMIN_LINE_USER_ID");
const COACH_CALENDAR_ID = getCleanScriptProperty("COACH_CALENDAR_ID");
const WEBHOOK_SECRET = getCleanScriptProperty("WEBHOOK_SECRET") || "GrandSlam@2026!SecureKey";
const MAIN_CALENDAR_ID = getCleanScriptProperty("MAIN_CALENDAR_ID");
const OFF_PEAK_PRICE = parseFloat(getCleanScriptProperty("OFF_PEAK_PRICE") || "250");
const PEAK_PRICE = parseFloat(getCleanScriptProperty("PEAK_PRICE") || "350");
const VALID_COURTS = ["Main Court"];

function getNormalizedBookingKey(dateStr, courtStr, slotStr) {
  return [
    String(dateStr || "").trim(),
    String(courtStr || "").trim().toUpperCase(),
    String(slotStr || "").trim()
  ].join("_");
}

function checkAndSaveNonce(nonce) {
  if (!nonce) return false;
  const cleanNonce = String(nonce).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!cleanNonce) return false;
  
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let nonceSheet = spreadsheet.getSheetByName("Nonces");
  if (!nonceSheet) {
    nonceSheet = spreadsheet.insertSheet("Nonces");
    nonceSheet.getRange(1, 1, 1, 2).setValues([["Nonce", "Timestamp"]]);
  }
  
  const lastRow = nonceSheet.getLastRow();
  const now = Date.now();
  
  if (lastRow > 1) {
    const values = nonceSheet.getRange(2, 1, lastRow - 1, 2).getValues();
    const rowsToKeep = [];
    let hasOldNonces = false;
    for (let i = 0; i < values.length; i++) {
      const nonceTime = new Date(values[i][1]).getTime();
      if (now - nonceTime <= 10 * 60 * 1000) {
        rowsToKeep.push(values[i]);
      } else {
        hasOldNonces = true;
      }
    }
    
    if (hasOldNonces) {
      nonceSheet.deleteRows(2, lastRow - 1);
      if (rowsToKeep.length > 0) {
        nonceSheet.getRange(2, 1, rowsToKeep.length, 2).setValues(rowsToKeep);
      }
    }
  }
  
  const freshLastRow = nonceSheet.getLastRow();
  if (freshLastRow > 1) {
    const nonces = nonceSheet.getRange(2, 1, freshLastRow - 1, 1).getValues().map(function(r) { return String(r[0]); });
    if (nonces.indexOf(cleanNonce) !== -1) {
      return false;
    }
  }
  
  nonceSheet.appendRow([cleanNonce, new Date()]);
  return true;
}

// ==========================================
// CORE WEB APP GATEWAY (doPost / doGet)
// ==========================================
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "No post data received" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const rawContent = e.postData.contents;
    const data = JSON.parse(rawContent);

    // ========================================================
    // 🎾 LINE AI CHATBOT WEBHOOK DISPATCH
    // ========================================================
    if (data.events && Array.isArray(data.events)) {
      return handleLineAiWebhook(data);
    }
    // ========================================================

    const action = data.action || (e.parameter && e.parameter.action) || "sendConfirmation";

    // 1. Input Validation
    const valError = validateInput(data);
    if (valError) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Validation failed: " + valError }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 2. Dispatch Actions
    if (action === "sendConfirmation") {
      return handleSendConfirmation(data);
    } else if (action === "cancelBooking") {
      return handleCancelBooking(data);
    } else if (action === "updateNotes") {
      return handleUpdateNotes(data);
    } else if (action === "backup") {
      return handleBackup(data);
    } else if (action === "logAdminAction") {
      return handleLogAdminAction(data);
    } else if (action === "getAdminLogs") {
      return handleGetAdminLogs(data);
    } else {
      return handleBackup(data);
    }
  } catch (error) {
    logError("Runtime doPost Error", "doPost", error.toString(), "CRITICAL");
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    const action = e.parameter ? e.parameter.action : "";
    if (action === "getExistingBookings") {
      return handleGetExistingBookings();
    }
    if (action === "testSlipAi") {
      const testUrl = (e.parameter && e.parameter.url) ? e.parameter.url : "https://eqwmodrhorcbwsshbepg.supabase.co/storage/v1/object/public/slips/R.202611263_1795264424968.jpg";
      const testFee = (e.parameter && e.parameter.fee) ? parseFloat(e.parameter.fee) : 1.00;
      const geminiKey = getCleanScriptProperty("GEMINI_API_KEY") || getCleanScriptProperty("GEMINI_KEY") || getCleanScriptProperty("GOOGLE_API_KEY");
      const iappKey = getCleanScriptProperty("IAPP_API_KEY") || getCleanScriptProperty("OPENTHAI_API_KEY") || "iapp_live_56a8f920aa8e17eb6c0f861b89042ec2d9c6f1446315eac3c0ea29e3852c94a1";
      const analysis = analyzePaymentSlip(testUrl, testFee, null);
      return ContentService.createTextOutput(JSON.stringify({
        status: "test_completed",
        hasGeminiKey: !!geminiKey,
        hasIappKey: !!iappKey,
        testUrl: testUrl,
        analysis: analysis
      }, null, 2)).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify({ 
      status: "online", 
      message: "Grand Slam Booking System API is active.",
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ==========================================
// INPUT VALIDATION
// ==========================================
function validateInput(data) {
  if (!data || typeof data !== "object") return "Invalid payload format.";
  if (!data.action) data.action = "sendConfirmation";

  if (data.action === "sendConfirmation" || data.action === "cancelBooking" || data.action === "updateNotes") {
    if (!data.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(data.date).trim())) {
      return "Invalid date format (expected YYYY-MM-DD).";
    }
  }

  if (data.action === "sendConfirmation") {
    if (!data.name || String(data.name).trim().length === 0) return "Name is required.";
    if (!data.phone || String(data.phone).trim().length === 0) return "Phone number is required.";
    
    const slots = data.slots || data.timeSlots;
    if (!slots || !Array.isArray(slots) || slots.length === 0) return "At least one time slot is required.";
    if (data.court && VALID_COURTS.indexOf(data.court) === -1) {
      return "Invalid court selection: " + data.court;
    }

    for (let i = 0; i < slots.length; i++) {
      if (!isValidTimeSlot(slots[i])) {
        return "Invalid time slot values: " + slots[i];
      }
    }
  }

  if (data.action === "cancelBooking") {
    if (!data.slot || !isValidTimeSlot(data.slot)) {
      return "Invalid time slot format: " + data.slot;
    }
  }

  return null;
}

function isValidTimeSlot(slotStr) {
  if (typeof slotStr !== 'string') return false;
  var pattern = /^\d{2}:\d{2}\s*-\s*\d{2}:\d{2}$/;
  return pattern.test(slotStr.trim());
}

// ==========================================
// BOOKING CONFIRMATION & CALENDAR SYNC
// ==========================================
function handleSendConfirmation(data) {
  const name = String(data.name || "").trim();
  const phone = String(data.phone || "").trim();
  const email = String(data.email || "").trim();
  const dateStr = String(data.date || "").trim();
  const rawSlots = data.slots || data.timeSlots || [];
  const invoiceNo = data.invoiceNo || "";
  const receiptNo = data.receiptNo || ("REC-" + dateStr.replace(/-/g, "") + "-" + Date.now().toString().slice(-4));
  const lineUserId = String(data.lineUserId || "").trim();
  const requireCoach = (data.requireCoach === true || String(data.requireCoach).toLowerCase() === "true" || String(data.requireCoach).toLowerCase() === "yes");
  const bookingKey = data.bookingKey || "";
  const court = String(data.court || "Main Court").trim();

  const formattedDate = formatDateString(dateStr);
  const warnings = [];

  const uniqueSlots = [];
  const slotSeen = {};
  rawSlots.forEach(function(slot) {
    const s = String(slot).trim();
    if (s && !slotSeen[s]) {
      slotSeen[s] = true;
      uniqueSlots.push(s);
    }
  });

  if (uniqueSlots.length === 0) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "No unique time slots provided." }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    logError("Lock Timeout Error", "handleSendConfirmation", "Could not acquire lock for sheet write.", "CRITICAL");
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Server busy. Please try again later." }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  let bookingSheet;
  let lastRow = 0;
  let uuids = [];
  let indexMap;

  // คำนวณยอดเงินรวมสำหรับการจองนี้
  let totalExpectedFee = 0;
  uniqueSlots.forEach(function(slot) {
    totalExpectedFee += getSlotFee(slot);
  });

  // ผลการวิเคราะห์สลิป (เริ่มต้นสถานะปลอดภัย)
  let slipAnalysis = {
    bank: "-",
    senderName: "-",
    amount: 0,
    refNo: "-",
    transferTime: "-",
    status: (data.slipUrl ? "รอตรวจสอบ" : "ไม่มีสลิป"),
    amountMatch: false,
    isDuplicate: false
  };

  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    bookingSheet = spreadsheet.getSheetByName("Bookings");
    const headers = [
      "ID", "Date", "Time Slot", "Customer", "Phone", "Email", 
      "Court", "Require Coach", "Fee", "Invoice No", "Receipt No", 
      "Slip URL", "LINE User ID", "Car Plate", "Reminder Sent", 
      "Admin Notes", "Calendar Event ID", "Created At",
      "Bank", "Sender Name", "Slip Amount", "Ref No", "Transfer Time", "Slip Status"
    ];
    if (!bookingSheet) {
      bookingSheet = spreadsheet.insertSheet("Bookings");
      bookingSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    } else {
      const lastCol = bookingSheet.getLastColumn();
      if (lastCol < headers.length) {
        bookingSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      }
    }

    indexMap = getBookingsIndexMap(bookingSheet);

    if (bookingKey) {
      let allExist = true;
      for (let i = 0; i < uniqueSlots.length; i++) {
        const expectedId = generateSlotId(bookingKey, dateStr, court, uniqueSlots[i]);
        if (!indexMap.uuidRowMap[expectedId]) {
          allExist = false;
          break;
        }
      }
      if (allExist) {
        throw new Error("IDEMPOTENT_SUCCESS");
      }
    }

    const duplicates = [];
    uniqueSlots.forEach(function(slot) {
      if (isBookingDuplicate(indexMap, dateStr, court, slot)) {
        duplicates.push(slot);
      }
    });

    if (duplicates.length > 0) {
      throw new Error("DUPLICATE_BOOKINGS:" + duplicates.join(", "));
    }

    // 🤖 สั่งการ AI ตรวจสอบและดึงข้อมูลจากสลิปโอนเงิน (Gemini Vision AI)
    if (data.slipUrl) {
      try {
        slipAnalysis = analyzePaymentSlip(data.slipUrl, totalExpectedFee, bookingSheet);
      } catch (slipErr) {
        logError("Slip Analysis Failure", "handleSendConfirmation", slipErr.toString(), "WARNING");
      }
    }

    const newRows = [];
    const createdAtStr = Utilities.formatDate(new Date(), bookingSheet.getParent().getSpreadsheetTimeZone() || "GMT+7", "yyyy-MM-dd HH:mm:ss");
    uniqueSlots.forEach(function(slot) {
      const uuid = bookingKey ? generateSlotId(bookingKey, dateStr, court, slot) : Utilities.getUuid();
      uuids.push(uuid);
      const fee = getSlotFee(slot);

      newRows.push([
        uuid,
        dateStr,
        slot,
        name,
        phone,
        email,
        court,
        requireCoach ? "Yes" : "No",
        fee,
        invoiceNo,
        receiptNo,
        data.slipUrl || "",
        lineUserId,
        data.lineIdInput || "",
        "No",
        "",
        "PENDING",
        createdAtStr,
        slipAnalysis.bank || "-",
        slipAnalysis.senderName || "-",
        slipAnalysis.amount || 0,
        slipAnalysis.refNo || "-",
        slipAnalysis.transferTime || "-",
        slipAnalysis.status || "-"
      ]);
    });

    lastRow = bookingSheet.getLastRow();
    bookingSheet.getRange(lastRow + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
  } catch (e) {
    if (e.message === "IDEMPOTENT_SUCCESS") {
      return ContentService.createTextOutput(JSON.stringify({ 
        status: "success", 
        message: "Idempotent request already processed." 
      })).setMimeType(ContentService.MimeType.JSON);
    }
    if (e.message.indexOf("DUPLICATE_BOOKINGS:") === 0) {
      const dups = e.message.substring("DUPLICATE_BOOKINGS:".length);
      return ContentService.createTextOutput(JSON.stringify({ 
        status: "error", 
        message: "Time slots already booked: " + dups 
      })).setMimeType(ContentService.MimeType.JSON);
    }
    logError("Sheet Batch Write Error", "handleSendConfirmation", e.toString(), "CRITICAL");
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Failed to save booking to Sheets: " + e.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    try {
      lock.releaseLock();
    } catch(err) {}
  }

  // Create Calendar Events
  let calendarEventIds = [];
  try {
    calendarEventIds = createGoogleCalendarEvents(name, phone, dateStr, uniqueSlots, receiptNo, requireCoach, court);
    const calendarValues = calendarEventIds.map(function(id) { return [id]; });
    bookingSheet.getRange(lastRow + 1, 17, calendarValues.length, 1).setValues(calendarValues);
  } catch (e) {
    logError("Calendar Creation Failure", "handleSendConfirmation", e.toString(), "WARNING");
    warnings.push("Calendar creation error: " + e.toString());
  }

  // Send Email
  let emailSent = false;
  if (email) {
    try {
      sendEmailConfirmation(email, name, formattedDate, uniqueSlots, receiptNo, requireCoach, court);
      emailSent = true;
    } catch (e) {
      logError("Email Notification Error", "sendEmailConfirmation", e.toString(), "WARNING");
      warnings.push("Email failed: " + e.toString());
    }
  }

  // Determine LINE Target ID
  let targetLineUserId = lineUserId;
  if (!targetLineUserId && data.lineIdInput && data.lineIdInput.indexOf("U") === 0 && data.lineIdInput.length >= 25) {
    targetLineUserId = data.lineIdInput;
  }

  // Send Customer LINE Notification
  let lineSent = false;
  if (targetLineUserId && LINE_CHANNEL_ACCESS_TOKEN) {
    try {
      sendLineMessageConfirmation(targetLineUserId, name, formattedDate, uniqueSlots, receiptNo, requireCoach);
      lineSent = true;
    } catch (e) {
      logError("LINE User Notification Error", "sendLineMessageConfirmation", e.toString(), "WARNING");
      warnings.push("LINE user push failed: " + e.toString());
    }
  }

  // Send Admin LINE Notification
  let adminLineSent = false;
  if (ADMIN_LINE_USER_ID && LINE_CHANNEL_ACCESS_TOKEN) {
    try {
      const slipUrl = data.slipUrl || "";
      sendAdminSlipNotification(name, phone, formattedDate, uniqueSlots, receiptNo, slipUrl, requireCoach, slipAnalysis);
      adminLineSent = true;
    } catch (e) {
      logError("Admin LINE Notification Error", "sendAdminSlipNotification", e.toString(), "WARNING");
      warnings.push("Admin LINE alert failed: " + e.toString());
    }
  }

  return ContentService.createTextOutput(JSON.stringify({
    status: warnings.length === 0 ? "success" : "warning",
    message: "Booking confirmation processed successfully",
    receiptNo: receiptNo,
    emailSent: emailSent,
    lineSent: lineSent,
    adminLineSent: adminLineSent,
    warnings: warnings
  })).setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// NOTIFICATIONS (LINE & EMAIL)
// ==========================================
function sendLineMessageConfirmation(lineUserId, name, dateStr, slots, receiptNo, requireCoach) {
  if (!LINE_CHANNEL_ACCESS_TOKEN || !lineUserId) return;
  if (lineUserId.indexOf("U") !== 0 || lineUserId.length < 25) return;

  try {
    const url = "https://api.line.me/v2/bot/message/push";
    const slotsText = Array.isArray(slots) ? slots.join(", ") : String(slots || "");
    const coachText = requireCoach ? "ต้องการโค้ช 🟢" : "ไม่ต้องการโค้ช ❌";

    const payload = {
      to: lineUserId,
      messages: [
        {
          type: "flex",
          altText: "ยืนยันการจองสนามสำเร็จ - ใบเสร็จ " + receiptNo,
          contents: {
            type: "bubble",
            header: {
              type: "box",
              layout: "vertical",
              backgroundColor: "#06C755",
              contents: [
                {
                  type: "text",
                  text: "BOOKING CONFIRMED",
                  weight: "bold",
                  color: "#FFFFFF",
                  size: "xs"
                },
                {
                  type: "text",
                  text: "ยืนยันการจองสนามสำเร็จ",
                  weight: "bold",
                  color: "#FFFFFF",
                  size: "lg",
                  margin: "xs"
                }
              ]
            },
            body: {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "box",
                  layout: "vertical",
                  margin: "md",
                  spacing: "sm",
                  contents: [
                    {
                      type: "box",
                      layout: "baseline",
                      contents: [
                        { type: "text", text: "ชื่อผู้จอง", color: "#000000", size: "md", flex: 2 },
                        { type: "text", text: String(name || "-"), color: "#000000", size: "md", flex: 4 }
                      ]
                    },
                    {
                      type: "box",
                      layout: "baseline",
                      contents: [
                        { type: "text", text: "วันที่", color: "#000000", size: "md", flex: 2 },
                        { type: "text", text: String(dateStr || "-"), color: "#000000", size: "md", flex: 4 }
                      ]
                    },
                    {
                      type: "box",
                      layout: "baseline",
                      contents: [
                        { type: "text", text: "เวลาจอง", color: "#000000", size: "md", flex: 2 },
                        { type: "text", text: String(slotsText || "-"), color: "#000000", size: "md", flex: 4, wrap: true }
                      ]
                    },
                    {
                      type: "box",
                      layout: "baseline",
                      contents: [
                        { type: "text", text: "โค้ช", color: "#000000", size: "md", flex: 2 },
                        { type: "text", text: coachText, color: "#000000", size: "md", flex: 4 }
                      ]
                    },
                    {
                      type: "box",
                      layout: "baseline",
                      contents: [
                        { type: "text", text: "เลขใบเสร็จ", color: "#000000", size: "md", flex: 2 },
                        { type: "text", text: String(receiptNo || "-"), color: "#000000", size: "md", flex: 4 }
                      ]
                    },
                    {
                      type: "separator",
                      margin: "lg"
                    },
                    {
                      type: "box",
                      layout: "vertical",
                      margin: "md",
                      contents: [
                        {
                          type: "text",
                          text: "ต้องการเลื่อนกรุณาแจ้งล่วงหน้า 2วัน",
                          color: "#D97706",
                          size: "sm",
                          wrap: true,
                          align: "center",
                          weight: "bold"
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          }
        }
      ]
    };

    UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: {
        "Authorization": "Bearer " + LINE_CHANNEL_ACCESS_TOKEN
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (e) {
    console.error("sendLineMessageConfirmation Error: " + e.toString());
  }
}

function checkAndSendReminders() {
  return send24HourLineReminders();
}

function send24HourLineReminders(targetDateStr) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName("Bookings");
  if (!sheet || sheet.getLastRow() <= 1) return 0;

  let tomorrowStr = targetDateStr;
  if (!tomorrowStr) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrowStr = Utilities.formatDate(tomorrow, Session.getScriptTimeZone() || "GMT+7", "yyyy-MM-dd");
  }

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 18).getValues();
  let count = 0;

  for (let i = 0; i < data.length; i++) {
    let rowDateStr = (data[i][1] instanceof Date) ? Utilities.formatDate(data[i][1], Session.getScriptTimeZone() || "GMT+7", "yyyy-MM-dd") : String(data[i][1] || "").trim();
    if (rowDateStr === tomorrowStr) {
      // 1. Check if reminder has already been sent for this slot
      const alreadySent = String(data[i][14] || "").trim().toLowerCase() === "yes";
      if (alreadySent) continue;

      const name = String(data[i][3] || "").trim();
      const slot = String(data[i][2] || "").trim();
      const court = String(data[i][6] || "Main Court").trim();
      let lineUserId = String(data[i][12] || "").trim();
      if (!lineUserId || lineUserId.indexOf("U") !== 0) {
        lineUserId = String(data[i][13] || "").trim();
      }
      const requireCoach = (String(data[i][7]).toLowerCase() === "yes" || data[i][7] === true);
      const receiptNo = String(data[i][10] || "").trim();

      if (lineUserId && lineUserId.indexOf("U") === 0 && lineUserId.length >= 25) {
        const sentSuccess = sendLineMessageReminder(lineUserId, name, formatDateString(rowDateStr), [slot], receiptNo, requireCoach, court);
        if (sentSuccess) {
          // 2. Mark "Reminder Sent" as "Yes" in Column 15 (Row i+2)
          sheet.getRange(i + 2, 15).setValue("Yes");
          count++;
        }
      }
    }
  }
  return count;
}

function sendLineMessageReminder(lineUserId, name, dateStr, slots, receiptNo, requireCoach, courtStr) {
  if (!LINE_CHANNEL_ACCESS_TOKEN || !lineUserId) return false;
  if (lineUserId.indexOf("U") !== 0 || lineUserId.length < 25) return false;

  try {
    const url = "https://api.line.me/v2/bot/message/push";
    const slotsText = Array.isArray(slots) ? slots.join(", ") : String(slots || "");
    const coachText = requireCoach ? "ต้องการโค้ช 🟢" : "ไม่ต้องการโค้ช ❌";
    const activeCourt = courtStr || "Main Court";

    const payload = {
      to: lineUserId,
      messages: [
        {
          type: "flex",
          altText: "🎾 แจ้งเตือนนัดหมายสนามเทนนิสพรุ่งนี้ - " + name,
          contents: {
            type: "bubble",
            header: {
              type: "box",
              layout: "vertical",
              backgroundColor: "#F59E0B",
              contents: [
                {
                  type: "text",
                  text: " REMINDER",
                  weight: "bold",
                  color: "#FFFFFF",
                  size: "xs"
                },
                {
                  type: "text",
                  text: "แจ้งเตือนนัดหมาย ",
                  weight: "bold",
                  color: "#FFFFFF",
                  size: "lg",
                  margin: "xs"
                }
              ]
            },
            body: {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "box",
                  layout: "vertical",
                  margin: "md",
                  spacing: "sm",
                  contents: [
                    {
                      type: "box",
                      layout: "baseline",
                      contents: [
                        { type: "text", text: "วันที่", color: "#555555", size: "md", flex: 2 },
                        { type: "text", text: String(dateStr || "-"), color: "#000000", size: "md", flex: 4, weight: "bold" }
                      ]
                    },
                    {
                      type: "box",
                      layout: "baseline",
                      contents: [
                        { type: "text", text: "เวลา", color: "#555555", size: "md", flex: 2 },
                        { type: "text", text: String(slotsText || "-"), color: "#000000", size: "md", flex: 4, weight: "bold", wrap: true }
                      ]
                    },
                    {
                      type: "box",
                      layout: "baseline",
                      contents: [
                        { type: "text", text: "สนาม", color: "#555555", size: "md", flex: 2 },
                        { type: "text", text: String(activeCourt), color: "#000000", size: "md", flex: 4 }
                      ]
                    }
                  ]
                }
              ]
            },
            footer: {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "text",
                  text: "🎾เตรียมตัวให้พร้อมแล้วเจอกันครับ🎾",
                  color: "#D97706",
                  size: "sm",
                  align: "center",
                  weight: "bold"
                }
              ]
            }
          }
        }
      ]
    };

    const response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: {
        "Authorization": "Bearer " + LINE_CHANNEL_ACCESS_TOKEN
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const code = response.getResponseCode();
    return (code >= 200 && code < 300);
  } catch (e) {
    console.error("sendLineMessageReminder Error: " + e.toString());
    return false;
  }
}

// ==========================================
// 🤖 HYBRID AI SLIP VERIFICATION & EXTRACTION
// Primary: OpenThai 2.1 OCR (iApp Technology) - รวดเร็ว (~0.4 วินาที) และแม่นยำสูงกับฟอนต์สลิปธนาคารไทย
// Fallback: Google Gemini Vision AI - สลับทำงานอัตโนมัติหาก OpenThai เกิดข้อผิดพลาด
// ==========================================

/**
 * ฟังก์ชันหลักในการตรวจสอบสลิปโอนเงิน (ระบบ Hybrid)
 * ลำดับ:
 * 1. ดาวน์โหลดไฟล์ภาพสลิปจาก Supabase Storage
 * 2. ทดลองอ่านข้อมูลด้วย OpenThai 2.1 OCR (iApp API)
 * 3. หาก OpenThai ไม่สำเร็จ/อ่านไม่ออก จะสลับมาใช้ Google Gemini Vision AI (Fallback) ทันที
 * 4. ตรวจสอบความถูกต้องของยอดเงินเทียบกับยอดที่ต้องชำระ (expectedFee)
 * 5. ตรวจสอบหมายเลขอ้างอิงสลิปซ้ำ (Duplicate Detection) ใน Google Sheets
 */
function analyzePaymentSlip(slipUrl, expectedFee, bookingSheet) {
  const result = {
    bank: "-",
    senderName: "-",
    amount: 0,
    refNo: "-",
    transferTime: "-",
    status: "รอตรวจสอบ (ไม่มีสลิป)",
    amountMatch: false,
    isDuplicate: false,
    engine: "-",
    debugInfo: ""
  };

  if (!slipUrl || typeof slipUrl !== "string" || slipUrl.indexOf("http") !== 0) {
    return result;
  }

  // 1. ดาวน์โหลดภาพสลิป
  let imageBlob = null;
  try {
    const response = UrlFetchApp.fetch(slipUrl, {
      method: "get",
      muteHttpExceptions: true
    });

    const resCode = response.getResponseCode();
    if (resCode !== 200) {
      result.status = "❌ ดาวน์โหลดสลิปไม่สำเร็จ (HTTP " + resCode + ")";
      result.debugInfo = "HTTP " + resCode + " for URL: " + slipUrl;
      logError("Slip Download Failed", "analyzePaymentSlip", result.debugInfo, "ERROR");
      return result;
    }

    imageBlob = response.getBlob();
  } catch (dlErr) {
    result.status = "❌ ไม่สามารถเข้าถึงไฟล์ภาพสลิป";
    result.debugInfo = dlErr.toString();
    logError("Slip Fetch Exception", "analyzePaymentSlip", dlErr.toString(), "ERROR");
    return result;
  }

  // 2. Engine 1: OpenThai 2.1 OCR (iApp Technology)
  try {
    const openThaiResult = analyzeSlipWithOpenThai(imageBlob, expectedFee, bookingSheet);
    if (openThaiResult && (openThaiResult.amount > 0 || (openThaiResult.refNo && openThaiResult.refNo !== "-"))) {
      openThaiResult.engine = "OpenThai 2.1 OCR";
      return openThaiResult;
    }
    if (openThaiResult && openThaiResult.debugInfo) {
      result.debugInfo = "OpenThai: " + openThaiResult.debugInfo + " | ";
    }
  } catch (otErr) {
    logError("OpenThai OCR Error", "analyzePaymentSlip", otErr.toString(), "WARNING");
    result.debugInfo = "OpenThai Exception: " + otErr.toString() + " | ";
  }

  // 3. Engine 2 (Fallback): Google Gemini Vision AI
  try {
    const geminiResult = analyzeSlipWithGemini(imageBlob, expectedFee, bookingSheet);
    if (geminiResult && (geminiResult.amount > 0 || (geminiResult.refNo && geminiResult.refNo !== "-"))) {
      geminiResult.engine = "Gemini Vision AI";
      if (result.debugInfo) {
        geminiResult.debugInfo = (result.debugInfo + (geminiResult.debugInfo || "")).substring(0, 250);
      }
      return geminiResult;
    }
    if (geminiResult) {
      geminiResult.engine = "Gemini Vision AI (Fallback)";
      return geminiResult;
    }
  } catch (gemErr) {
    logError("Gemini Vision Error", "analyzePaymentSlip", gemErr.toString(), "WARNING");
    result.status = "❌ AI ทั้งสองระบบขัดข้อง";
    result.debugInfo = (result.debugInfo + "Gemini Exception: " + gemErr.toString()).substring(0, 250);
  }

  result.status = "❌ ไม่สามารถอ่านข้อมูลจากสลิปได้";
  return result;
}

/**
 * Engine 1: OpenThai 2.1 OCR (iApp Technology)
 * ส่งไฟล์รูปภาพสลิปไปที่ https://api.iapp.co.th/v3/store/ocr/document/markdown
 */
function analyzeSlipWithOpenThai(imageBlob, expectedFee, bookingSheet) {
  const result = {
    bank: "-",
    senderName: "-",
    amount: 0,
    refNo: "-",
    transferTime: "-",
    status: "รอตรวจสอบ",
    amountMatch: false,
    isDuplicate: false,
    engine: "OpenThai 2.1 OCR",
    debugInfo: ""
  };

  const iappKey = getCleanScriptProperty("IAPP_API_KEY") || 
                  getCleanScriptProperty("OPENTHAI_API_KEY") || 
                  "iapp_live_56a8f920aa8e17eb6c0f861b89042ec2d9c6f1446315eac3c0ea29e3852c94a1";

  if (!iappKey) {
    result.debugInfo = "Missing IAPP_API_KEY";
    return null;
  }

  try {
    const apiUrl = "https://api.iapp.co.th/v3/store/ocr/document/markdown";
    const payload = {
      "file": imageBlob
    };

    const res = UrlFetchApp.fetch(apiUrl, {
      method: "post",
      headers: {
        "apikey": iappKey
      },
      payload: payload,
      muteHttpExceptions: true
    });

    const resCode = res.getResponseCode();
    const resText = res.getContentText();

    if (resCode !== 200) {
      result.debugInfo = "HTTP " + resCode + ": " + resText.substring(0, 150);
      logError("OpenThai HTTP Error", "analyzeSlipWithOpenThai", result.debugInfo, "WARNING");
      return null;
    }

    const resJson = JSON.parse(resText);
    let mdText = "";
    if (resJson.data && resJson.data.markdown) {
      mdText = resJson.data.markdown;
    } else if (resJson.markdown) {
      mdText = resJson.markdown;
    } else if (typeof resJson.data === "string") {
      mdText = resJson.data;
    }

    if (!mdText) {
      result.debugInfo = "Empty markdown returned from OpenThai";
      return null;
    }

    // สกัดข้อมูลจาก Markdown
    const parsed = parseSlipMarkdown(mdText);
    result.bank = parsed.bank;
    result.senderName = parsed.senderName;
    result.amount = parsed.amount;
    result.refNo = parsed.refNo;
    result.transferTime = parsed.transferTime;
    result.debugInfo = "OpenThai v2.1 success (" + (resJson.data && resJson.data.time ? resJson.data.time + "s" : "ok") + ")";

    // ตรวจสอบยอดเงิน และสลิปซ้ำ
    validateSlipAmount(result, expectedFee);
    checkDuplicateSlipRef(result, bookingSheet);

    return result;

  } catch (err) {
    result.debugInfo = err.toString();
    logError("OpenThai Exception", "analyzeSlipWithOpenThai", err.toString(), "WARNING");
    return null;
  }
}

/**
 * ฟังก์ชันแยกข้อความและโครงสร้างจากผลลัพธ์ Markdown ของ OpenThai 2.1 OCR
 * ปรับปรุงระบบตรวจจับ: ยอดเงิน (จำนวน/Amount), รหัสอ้างอิง (Ref No/Ref ID), วันที่ทำรายการ, และผู้โอน (จาก/From)
 * รองรับสลิปทุกธนาคาร (BBL, SCB, KTB, KBANK, BAY/Kept, ttb, GSB, ฯลฯ)
 */
function parseSlipMarkdown(mdText) {
  const info = {
    bank: "-",
    senderName: "-",
    amount: 0,
    refNo: "-",
    transferTime: "-"
  };

  if (!mdText || typeof mdText !== "string") return info;

  // 0. ลบเครื่องหมายตกแต่ง Markdown (*, _, `, ~, #) และตาราง (|) เพื่อป้องกันปัญหาจับคำค้นไม่ติด
  const cleanMd = mdText
    .replace(/[*_`~#]/g, " ")
    .replace(/\|/g, " ")
    .replace(/\t/g, " ");

  const rawLines = cleanMd.split(/\r?\n/)
    .map(function(l) { return l.trim(); })
    .filter(function(l) { return l.length > 0; });

  // 1. Transaction Ref No. (รหัสอ้างอิง / เลขที่รายการ / เลขที่อ้างอิง / Ref ID / Ref No)
  // ให้ความสำคัญกับ "เลขที่อ้างอิง" (รหัสธุรกรรมหลักยาว 15-30 หลัก) เป็นอันดับแรก เหมือนของทุกธนาคาร
  // และใช้ "หมายเลขอ้างอิง" (รหัสภายใน 6 หลัก เช่น ของ BBL) เป็นตัวเลือกรอง
  let primaryRef = "";
  let secondaryRef = "";

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];

    // ตรวจจับรหัสหลัก: "เลขที่อ้างอิง", "รหัสอ้างอิง", "เลขที่รายการ", "Ref ID", "Ref No", "Transaction ID"
    const primaryMatch = line.match(/(?:เลขที่อ้างอิง|รหัสอ้างอิง|เลขที่(?:รายการ|ธุรกรรม)|Transaction\s*(?:ID|No\.?)|Ref(?:\s*ID|\.?\s*No\.?)?|Reference(?:\s*No\.?)?)[\s:]+([A-Za-z0-9_-]{5,})/i);
    if (primaryMatch && primaryMatch[1]) {
      const cand = primaryMatch[1].trim();
      if (cand.length >= 12 || !primaryRef) {
        primaryRef = cand;
      }
    }
    if (/^(?:เลขที่อ้างอิง|รหัสอ้างอิง|เลขที่(?:รายการ|ธุรกรรม)|Transaction\s*(?:ID|No\.?)|Ref(?:\s*ID|\.?\s*No\.?)?|Reference(?:\s*No\.?)?)[\s:]*$/i.test(line) && i + 1 < rawLines.length) {
      const nextL = rawLines[i + 1].trim();
      if (/^[A-Za-z0-9_-]{5,}$/.test(nextL)) {
        if (nextL.length >= 12 || !primaryRef) {
          primaryRef = nextL;
        }
      }
    }

    // ตรวจจับรหัสรอง: "หมายเลขอ้างอิง", "หมายเลขรายการ" (เช่น BBL เลข 6 หลัก เช่น 389149)
    const secondaryMatch = line.match(/(?:หมายเลข(?:อ้างอิง|รายการ)|รหัสรายการ)[\s:]+([A-Za-z0-9_-]{5,})/i);
    if (secondaryMatch && secondaryMatch[1]) {
      const cand = secondaryMatch[1].trim();
      if (!secondaryRef) secondaryRef = cand;
    }
    if (/^(?:หมายเลข(?:อ้างอิง|รายการ)|รหัสรายการ)[\s:]*$/i.test(line) && i + 1 < rawLines.length) {
      const nextL = rawLines[i + 1].trim();
      if (/^[A-Za-z0-9_-]{5,}$/.test(nextL)) {
        if (!secondaryRef) secondaryRef = nextL;
      }
    }
  }

  // กำหนดค่าเลขที่อ้างอิง (เลือกรหัสยาวมาตรฐานกลางก่อน หากไม่มีจึงใช้รหัสรอง)
  info.refNo = primaryRef || secondaryRef || "-";

  // 2. Amount (ยอดเงินโอน / จำนวน / จำนวนเงิน / Amount / Total Amount)
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    // ข้ามบรรทัดค่าธรรมเนียม ยอดคงเหลือ หรือวงเงิน
    if (/ค่าธรรมเนียม|คงเหลือ|วงเงิน|Fee|Balance|Limit/i.test(line)) {
      continue;
    }

    // Inline amount (เช่น "จำนวนเงิน 350.00 บาท", "Amount 250.00 THB", "จำนวน: 250.00 บาท", "จำนวน 99.00")
    const inlineAmt = line.match(/(?:จำนวนเงิน|จำนวน|ยอดเงิน|ยอดโอน|ยอดเงินโอน|โอนเงิน|จ่ายเงิน|Amount|Total\s*Amount|Transfer\s*Amount)[\s:]*([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{1,2})?|[0-9]+(?:\.\d{1,2})?)\s*(?:THB|บาท|Baht)?/i);
    if (inlineAmt && inlineAmt[1]) {
      const val = parseFloat(inlineAmt[1].replace(/,/g, ""));
      if (!isNaN(val) && val > 0) {
        info.amount = val;
        break;
      }
    }

    // Multi-line amount (คำค้นอยู่บรรทัดที่ i เช่น "จำนวนเงิน" หรือ "Amount", ตัวเลขยอดเงินอยู่บรรทัดถัดไป)
    if (/^(?:จำนวนเงิน|จำนวน|ยอดเงิน|ยอดโอน|ยอดเงินโอน|Amount|Total\s*Amount|Transfer\s*Amount)[\s:]*$/i.test(line) && i + 1 < rawLines.length) {
      const nextL = rawLines[i + 1].trim();
      if (!/ค่าธรรมเนียม|Fee|คงเหลือ|Balance/i.test(nextL)) {
        const nextAmtMatch = nextL.match(/^([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{1,2})?|[0-9]+(?:\.\d{1,2})?)\s*(?:THB|บาท|Baht)?$/i);
        if (nextAmtMatch && nextAmtMatch[1]) {
          const val = parseFloat(nextAmtMatch[1].replace(/,/g, ""));
          if (!isNaN(val) && val > 0) {
            info.amount = val;
            break;
          }
        }
      }
    }
  }

  // ตัวเลือกรอง (Fallback): ค้นหาบรรทัดที่เป็นตัวเลขยอดเงินโดดๆ เช่น "99.00 THB", "250.00 บาท", "7,000.00"
  if (info.amount === 0) {
    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      if (/ค่าธรรมเนียม|คงเหลือ|วงเงิน|Fee|Balance|Limit/i.test(line)) {
        continue;
      }
      const saMatch = line.match(/^([0-9]{1,3}(?:,[0-9]{3})*\.\d{2})\s*(?:THB|บาท|Baht)?$/i);
      if (saMatch && saMatch[1]) {
        const val = parseFloat(saMatch[1].replace(/,/g, ""));
        if (!isNaN(val) && val > 0) {
          info.amount = val;
          break;
        }
      }
    }
  }

  // 3. Transfer Date & Time (วันเวลาโอน / วันที่ทำรายการ)
  const monthsThai = "ม\\.ค\\.|ก\\.พ\\.|มี\\.ค\\.|เม\\.ย\\.|พ\\.ค\\.|มิ\\.ย\\.|ก\\.ค\\.|ส\\.ค\\.|ก\\.ย\\.|ต\\.ค\\.|พ\\.ย\\.|ธ\\.ค\\.|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม";
  const monthsEng = "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";
  const monthPattern = "(?:" + monthsThai + "|" + monthsEng + ")";

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    // รองรับเครื่องหมายคั่นระหว่างวันและเวลาทั้ง space, comma, dash/hyphen (-) เช่น "23 พ.ย. 2569 - 16:04", "23 Nov 2026 - 21:53", "24 พ.ย. 69 21:24 น."
    const timeMatch1 = line.match(new RegExp("\\b(\\d{1,2}\\s+" + monthPattern + "\\s+\\d{2,4})[\\s,\\-–]+(?:เวลา\\s*|at\\s*)?(\\d{1,2}:\\d{2}(?::\\d{2})?(?:\\s*น\\.?)?)", "i"));
    if (timeMatch1) {
      info.transferTime = (timeMatch1[1] + ", " + timeMatch1[2]).trim();
      break;
    }
    // รูปแบบตัวเลขล้วน เช่น "23/11/2026 21:53", "23-11-2569 - 16:04"
    const timeMatch2 = line.match(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})[\s,\-–]+(?:เวลา\s*|at\s*)?(\d{1,2}:\d{2}(?::\d{2})?(?:\s*น\\.?)?)/i);
    if (timeMatch2) {
      info.transferTime = (timeMatch2[1] + ", " + timeMatch2[2]).trim();
      break;
    }
  }

  // 3.2 กรณีวันที่และเวลาอยู่คนละบรรทัด (เช่น บรรทัดบนบอกวันที่ บรรทัดล่างบอกเวลา)
  if (info.transferTime === "-") {
    let foundDate = "";
    let foundTime = "";

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      if (!foundDate) {
        const dMatch = line.match(new RegExp("\\b(\\d{1,2}\\s+" + monthPattern + "\\s+\\d{2,4})", "i")) ||
                       line.match(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/);
        if (dMatch) foundDate = dMatch[1].trim();
      }
      if (!foundTime) {
        const tMatch = line.match(/\b(?:เวลา\s*)?(\d{1,2}:\d{2}(?::\d{2})?(?:\s*น\.?)?)\b/);
        if (tMatch && line.indexOf("http") === -1 && line.indexOf("www") === -1) {
          foundTime = tMatch[1].trim();
        }
      }
      if (foundDate && foundTime) {
        info.transferTime = (foundDate + ", " + foundTime).trim();
        break;
      }
    }
  }

  // 4. Bank (ธนาคาร)
  const fullText = cleanMd.toLowerCase();
  if (fullText.indexOf("ttb") !== -1 || fullText.indexOf("ทหารไทยธนชาต") !== -1 || fullText.indexOf("tmb") !== -1 || fullText.indexOf("thanachart") !== -1) {
    info.bank = "ttb (ทหารไทยธนชาต)";
  } else if (fullText.indexOf("kbank") !== -1 || fullText.indexOf("กสิกรไทย") !== -1 || fullText.indexOf("kasikorn") !== -1 || fullText.indexOf("k+") !== -1) {
    info.bank = "กสิกรไทย (KBANK)";
  } else if (fullText.indexOf("scb") !== -1 || fullText.indexOf("ไทยพาณิชย์") !== -1 || fullText.indexOf("siam commercial") !== -1) {
    info.bank = "ไทยพาณิชย์ (SCB)";
  } else if (fullText.indexOf("ktb") !== -1 || fullText.indexOf("กรุงไทย") !== -1 || fullText.indexOf("krungthai") !== -1) {
    info.bank = "กรุงไทย (KTB)";
  } else if (fullText.indexOf("bbl") !== -1 || fullText.indexOf("กรุงเทพ") !== -1 || fullText.indexOf("bangkok bank") !== -1) {
    info.bank = "กรุงเทพ (BBL)";
  } else if (fullText.indexOf("kept") !== -1) {
    info.bank = "Kept (กรุงศรี)";
  } else if (fullText.indexOf("bay") !== -1 || fullText.indexOf("กรุงศรี") !== -1 || fullText.indexOf("krungsri") !== -1 || (info.refNo && info.refNo.indexOf("KSA") === 0)) {
    info.bank = "กรุงศรีอยุธยา (BAY)";
  } else if (fullText.indexOf("gsb") !== -1 || fullText.indexOf("ออมสิน") !== -1 || fullText.indexOf("government savings") !== -1) {
    info.bank = "ออมสิน (GSB)";
  } else if (fullText.indexOf("baac") !== -1 || fullText.indexOf("ธ.ก.ส.") !== -1 || fullText.indexOf("ธกส") !== -1) {
    info.bank = "ธ.ก.ส. (BAAC)";
  } else if (fullText.indexOf("uob") !== -1 || fullText.indexOf("ยูโอบี") !== -1) {
    info.bank = "ยูโอบี (UOB)";
  } else if (fullText.indexOf("cimb") !== -1 || fullText.indexOf("ซีไอเอ็มบี") !== -1) {
    info.bank = "CIMB Thai";
  } else if (fullText.indexOf("พร้อมเพย์") !== -1 || fullText.indexOf("promptpay") !== -1) {
    info.bank = "พร้อมเพย์";
  }

  // 5. Sender Name (ผู้โอน = จาก / From)
  // ป้องกันการสับสนระหว่างชื่อผู้โอน กับชื่อผู้รับ (ไปยัง / To)
  let fromIndex = -1;
  let toIndex = -1;

  for (let i = 0; i < rawLines.length; i++) {
    const l = rawLines[i];
    if (fromIndex === -1 && /^(?:จาก|From)[\s:]*$/i.test(l)) {
      fromIndex = i;
    } else if (fromIndex === -1 && /^(?:จาก|From)[\s:]+(.+)$/i.test(l)) {
      const candidate = l.replace(/^(?:จาก|From)[\s:]+/i, "").trim();
      if (!isInvalidSenderLine(candidate)) {
        info.senderName = cleanSenderName(candidate);
        break;
      }
      fromIndex = i;
    }
    if (toIndex === -1 && /^(?:ไปยัง|ถึง|To)[\s:]*/i.test(l)) {
      toIndex = i;
    }
  }

  // หากพบตำแหน่ง "จาก / From" ให้ค้นหาชื่อผู้โอนเฉพาะในช่วงระหว่าง "จาก" ถึง "ไปยัง"
  if (info.senderName === "-" && fromIndex !== -1) {
    const maxScan = toIndex > fromIndex ? toIndex : Math.min(rawLines.length, fromIndex + 4);
    for (let i = fromIndex + 1; i < maxScan; i++) {
      const line = rawLines[i];
      if (isInvalidSenderLine(line)) continue;
      if (isValidPersonName(line)) {
        info.senderName = cleanSenderName(line);
        break;
      }
    }
  }

  // กรณีสลิปไม่มีคำว่า "จาก / From" (เช่น KBANK, BAY) ให้ค้นหาก่อนถึงตำแหน่งผู้รับ (เช่น "ไปยัง" หรือ บจก. แกรนด์สแลม)
  if (info.senderName === "-") {
    const limit = toIndex !== -1 ? toIndex : rawLines.length;
    for (let i = 0; i < limit; i++) {
      const line = rawLines[i];
      if (isInvalidSenderLine(line)) continue;
      if (isValidPersonName(line)) {
        info.senderName = cleanSenderName(line);
        break;
      }
    }
  }

  return info;
}

/**
 * ตรวจสอบข้อความที่ไม่ใช่ชื่อผู้โอน (เช่น ชื่อสนาม, ธนาคาร, เลขบัญชี, หัวข้อระบบ)
 */
function isInvalidSenderLine(text) {
  if (!text) return true;
  const t = text.toLowerCase();
  if (t.indexOf("แกรนด์สแลม") !== -1 || t.indexOf("grand slam") !== -1 || t.indexOf("grand sla") !== -1) return true;
  if (t.indexOf("ธนาคาร") !== -1 || t.indexOf("bank") !== -1 || t.indexOf("krungthai") !== -1 || t.indexOf("กสิกรไทย") !== -1 || t.indexOf("krungsri") !== -1) return true;
  if (/^[xX0-9\-\s\.]+$/.test(text)) return true; // เลขบัญชีหรือเบอร์โทร
  if (/^(?:โอนเงินสำเร็จ|successful|รายการสำเร็จ|จำนวน|amount|fee|ref|transfer|transaction|qr code|scan|recipient)/i.test(t)) return true;
  return false;
}

/**
 * ตรวจสอบโครงสร้างชื่อบุคคล (ภาษาไทย หรือภาษาอังกฤษ พร้อมคำนำหน้าชื่อ และรองรับดอกจันซ่อนชื่อ)
 */
function isValidPersonName(text) {
  if (!text) return false;
  // ชื่อภาษาไทย เช่น "นาย กมลวิทย์", "น.ส. วรัญญู เ***", "คุณสมชาย"
  if (/^(?:นาย|นางสาว|นาง|น\.ส\.|คุณ|บจก\.|บริษัท)\s*[\u0E00-\u0E7FA-Za-z\s\*\.]{2,}/i.test(text)) {
    return true;
  }
  // ชื่อภาษาอังกฤษ เช่น "Thanwarat Maklab", "CHAYUT CHIWKA", "MR. JOHN DOE"
  if (/^(?:MR\.|MRS\.|MS\.|MISS\s+)?[A-Z][a-zA-Z\s\*\.]{3,}$/.test(text)) {
    return true;
  }
  return false;
}

/**
 * ตัดช่องว่างซ้ำซ้อนในชื่อ
 */
function cleanSenderName(name) {
  return name.replace(/\s{2,}/g, " ").trim();
}

/**
 * Engine 2 (Fallback): Google Gemini Vision AI
 */
function analyzeSlipWithGemini(imageBlob, expectedFee, bookingSheet) {
  const result = {
    bank: "-",
    senderName: "-",
    amount: 0,
    refNo: "-",
    transferTime: "-",
    status: "รอตรวจสอบ",
    amountMatch: false,
    isDuplicate: false,
    engine: "Gemini Vision AI",
    debugInfo: ""
  };

  const apiKey = getCleanScriptProperty("GEMINI_API_KEY") || 
                 getCleanScriptProperty("GEMINI_KEY") || 
                 getCleanScriptProperty("GOOGLE_API_KEY") || 
                 getCleanScriptProperty("GEMINI_APIKEY");

  if (!apiKey) {
    result.debugInfo = "Missing GEMINI_API_KEY";
    return null;
  }

  try {
    let contentType = "image/jpeg";
    try {
      const mime = imageBlob.getContentType();
      if (mime && mime.indexOf("image/") === 0 && mime !== "image/svg+xml") {
        contentType = mime;
      }
    } catch(e) {}

    const base64Data = Utilities.base64Encode(imageBlob.getBytes());

    const promptText = 
      "คุณคือ AI ตรวจสอบสลิปการโอนเงินของสนามเทนนิส The Grand Slam\n" +
      "หน้าที่ของคุณคืออ่านข้อมูลตัวอักษรและตัวเลขจากภาพสลิปธนาคารไทยนี้อย่างแม่นยำ และตอบกลับเป็น JSON ล้วนเท่านั้น ห้ามใส่คำบรรยายอื่นหรือ markdown code block เด็ดขาด\n\n" +
      "โครงสร้าง JSON ที่ต้องการ:\n" +
      "{\n" +
      '  "bank": "ชื่อธนาคารของผู้โอน เช่น กสิกรไทย, ไทยพาณิชย์, กรุงไทย, กรุงเทพ, ออมสิน, ทหารไทยธนชาต (ttb), กรุงศรี, พร้อมเพย์",\n' +
      '  "senderName": "ชื่อ-นามสกุล หรือชื่อบัญชีของผู้โอนเงิน (ระบุใต้คำว่า จาก หรือ From ห้ามเอาชื่อผู้รับ)",\n' +
      '  "amount": ตัวเลขยอดเงินที่โอนสำเร็จ (ระบุใต้คำว่า จำนวน, จำนวนเงิน, หรือ Amount เช่น 250 หรือ 99.00 หรือ 7000 โดยไม่ใส่เครื่องหมายจุลภาคและไม่ต้องใส่หน่วย),\n' +
      '  "refNo": "หมายเลขอ้างอิง หรือ รหัสอ้างอิง หรือ รหัสธุรกรรม หรือ Transaction ID หรือ Ref ID หรือ Ref No.",\n' +
      '  "transferTime": "วันและเวลาที่โอนเงินตามที่ระบุในสลิป เช่น วันที่ทำรายการ (เช่น 23 พ.ย. 69, 21:53 น. หรือ 23 Nov 2026 - 21:53)"\n' +
      "}";

    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: contentType,
                data: base64Data
              }
            },
            {
              text: promptText
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json"
      }
    };

    const models = [
      "gemini-2.0-flash",
      "gemini-1.5-flash",
      "gemini-2.0-flash-exp"
    ];

    let geminiRawResponse = "";
    let callSuccess = false;
    let lastError = "";

    for (let m = 0; m < models.length; m++) {
      const modelName = models[m];
      const apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/" + modelName + ":generateContent?key=" + apiKey;

      try {
        const geminiRes = UrlFetchApp.fetch(apiUrl, {
          method: "post",
          contentType: "application/json",
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });

        const gCode = geminiRes.getResponseCode();
        const gText = geminiRes.getContentText();

        if (gCode === 200) {
          const resJson = JSON.parse(gText);
          if (resJson.candidates && resJson.candidates.length > 0 && resJson.candidates[0].content && resJson.candidates[0].content.parts) {
            geminiRawResponse = resJson.candidates[0].content.parts[0].text.trim();
            callSuccess = true;
            result.debugInfo = "Gemini (" + modelName + ")";
            break;
          }
        } else {
          lastError = modelName + " (HTTP " + gCode + "): " + gText.substring(0, 200);
        }
      } catch (callErr) {
        lastError = modelName + " Error: " + callErr.toString();
      }
    }

    if (!callSuccess || !geminiRawResponse) {
      result.debugInfo = lastError;
      return null;
    }

    let cleanJson = geminiRawResponse.replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsedData = JSON.parse(cleanJson);

    result.bank = String(parsedData.bank || "-").trim();
    result.senderName = String(parsedData.senderName || "-").trim();
    result.amount = parseFloat(parsedData.amount) || 0;
    result.refNo = String(parsedData.refNo || "-").trim();
    result.transferTime = String(parsedData.transferTime || "-").trim();

    validateSlipAmount(result, expectedFee);
    checkDuplicateSlipRef(result, bookingSheet);

    return result;

  } catch (err) {
    result.debugInfo = "Gemini Exception: " + err.toString();
    return null;
  }
}

/**
 * ตรวจสอบความถูกต้องของยอดเงิน
 */
function validateSlipAmount(result, expectedFee) {
  const expFee = parseFloat(expectedFee) || 0;
  if (result.amount > 0 && expFee > 0) {
    if (Math.abs(result.amount - expFee) < 0.01) {
      result.amountMatch = true;
      result.status = "ยอดเงินตรง ✅";
    } else {
      result.amountMatch = false;
      result.status = "⚠️ ยอดไม่ตรง (สลิป: " + result.amount + " บ., ค่าบริการ: " + expFee + " บ.)";
    }
  } else if (result.amount > 0) {
    result.status = "มียอดเงิน " + result.amount + " บ.";
  } else {
    result.status = "⚠️ ไม่พบยอดเงินในสลิป";
  }
}

/**
 * ตรวจสอบหมายเลขอ้างอิงสลิปซ้ำในระบบ Google Sheets (คอลัมน์ V / 22)
 */
function checkDuplicateSlipRef(result, bookingSheet) {
  if (bookingSheet && result.refNo && result.refNo !== "-" && result.refNo.length >= 6) {
    try {
      const lastRow = bookingSheet.getLastRow();
      if (lastRow > 1 && bookingSheet.getLastColumn() >= 22) {
        const existingRefs = bookingSheet.getRange(2, 22, lastRow - 1, 1).getValues();
        for (let i = 0; i < existingRefs.length; i++) {
          const existingRef = String(existingRefs[i][0] || "").trim();
          if (existingRef && existingRef === result.refNo) {
            result.isDuplicate = true;
            result.status = "🚨 ตรวจพบสลิปซ้ำ (Ref: " + result.refNo + ")";
            break;
          }
        }
      }
    } catch (dupErr) {}
  }
}

function sendAdminSlipNotification(name, phone, dateStr, slots, receiptNo, slipUrl, requireCoach, slipAnalysis) {
  const adminId = ADMIN_LINE_USER_ID;
  if (!LINE_CHANNEL_ACCESS_TOKEN || !adminId) {
    console.warn("Skipping Admin LINE notification: missing LINE_CHANNEL_ACCESS_TOKEN or ADMIN_LINE_USER_ID.");
    return;
  }

  const url = "https://api.line.me/v2/bot/message/push";
  const slotsText = Array.isArray(slots) ? slots.join(", ") : String(slots || "");

  // สร้างกล่อง AI ตรวจสอบสลิปสำหรับแสดงผลใน LINE Flex Card
  const aiBoxContents = [];
  if (slipAnalysis && (slipUrl || (slipAnalysis.refNo && slipAnalysis.refNo !== "-"))) {
    let badgeBg = "#E8F8EE";
    let badgeTextColor = "#1DB446";
    let badgeText = "✅ ยอดเงินตรง";

    if (slipAnalysis.isDuplicate) {
      badgeBg = "#FEE2E2";
      badgeTextColor = "#DC2626";
      badgeText = "🚨 สลิปซ้ำ";
    } else if (slipAnalysis.amountMatch === false && slipAnalysis.amount > 0) {
      badgeBg = "#FFF4E5";
      badgeTextColor = "#D97706";
      badgeText = "⚠️ ยอดไม่ตรง";
    } else if (slipAnalysis.amountMatch) {
      badgeBg = "#E8F8EE";
      badgeTextColor = "#1DB446";
      badgeText = "✅ ยอดเงินตรง";
    } else if (slipAnalysis.status && (slipAnalysis.status.indexOf("ไม่พบคีย์") !== -1 || slipAnalysis.status.indexOf("❌") !== -1)) {
      badgeBg = "#FEE2E2";
      badgeTextColor = "#DC2626";
      badgeText = "❌ ตรวจไม่ผ่าน";
    } else {
      badgeBg = "#F1F5F9";
      badgeTextColor = "#64748B";
      badgeText = "🔍 รอตรวจสอบ";
    }

    const detailRows = [
      {
        type: "box",
        layout: "baseline",
        contents: [
          { type: "text", text: "ธนาคาร:", size: "xs", color: "#64748B", flex: 3 },
          { type: "text", text: String(slipAnalysis.bank || "-"), size: "xs", color: "#1E293B", weight: "bold", flex: 6, wrap: true }
        ]
      },
      {
        type: "box",
        layout: "baseline",
        contents: [
          { type: "text", text: "ผู้โอน:", size: "xs", color: "#64748B", flex: 3 },
          { type: "text", text: String(slipAnalysis.senderName || "-"), size: "xs", color: "#1E293B", weight: "bold", flex: 6, wrap: true }
        ]
      },
      {
        type: "box",
        layout: "baseline",
        contents: [
          { type: "text", text: "ยอดในสลิป:", size: "xs", color: "#64748B", flex: 3 },
          { type: "text", text: (slipAnalysis.amount ? Number(slipAnalysis.amount).toLocaleString("th-TH", { minimumFractionDigits: 2 }) + " บาท" : "-"), size: "xs", color: (slipAnalysis.amountMatch ? "#16A34A" : "#DC2626"), weight: "bold", flex: 6 }
        ]
      },
      {
        type: "box",
        layout: "baseline",
        contents: [
          { type: "text", text: "เลขที่รายการ:", size: "xs", color: "#64748B", flex: 3 },
          { type: "text", text: String(slipAnalysis.refNo || "-"), size: "xs", color: "#1E293B", flex: 6, wrap: true }
        ]
      },
      {
        type: "box",
        layout: "baseline",
        contents: [
          { type: "text", text: "วันเวลาโอน:", size: "xs", color: "#64748B", flex: 3 },
          { type: "text", text: String(slipAnalysis.transferTime || "-"), size: "xs", color: "#64748B", flex: 6, wrap: true }
        ]
      },
      {
        type: "box",
        layout: "baseline",
        contents: [
          { type: "text", text: "ผลตรวจ:", size: "xs", color: "#64748B", flex: 3 },
          { type: "text", text: String(slipAnalysis.status || "-"), size: "xs", color: badgeTextColor, weight: "bold", flex: 6, wrap: true }
        ]
      },
      {
        type: "box",
        layout: "baseline",
        contents: [
          { type: "text", text: "ระบบที่ใช้:", size: "xs", color: "#64748B", flex: 3 },
          { type: "text", text: String(slipAnalysis.engine || "Hybrid OCR"), size: "xs", color: "#64748B", flex: 6, wrap: true }
        ]
      }
    ];

    if (slipAnalysis.debugInfo && slipAnalysis.status.indexOf("❌") !== -1) {
      detailRows.push({
        type: "box",
        layout: "baseline",
        contents: [
          { type: "text", text: "สาเหตุ:", size: "xxs", color: "#94A3B8", flex: 3 },
          { type: "text", text: String(slipAnalysis.debugInfo).substring(0, 100), size: "xxs", color: "#DC2626", flex: 6, wrap: true }
        ]
      });
    }

    aiBoxContents.push(
      { type: "separator", margin: "md" },
      {
        type: "box",
        layout: "vertical",
        margin: "md",
        paddingAll: "10px",
        backgroundColor: "#F8FAFC",
        cornerRadius: "8px",
        borderColor: "#E2E8F0",
        borderWidth: "1px",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "text",
                text: "🤖 AI ตรวจสลิป (" + (slipAnalysis.engine || "Hybrid") + ")",
                weight: "bold",
                size: "xs",
                color: "#1E3A8A",
                flex: 5
              },
              {
                type: "box",
                layout: "vertical",
                backgroundColor: badgeBg,
                cornerRadius: "4px",
                paddingStart: "6px",
                paddingEnd: "6px",
                paddingTop: "2px",
                paddingBottom: "2px",
                contents: [
                  {
                    type: "text",
                    text: badgeText,
                    size: "xxs",
                    weight: "bold",
                    color: badgeTextColor,
                    align: "center"
                  }
                ]
              }
            ]
          },
          {
            type: "box",
            layout: "vertical",
            margin: "sm",
            spacing: "xs",
            contents: detailRows
          }
        ]
      }
    );
  }

  // ประกอบการ์ด Flex แจ้งเตือนแอดมิน
  const bubbleBodyContents = [
    {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        {
          type: "box",
          layout: "baseline",
          contents: [
            { type: "text", text: "ลูกค้า", color: "#555555", size: "md", flex: 2 },
            { type: "text", text: String(name || "-"), color: "#000000", size: "md", flex: 4 }
          ]
        },
        {
          type: "box",
          layout: "baseline",
          contents: [
            { type: "text", text: "เบอร์โทร", color: "#555555", size: "md", flex: 2 },
            { type: "text", text: String(phone || "-"), color: "#000000", size: "md", flex: 4 }
          ]
        },
        {
          type: "box",
          layout: "baseline",
          contents: [
            { type: "text", text: "วันที่", color: "#555555", size: "md", flex: 2 },
            { type: "text", text: String(dateStr || "-"), color: "#000000", size: "md", flex: 4 }
          ]
        },
        {
          type: "box",
          layout: "baseline",
          contents: [
            { type: "text", text: "เวลาที่จอง:", color: "#555555", size: "md", flex: 2 },
            { type: "text", text: String(slotsText || "-"), color: "#000000", size: "md", flex: 4, wrap: true }
          ]
        },
        {
          type: "box",
          layout: "baseline",
          contents: [
            { type: "text", text: "โค้ช", color: "#555555", size: "md", flex: 2 },
            { type: "text", text: (requireCoach ? "ต้องการโค้ช 🟢" : "ไม่ต้องการโค้ช ❌"), color: "#000000", size: "md", flex: 4 }
          ]
        },
        {
          type: "box",
          layout: "baseline",
          contents: [
            { type: "text", text: "เลขใบเสร็จ", color: "#555555", size: "md", flex: 2 },
            { type: "text", text: String(receiptNo || "-"), color: "#000000", size: "md", flex: 4 }
          ]
        }
      ]
    }
  ];

  if (aiBoxContents.length > 0) {
    aiBoxContents.forEach(function(item) {
      bubbleBodyContents.push(item);
    });
  }

  const bubbleContents = {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#2B1190",
      contents: [
        { type: "text", text: "NEW BOOKING RECEIVED", weight: "bold", color: "#B8B3F4", size: "xs" },
        { type: "text", text: "มีการจองสนามใหม่เข้าสู่ระบบ!", weight: "bold", color: "#FFFFFF", size: "md", margin: "xs" }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      contents: bubbleBodyContents
    }
  };

  if (slipUrl && typeof slipUrl === "string" && slipUrl.indexOf("http") === 0) {
    bubbleContents.footer = {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#2B1190",
          height: "sm",
          action: {
            type: "uri",
            label: "🔍 ตรวจสอบภาพสลิป",
            uri: slipUrl
          }
        }
      ]
    };
  }

  // 1. ส่ง Flex Card แจ้งเตือนแอดมินพร้อมข้อมูล AI ตรวจสอบสลิป
  try {
    const flexPayload = {
      to: adminId,
      messages: [
        {
          type: "flex",
          altText: "🔔 มีการจองสนามใหม่เข้าสู่ระบบ! (" + (name || "") + ")",
          contents: bubbleContents
        }
      ]
    };

    UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: {
        "Authorization": "Bearer " + LINE_CHANNEL_ACCESS_TOKEN
      },
      payload: JSON.stringify(flexPayload),
      muteHttpExceptions: true
    });
  } catch(e) {
    console.error("sendAdminSlipNotification Flex Error: " + e.toString());
  }

  // 2. ส่งภาพสลิปแนบไปด้วยเพื่อให้แอดมินเห็นภาพชัดเจนทันที
  if (slipUrl && typeof slipUrl === 'string' && slipUrl.indexOf('https://') === 0) {
    try {
      const imgPayload = {
        to: adminId,
        messages: [
          {
            type: "image",
            originalContentUrl: slipUrl,
            previewImageUrl: slipUrl
          }
        ]
      };
      UrlFetchApp.fetch(url, {
        method: "post",
        contentType: "application/json",
        headers: {
          "Authorization": "Bearer " + LINE_CHANNEL_ACCESS_TOKEN
        },
        payload: JSON.stringify(imgPayload),
        muteHttpExceptions: true
      });
    } catch(imgErr) {
      console.warn("sendAdminSlipNotification Image Error: " + imgErr.toString());
    }
  }
}

function sendEmailConfirmation(toEmail, name, formattedDate, slots, receiptNo, requireCoach, courtStr) {
  if (!toEmail) return;
  const activeCourt = courtStr || "Main Court";
  const subject = "ยืนยันการจองสนามเทนนิส - ใบเสร็จเลขที่ " + receiptNo;
  const slotsFormatted = Array.isArray(slots) ? slots.join(", ") : String(slots || "");

  const htmlBody = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
      <div style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #3b82f6;">
        <h2 style="color: #1e3a8a; margin: 0;">🎾 The Grand Slam </h2>
        <p style="color: #64748b; font-size: 14px; margin-top: 5px;">ยืนยันการจองสนามเรียบร้อยแล้ว</p>
      </div>
      <div style="padding: 20px 0;">
        <p style="font-size: 16px; color: #334155;">สวัสดีคุณ <strong>${name}</strong>,</p>
        <p style="font-size: 15px; color: #475569; line-height: 1.6;">
          ขอบคุณที่เลือกใช้บริการสนามเทนนิสของเรา รายละเอียดการจองสนามของคุณมีดังนี้:
        </p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 15px;">
          <tr style="background-color: #f8fafc;">
            <td style="padding: 12px; border: 1px solid #e2e8f0; font-weight: bold; color: #475569;">เลขที่ใบเสร็จ</td>
            <td style="padding: 12px; border: 1px solid #e2e8f0; color: #0f172a;">${receiptNo}</td>
          </tr>
          <tr>
            <td style="padding: 12px; border: 1px solid #e2e8f0; font-weight: bold; color: #475569;">สนาม</td>
            <td style="padding: 12px; border: 1px solid #e2e8f0; color: #0f172a;">${activeCourt}</td>
          </tr>
          <tr style="background-color: #f8fafc;">
            <td style="padding: 12px; border: 1px solid #e2e8f0; font-weight: bold; color: #475569;">วันที่ใช้บริการ</td>
            <td style="padding: 12px; border: 1px solid #e2e8f0; color: #0f172a;">${formattedDate}</td>
          </tr>
          <tr>
            <td style="padding: 12px; border: 1px solid #e2e8f0; font-weight: bold; color: #475569;">ช่วงเวลาที่จอง</td>
            <td style="padding: 12px; border: 1px solid #e2e8f0; color: #0f172a;">${slotsFormatted}</td>
          </tr>
        </table>
      </div>
    </div>
  `;

  try {
    GmailApp.sendEmail(toEmail, subject, "", {
      htmlBody: htmlBody,
      name: "Grand Slam Tennis Club"
    });
  } catch(e) {
    console.error("Gmail error: " + e.toString());
  }
}

// ==========================================
// CANCELLATION & UPDATES & CALENDAR
// ==========================================
function handleCancelBooking(data) {
  const dateStr = String(data.date || "").trim();
  const slotStr = String(data.slot || "").trim();
  const courtStr = String(data.court || "Main Court").trim();
  const calendarEventId = String(data.calendarEventId || "").trim();
  const customerName = String(data.name || "").trim();

  if (!dateStr || !slotStr) {
    return ContentService.createTextOutput(JSON.stringify({ 
      status: "error", 
      message: "Missing date or slot for cancellation" 
    })).setMimeType(ContentService.MimeType.JSON);
  }

  removeBookingFromSheet(dateStr, slotStr, courtStr, calendarEventId, customerName);

  return ContentService.createTextOutput(JSON.stringify({ 
    status: "success", 
    message: "Booking cancellation processed" 
  })).setMimeType(ContentService.MimeType.JSON);
}

function removeBookingFromSheet(dateStr, slotStr, courtStr, calendarEventIdDirect, customerNameDirect) {
  const activeCourt = courtStr || "Main Court";
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return;
  }

  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const bookingSheet = spreadsheet.getSheetByName("Bookings");
    if (!bookingSheet) return;

    const lastRow = bookingSheet.getLastRow();
    if (lastRow <= 1) return;

    const data = bookingSheet.getRange(2, 1, lastRow - 1, 17).getValues();
    let rowToDelete = -1;
    let storedEventId = "";

    const targetKey = getNormalizedBookingKey(dateStr, activeCourt, slotStr);

    for (let i = 0; i < data.length; i++) {
      const rowDateVal = data[i][1];
      let rowDateStr = (rowDateVal instanceof Date) ? Utilities.formatDate(rowDateVal, Session.getScriptTimeZone(), "yyyy-MM-dd") : String(rowDateVal || "").trim();
      const rowSlotStr = String(data[i][2] || "").trim();
      const rowCourtStr = String(data[i][6] || "Main Court").trim();
      const rowKey = getNormalizedBookingKey(rowDateStr, rowCourtStr, rowSlotStr);

      if (rowKey === targetKey) {
        rowToDelete = i + 2; 
        storedEventId = String(data[i][16] || "").trim();
        break;
      }
    }

    if (rowToDelete !== -1) {
      bookingSheet.deleteRow(rowToDelete);
    }

    const eventIdToDelete = calendarEventIdDirect || storedEventId;
    deleteGoogleCalendarEvent(customerNameDirect, dateStr, slotStr, eventIdToDelete);
  } finally {
    try { lock.releaseLock(); } catch(err) {}
  }
}

function handleSyncTransaction(data) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let txSheet = spreadsheet.getSheetByName("Transactions");
  const txHeaders = ["Transaction ID", "Date", "Type", "Category", "Amount", "Description", "Slip URL", "Booking ID", "Timestamp"];
  if (!txSheet) {
    txSheet = spreadsheet.insertSheet("Transactions");
    txSheet.getRange(1, 1, 1, txHeaders.length).setValues([txHeaders]);
  }

  const tx = data.transaction || data;
  if (!tx || !tx.id) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Transaction ID is required." }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const txId = String(tx.id).trim();
  const dateStr = String(tx.date || tx.transaction_date || "").trim();
  const typeStr = String(tx.type || "").trim();
  const catStr = String(tx.category || "").trim();
  const amtNum = Number(tx.amount) || 0;
  const descStr = String(tx.description || "").trim();
  const slipUrl = String(tx.slipUrl || tx.slip_url || "").trim();
  const bookingId = String(tx.bookingId || tx.booking_id || "").trim();
  const nowIso = new Date().toISOString();

  const lastRow = txSheet.getLastRow();
  let existingRow = -1;
  if (lastRow > 1) {
    const ids = txSheet.getRange(2, 1, lastRow - 1, 1).getValues().map(function(r) { return String(r[0]); });
    const idx = ids.indexOf(txId);
    if (idx !== -1) {
      existingRow = idx + 2;
    }
  }

  const rowValues = [txId, dateStr, typeStr, catStr, amtNum, descStr, slipUrl, bookingId, nowIso];
  if (existingRow > 0) {
    txSheet.getRange(existingRow, 1, 1, txHeaders.length).setValues([rowValues]);
  } else {
    txSheet.appendRow(rowValues);
  }

  return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Transaction synced.", id: txId }))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleDeleteTransaction(data) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let txSheet = spreadsheet.getSheetByName("Transactions");
  if (!txSheet) {
    return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "No Transactions sheet found." }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const txId = String(data.id || "").trim();
  if (!txId) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Transaction ID is required for deletion." }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const lastRow = txSheet.getLastRow();
  if (lastRow > 1) {
    const ids = txSheet.getRange(2, 1, lastRow - 1, 1).getValues().map(function(r) { return String(r[0]); });
    const idx = ids.indexOf(txId);
    if (idx !== -1) {
      txSheet.deleteRow(idx + 2);
      return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Transaction deleted from sheet.", id: txId }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Transaction not found in sheet (already removed).", id: txId }))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleUpdateNotes(data) {
  const dateStr = String(data.date || "").trim();
  const slotStr = String(data.slot || "").trim();
  const courtStr = String(data.court || "Main Court").trim();
  const adminNotes = String(data.adminNotes || "").trim();

  if (!dateStr || !slotStr) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Missing date or slot" })).setMimeType(ContentService.MimeType.JSON);
  }

  const activeCourt = courtStr || "Main Court";
  const targetKey = getNormalizedBookingKey(dateStr, activeCourt, slotStr);
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const bookingSheet = spreadsheet.getSheetByName("Bookings");
  if (!bookingSheet) return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Sheet not found" })).setMimeType(ContentService.MimeType.JSON);

  const lastRow = bookingSheet.getLastRow();
  if (lastRow <= 1) return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "No rows" })).setMimeType(ContentService.MimeType.JSON);

  const rows = bookingSheet.getRange(2, 1, lastRow - 1, 17).getValues();
  let foundRow = -1;
  for (let i = 0; i < rows.length; i++) {
    let rowDateStr = (rows[i][1] instanceof Date) ? Utilities.formatDate(rows[i][1], Session.getScriptTimeZone(), "yyyy-MM-dd") : String(rows[i][1] || "").trim();
    let rowSlotStr = String(rows[i][2] || "").trim();
    let rowCourtStr = String(rows[i][6] || "Main Court").trim();
    if (getNormalizedBookingKey(rowDateStr, rowCourtStr, rowSlotStr) === targetKey) {
      foundRow = i + 2;
      break;
    }
  }

  if (foundRow !== -1) {
    bookingSheet.getRange(foundRow, 16).setValue(adminNotes);
  }
  return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
}

function createGoogleCalendarEvents(name, phone, dateStr, slots, receiptNo, requireCoach, court) {
  const activeCourt = court || "Main Court";
  const dateParts = dateStr.split('-');
  if (dateParts.length !== 3) return [];
  const year = parseInt(dateParts[0], 10);
  const month = parseInt(dateParts[1], 10) - 1;
  const day = parseInt(dateParts[2], 10);
  
  let calendar = null;
  if (typeof MAIN_CALENDAR_ID !== "undefined" && MAIN_CALENDAR_ID) {
    try { calendar = CalendarApp.getCalendarById(MAIN_CALENDAR_ID); } catch (err) {}
  }
  if (!calendar) calendar = CalendarApp.getDefaultCalendar();
  
  let coachCalendar = null;
  if (requireCoach && typeof COACH_CALENDAR_ID !== "undefined" && COACH_CALENDAR_ID) {
    try { coachCalendar = CalendarApp.getCalendarById(COACH_CALENDAR_ID); } catch(err) {}
  }
  
  const eventIds = [];
  for (let i = 0; i < slots.length; i++) {
    const slotStr = slots[i];
    try {
      const timeParts = slotStr.split(' - ');
      if (timeParts.length !== 2) continue;
      
      const startTime = new Date(year, month, day, parseInt(timeParts[0].split(':')[0], 10), parseInt(timeParts[0].split(':')[1], 10), 0);
      const endTime = new Date(year, month, day, parseInt(timeParts[1].split(':')[0], 10), parseInt(timeParts[1].split(':')[1], 10), 0);
      
      const icon = requireCoach ? "🧸" : "🎾";
      const title = icon + " [" + activeCourt + "] จอง: คุณ " + name + " (" + slotStr + ")";
      const description = "ชื่อผู้จอง: " + name + "\nเบอร์โทร: " + phone + "\nสนาม: " + activeCourt + "\nเวลาจอง: " + slotStr + "\nเลขที่ใบเสร็จ: " + receiptNo;
      
      const event = calendar.createEvent(title, startTime, endTime, { description: description });
      event.setColor(CalendarApp.EventColor.PALE_BLUE);
      
      const mainId = event.getId();
      let coachId = "";
      if (requireCoach && coachCalendar) {
        try {
          const coachTitle = "🧸 [" + activeCourt + "] สอน: คุณ " + name + " (" + slotStr + ")";
          const coachEvent = coachCalendar.createEvent(coachTitle, startTime, endTime, { description: description });
          coachEvent.setColor(CalendarApp.EventColor.YELLOW);
          coachId = coachEvent.getId();
        } catch (err) {}
      }
      
      eventIds.push(JSON.stringify({ main: mainId, coach: coachId }));
    } catch (e) {}
  }
  return eventIds;
}

function deleteGoogleCalendarEvent(name, dateStr, slotStr, eventIdStr) {
  // === Setup calendars ===
  let calendar = CalendarApp.getDefaultCalendar();
  if (typeof MAIN_CALENDAR_ID !== "undefined" && MAIN_CALENDAR_ID) {
    try { calendar = CalendarApp.getCalendarById(MAIN_CALENDAR_ID) || calendar; } catch(e){}
  }

  let coachCalendar = null;
  if (typeof COACH_CALENDAR_ID !== "undefined" && COACH_CALENDAR_ID) {
    try { coachCalendar = CalendarApp.getCalendarById(COACH_CALENDAR_ID); } catch(e){}
  }

  let mainDeleted = false;
  let coachDeleted = false;

  // === Layer 1: Delete by Event ID (fast path) ===
  if (eventIdStr) {
    let mainId = "";
    let coachId = "";
    try {
      const parsed = JSON.parse(eventIdStr);
      mainId = parsed.main || "";
      coachId = parsed.coach || "";
    } catch(e) {
      mainId = eventIdStr; // Legacy: plain string = main ID only
    }

    if (mainId && calendar) {
      try {
        const ev = calendar.getEventById(mainId);
        if (ev) { ev.deleteEvent(); mainDeleted = true; }
      } catch (err) {}
    }

    if (coachId && coachCalendar) {
      try {
        const coachEv = coachCalendar.getEventById(coachId);
        if (coachEv) { coachEv.deleteEvent(); coachDeleted = true; }
      } catch (err) {}
    }
  }

  // === Layer 2: Fallback search by date/time/name ===
  // ใช้เมื่อ: ไม่มี Event ID, ID ผิด, หรือ legacy booking ที่ไม่มี coachId
  if ((!mainDeleted || !coachDeleted) && dateStr && slotStr) {
    try {
      // Parse date (yyyy-MM-dd)
      const dateParts = dateStr.split('-');
      if (dateParts.length !== 3) return;
      const year = parseInt(dateParts[0], 10);
      const month = parseInt(dateParts[1], 10) - 1;
      const day = parseInt(dateParts[2], 10);

      // Parse time slot (e.g. "17:00 - 18:00")
      const timeParts = slotStr.split(' - ');
      if (timeParts.length !== 2) return;
      const startH = parseInt(timeParts[0].split(':')[0], 10);
      const startM = parseInt(timeParts[0].split(':')[1], 10);
      const endH = parseInt(timeParts[1].split(':')[0], 10);
      const endM = parseInt(timeParts[1].split(':')[1], 10);

      const startTime = new Date(year, month, day, startH, startM, 0);
      const endTime = new Date(year, month, day, endH, endM, 0);
      const customerName = String(name || "").trim();

      // Fallback search: Main calendar
      if (!mainDeleted && calendar) {
        try {
          const events = calendar.getEvents(startTime, endTime);
          for (let j = 0; j < events.length; j++) {
            const ev = events[j];
            // Match exact start/end time AND customer name in title
            if (ev.getStartTime().getTime() === startTime.getTime() &&
                ev.getEndTime().getTime() === endTime.getTime()) {
              const title = ev.getTitle() || "";
              if (!customerName || title.indexOf(customerName) !== -1) {
                ev.deleteEvent();
                mainDeleted = true;
                logError("CALENDAR_FALLBACK", "deleteGoogleCalendarEvent",
                  "Fallback deleted MAIN event: \"" + title + "\" on " + dateStr + " " + slotStr, "INFO");
                break;
              }
            }
          }
        } catch (err) {}
      }

      // Fallback search: Coach calendar
      if (!coachDeleted && coachCalendar) {
        try {
          const events = coachCalendar.getEvents(startTime, endTime);
          for (let j = 0; j < events.length; j++) {
            const ev = events[j];
            if (ev.getStartTime().getTime() === startTime.getTime() &&
                ev.getEndTime().getTime() === endTime.getTime()) {
              const title = ev.getTitle() || "";
              if (!customerName || title.indexOf(customerName) !== -1) {
                ev.deleteEvent();
                coachDeleted = true;
                logError("CALENDAR_FALLBACK", "deleteGoogleCalendarEvent",
                  "Fallback deleted COACH event: \"" + title + "\" on " + dateStr + " " + slotStr, "INFO");
                break;
              }
            }
          }
        } catch (err) {}
      }
    } catch (err) {
      logError("CALENDAR_FALLBACK_ERROR", "deleteGoogleCalendarEvent",
        "Fallback search failed: " + (err.message || err), "ERROR");
    }
  }
}

// ==========================================
// BACKUP & LOGGING & UTILITIES
// ==========================================
function handleBackup(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Server busy." })).setMimeType(ContentService.MimeType.JSON);
  }
  
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let tempBookingSheet = null;
  let originalBookingSheet = spreadsheet.getSheetByName("Bookings");

  try {
    const backupData = data.data || data.bookings || [];
    if (!Array.isArray(backupData) || backupData.length === 0) {
      return ContentService.createTextOutput(JSON.stringify({ 
        status: "error", 
        message: "No booking data provided for backup." 
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const tempSheetName = "Bookings_Temp_" + Date.now();
    tempBookingSheet = spreadsheet.insertSheet(tempSheetName);
    
    const headers = [
      "Booking ID", "Date", "Time Slot", "Customer Name", "Phone", 
      "Email", "Court", "Require Coach", "Fee", "Invoice No", 
      "Receipt No", "Slip URL", "LINE User ID", "LINE ID Input", "Customer Notes", "Admin Notes", "Calendar Event ID", "Created At",
      "Bank", "Sender Name", "Slip Amount", "Ref No", "Transfer Time", "Slip Status"
    ];
    tempBookingSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    const rows = [];
    const nowIso = new Date().toISOString();
    backupData.forEach(function(item) {
      rows.push([
        item.id || "",
        item.date || "",
        item.slot || "",
        item.name || "",
        item.phone || "",
        item.email || "",
        item.court || "Main Court",
        item.requireCoach ? "Yes" : "No",
        item.fee || 0,
        item.invoiceNo || "",
        item.receiptNo || "",
        item.slipUrl || "",
        item.lineUserId || "",
        item.lineIdInput || "",
        item.customerNotes || "",
        item.adminNotes || "",
        item.calendarEventId || "",
        item.createdAt || nowIso,
        item.bank || "",
        item.senderName || "",
        item.slipAmount || 0,
        item.refNo || "",
        item.transferTime || "",
        item.slipStatus || ""
      ]);
    });
    tempBookingSheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    
    const archiveSheetName = "Bookings_Archive_" + Date.now();
    if (originalBookingSheet) {
      originalBookingSheet.setName(archiveSheetName);
    }
    tempBookingSheet.setName("Bookings");
    
    if (originalBookingSheet) {
      try { spreadsheet.deleteSheet(originalBookingSheet); } catch (delErr) {}
    }
    
    return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Backup completed.", totalRows: backupData.length })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    try {
      if (tempBookingSheet) spreadsheet.deleteSheet(tempBookingSheet);
      if (originalBookingSheet && originalBookingSheet.getName() !== "Bookings") {
        originalBookingSheet.setName("Bookings");
      }
    } catch (rollbackErr) {}
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Backup failed: " + err.toString() })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    try { lock.releaseLock(); } catch(err) {}
  }
}
}

function handleLogAdminAction(data) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let logSheet = spreadsheet.getSheetByName("AdminLogs");
  if (!logSheet) {
    logSheet = spreadsheet.insertSheet("AdminLogs");
    logSheet.getRange(1, 1, 1, 5).setValues([["Timestamp", "Action Type", "Customer Name", "Phone", "Details"]]);
  }
  logSheet.appendRow([new Date(), data.actionType || "Unknown", data.name || "-", data.phone || "-", data.details || "-"]);
  return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
}

function handleGetAdminLogs(data) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const logSheet = spreadsheet.getSheetByName("AdminLogs");
  if (!logSheet || logSheet.getLastRow() <= 1) {
    return ContentService.createTextOutput(JSON.stringify({ status: "success", logs: [] })).setMimeType(ContentService.MimeType.JSON);
  }
  const lastRow = logSheet.getLastRow();
  const startRow = Math.max(2, lastRow - 99);
  const values = logSheet.getRange(startRow, 1, lastRow - startRow + 1, 5).getValues();
  const logs = [];
  for (let i = values.length - 1; i >= 0; i--) {
    logs.push({
      timestamp: String(values[i][0]),
      actionType: String(values[i][1] || ""),
      name: String(values[i][2] || ""),
      phone: String(values[i][3] || ""),
      details: String(values[i][4] || "")
    });
  }
  return ContentService.createTextOutput(JSON.stringify({ status: "success", logs: logs })).setMimeType(ContentService.MimeType.JSON);
}

function handleGetExistingBookings() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName("Bookings");
  if (!sheet || sheet.getLastRow() <= 1) {
    return ContentService.createTextOutput(JSON.stringify({ status: "success", bookings: [] })).setMimeType(ContentService.MimeType.JSON);
  }
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 18).getValues();
  const bookings = [];
  data.forEach(function(row) {
    let dateStr = (row[1] instanceof Date) ? Utilities.formatDate(row[1], Session.getScriptTimeZone(), "yyyy-MM-dd") : String(row[1] || "").trim();
    if (dateStr) {
      bookings.push({
        id: row[0],
        date: dateStr,
        slot: String(row[2] || "").trim(),
        name: String(row[3] || "").trim(),
        phone: String(row[4] || "").trim(),
        court: String(row[6] || "Main Court").trim(),
        requireCoach: (String(row[7]).toLowerCase() === "yes" || row[7] === true),
        receiptNo: String(row[10] || "").trim(),
        calendarEventId: String(row[16] || "").trim()
      });
    }
  });
  return ContentService.createTextOutput(JSON.stringify({ status: "success", bookings: bookings })).setMimeType(ContentService.MimeType.JSON);
}

function getBookingsIndexMap(sheet) {
  const lastRow = sheet.getLastRow();
  const uuidRowMap = {};
  const dateCourtSlotMap = {};
  if (lastRow <= 1) return { uuidRowMap: uuidRowMap, dateCourtSlotMap: dateCourtSlotMap };
  const data = sheet.getRange(2, 1, lastRow - 1, 17).getValues();
  for (let i = 0; i < data.length; i++) {
    const rowNum = i + 2;
    const uuid = String(data[i][0] || "").trim();
    let dateStr = (data[i][1] instanceof Date) ? Utilities.formatDate(data[i][1], Session.getScriptTimeZone(), "yyyy-MM-dd") : String(data[i][1] || "").trim();
    const slotStr = String(data[i][2] || "").trim();
    const courtStr = String(data[i][6] || "Main Court").trim();
    if (uuid) uuidRowMap[uuid] = rowNum;
    if (dateStr && slotStr) {
      const key = getNormalizedBookingKey(dateStr, courtStr, slotStr);
      dateCourtSlotMap[key] = { row: rowNum, uuid: uuid, eventId: String(data[i][16] || "").trim() };
    }
  }
  return { uuidRowMap: uuidRowMap, dateCourtSlotMap: dateCourtSlotMap };
}

function generateSlotId(bookingKey, dateStr, courtStr, slotStr) {
  const cleanCourt = String(courtStr).replace(/[^a-zA-Z0-9]/g, "");
  const cleanSlot = String(slotStr).replace(/[^a-zA-Z0-9-:]/g, "");
  return bookingKey + "_" + dateStr + "_" + cleanCourt + "_" + cleanSlot;
}

function isBookingDuplicate(indexMap, dateStr, courtStr, slotStr) {
  const key = getNormalizedBookingKey(dateStr, courtStr, slotStr);
  return !!indexMap.dateCourtSlotMap[key];
}

function getSlotFee(slotStr) {
  if (!slotStr) return OFF_PEAK_PRICE;
  const startHour = parseInt(slotStr.split(':')[0], 10);
  if (isNaN(startHour)) return OFF_PEAK_PRICE;
  if (startHour >= 16 && startHour < 23) return PEAK_PRICE;
  return OFF_PEAK_PRICE;
}

function formatDateString(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const thaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  return day + " " + thaiMonths[month] + " " + (year + 543);
}

function logError(errorType, functionName, detailMessage, severity) {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    let logSheet = spreadsheet.getSheetByName("Error_Logs");
    if (!logSheet) {
      logSheet = spreadsheet.insertSheet("Error_Logs");
      logSheet.getRange(1, 1, 1, 5).setValues([["Timestamp", "Severity", "Error Type", "Function", "Details"]]);
    }
    logSheet.appendRow([new Date().toISOString(), severity || "ERROR", errorType || "General Error", functionName || "Unknown", detailMessage || ""]);
  } catch(e) {}
}

function checkRateLimit(data) {
  const clientKey = data.clientFingerprint || data.phone || "anonymous";
  const cache = CacheService.getScriptCache();
  const cacheKey = "rate_limit_" + clientKey;
  const currentCount = parseInt(cache.get(cacheKey) || "0", 10);
  if (currentCount >= 15) {
    return "Too many requests. Please try again later.";
  }
  cache.put(cacheKey, (currentCount + 1).toString(), 60);
  return null;
}
// ========================================================
// 🎾 SMART AI CHATBOT ENGINE (LINE + GEMINI AI + FAQ SHEET + NO_REPLY)
// ========================================================

/**
 * ฟังก์ชันหลักในการรับข้อความจาก LINE Webhook และสั่งการ AI ตอบคำถาม
 */
function handleLineAiWebhook(data) {
  try {
    const events = data.events || [];
    
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      
      // ดักเฉพาะข้อความที่เป็น Text จากลูกค้า
      if (event.type === "message" && event.message && event.message.type === "text") {
        const replyToken = event.replyToken;
        const userMessage = String(event.message.text || "").trim();
        
        // ข้ามกรณีเป็น Token ทดสอบจากปุ่ม Verify ของ LINE Developers
        if (!replyToken || replyToken === "00000000000000000000000000000000" || replyToken === "ffffffffffffffffffffffffffffffff") {
          continue;
        }

        // 1. อ่านข้อมูลคู่มือสนาม (ข้อความ + ลิงก์รูป + ลิงก์ PDF) จากแท็บ "FAQ"
        const faqKnowledge = getFaqKnowledge();
        
        // 2. ให้ Gemini AI ประมวลผลคำตอบ
        const aiReply = askGeminiAi(userMessage, faqKnowledge);
        
        // 3. ถ้าไม่ใช่คำถาม AI จะคืนค่าว่างกลับมา -> บอทจะไม่ส่งข้อความกวนใจคนคุยกัน
        if (aiReply && aiReply.trim() !== "") {
          replyLineMessage(replyToken, aiReply);
        }
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    logError("Line AI Webhook Error", "handleLineAiWebhook", err.toString(), "ERROR");
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * ดึงข้อมูลความรู้ทั้งหมดจากแท็บ FAQ (รองรับ 4 คอลัมน์: A=คำถาม, B=คำตอบ, C=รูปภาพ, D=PDF)
 */
function getFaqKnowledge() {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName("FAQ");
    if (!sheet) return "";
    
    const lastRow = sheet.getLastRow();
    if (lastRow < 1) return "";
    
    const data = sheet.getRange(1, 1, lastRow, Math.max(sheet.getLastColumn(), 4)).getValues();
    let knowledge = "";
    
    for (let r = 0; r < data.length; r++) {
      const colA = String(data[r][0] || "").trim();
      const colB = String(data[r][1] || "").trim();
      const colC = String(data[r][2] || "").trim();
      const colD = String(data[r][3] || "").trim();
      
      if (colA || colB) {
        knowledge += "- หัวข้อ: " + colA + " | ข้อมูล: " + colB;
        if (colC) knowledge += " | แนบรูป: " + colC;
        if (colD) knowledge += " | แนบPDF: " + colD;
        knowledge += "\n";
      }
    }
    return knowledge;
  } catch (err) {
    logError("Get FAQ Knowledge Error", "getFaqKnowledge", err.toString(), "WARNING");
    return "";
  }
}

/**
 * แปลงลิงก์ Google Drive ให้เป็น Direct Image Link ที่ LINE โหลดภาพขึ้น 100%
 */
function formatDriveImageUrl(url) {
  if (!url) return "";
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return "https://lh3.googleusercontent.com/d/" + match[1];
  }
  return url;
}

/**
 * ส่งคำถามและคู่มือไปให้ Google Gemini AI ประมวลผล (กรองตอบเฉพาะที่เป็นคำถามจริง)
 */
function askGeminiAi(userMessage, faqKnowledge) {
  const apiKey = getCleanScriptProperty("GEMINI_API_KEY");
  if (!apiKey) {
    return "";
  }

  const systemInstruction = 
    "คุณคือ 'น้องสแลมมี่' AI เลขา(ผู้หญิง)ผู้ช่วยของคุณบาส แห่งสนามเทนนิส 'The Grand Slam'\n" +
    "หน้าที่สำคัญที่สุดของคุณคือ: 'ตอบเฉพาะข้อความที่เป็นคำถามเท่านั้น โดยตอบให้ชัดเจนครอบคลุมภายในคำตอบเดียวให้ลูกค้าเข้าใจไม่ต้องถามเรื่องเดิมเพิ่ม หรือต้องการข้อมูลเกี่ยวกับสนามเทนนิสเท่านั้น'\n\n" +
    "⚠️ กฎเหล็กในการแยกแยะข้อความ:\n" +
    "1. หากข้อความ 'ไม่ใช่คำถาม' (เช่น คุยเล่น, ตอบรับสั้นๆ, ทักทายคนในแชท, รายงานดินฟ้าอากาศ, พูดคุยกับแอดมิน เช่น 'ตกล่ะ', 'ขาวมาเลย', 'ใช่พี่', 'ของคุณ joy ยก นะพี่', 'โอเค', '555', 'ครับ', 'อ่า', 'ได้เลย' และคำพูดอื่นๆที่ลูกค้าพูดเฉยๆไม่ใช่คำถาม หรือพิมพ์เรื่องเดิมซ้ำจากคำถามก่อนหน้าไม่ต้องตอบซ้ำ'):\n" +
    "   -> ให้ตอบคำว่า '[NO_REPLY]' เพียงคำเดียวเท่านั้น ห้ามตอบข้อความอื่นเด็ดขาด!\n" +
    "2. หากเป็นคำถามเกี่ยวกับสนามเทนนิส (เช่น ถามราคา, เวลาเปิดปิด, คอร์สเรียน, ขอแผนที่, คิวว่าง, ขอเลื่อนการจอง):\n" +
    "   -> ให้ตอบคำถามโดยอ้างอิงจากคู่มือ FAQ ด้านล่างนี้เป็นหลัก:\n" +
    (faqKnowledge || "ไม่มีข้อมูลในคู่มือ") + "\n\n" +
    "3. หากเป็นคำถามเกี่ยวกับสนามที่ไม่มีในคู่มือ FAQ: ให้ตอบอย่างสุภาพว่า 'ในส่วนนี้ขออนุญาตส่งต่อเรื่องให้แอดมินตรวจสอบข้อมูลก่อนนะครับ เดี๋ยวแอดมินจะรีบติดต่อกลับครับ'\n" +
    "4. หากข้อมูลในคู่มือมี 'แนบรูป:' หรือ 'แนบPDF:' ที่ตรงกับคำถาม ให้ใส่แท็ก [IMAGE: ลิงก์รูป] หรือ [PDF: ลิงก์PDF] ต่อท้ายคำตอบ\n" +
    "5. รักษาความยาวของคำตอบให้กระชับ ครบถ้วน อ่านง่ายบนหน้าจอมือถือ และถ้าเห็นว่าคำถามใกล้เคียงกับของเดิมไม่ต้องตอบรอให้แอดมินมาตอบเอง\n" +
    "6. ทุกข้อความที่ตอบ (ยกเว้น [NO_REPLY]) ให้ขึ้นบรรทัดใหม่แล้วลงท้ายด้วย: '\n\n(ตอบกลับอัตโนมัติโดยน้องสแลมมี่)' เสมอ";

  const payload = {
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    },
    contents: [
      {
        role: "user",
        parts: [{ text: userMessage }]
      }
    ],
    generationConfig: {
      temperature: 0.2, // ลดความฟุ้งซ่านเพื่อให้แยกแยะคำถามได้แม่นยำ
      maxOutputTokens: 1000
    }
  };

  const models = [
    "gemini-3.1-flash-lite",
    "gemini-3.6-flash"
  ];

  let lastError = "";

  for (let m = 0; m < models.length; m++) {
    const modelName = models[m];
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + modelName + ":generateContent?key=" + apiKey;

    try {
      const response = UrlFetchApp.fetch(url, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });

      const resCode = response.getResponseCode();
      const resText = response.getContentText();

      if (resCode === 200) {
        const resJson = JSON.parse(resText);
        if (resJson.candidates && resJson.candidates.length > 0 && resJson.candidates[0].content) {
          let reply = resJson.candidates[0].content.parts[0].text.trim();
          
          // หาก AI ประเมินว่าไม่ใช่คำถาม ให้คืนค่าว่างเพื่อไม่ส่งข้อความหาลูกค้า
          if (reply.includes("[NO_REPLY]")) {
            return "";
          }
          
          if (!reply.includes("น้องสแลมมี่")) {
            reply += "\n\n(ตอบกลับอัตโนมัติโดยน้องสแลมมี่)";
          }
          return reply;
        }
      }

      lastError = modelName + " (HTTP " + resCode + "): " + resText;
      if (resCode === 503 || resCode === 429 || resCode === 404) {
        continue;
      } else {
        break;
      }
    } catch (err) {
      lastError = modelName + " Error: " + err.toString();
    }
  }

  logError("Gemini AI All Models Failed", "askGeminiAi", lastError, "ERROR");
  return ""; // ไม่ส่งข้อความรบกวนเมื่อเกิด error เพื่อไม่ให้ขัดจังหวะคนคุยกัน
}

/**
 * ส่งข้อความตอบกลับหาลูกค้าผ่าน LINE Reply API (รองรับทั้งข้อความ, รูปลอยในแชท, และลิงก์ PDF)
 */
function replyLineMessage(replyToken, messageText) {
  if (!LINE_CHANNEL_ACCESS_TOKEN || !replyToken || !messageText || messageText.trim() === "") return;

  const messages = [];

  // 1. สกัดตรวจหาแท็กรูปภาพ [IMAGE: url]
  let imageUrl = "";
  const imgMatch = messageText.match(/\[IMAGE:\s*([^\s\]]+)\]/i);
  if (imgMatch) {
    imageUrl = formatDriveImageUrl(imgMatch[1].trim());
    messageText = messageText.replace(imgMatch[0], "").trim();
  }

  // 2. สกัดตรวจหาแท็ก PDF [PDF: url]
  let pdfUrl = "";
  const pdfMatch = messageText.match(/\[PDF:\s*([^\s\]]+)\]/i);
  if (pdfMatch) {
    pdfUrl = pdfMatch[1].trim();
    messageText = messageText.replace(pdfMatch[0], "").trim();
  }

  // บอลลูนที่ 1: ข้อความคำตอบของน้องสแลมมี่
  if (messageText) {
    messages.push({
      type: "text",
      text: messageText
    });
  }

  // บอลลูนที่ 2: รูปลอยในแชท (ถ้าคำตอบนั้นมีรูป)
  if (imageUrl) {
    messages.push({
      type: "image",
      originalContentUrl: imageUrl,
      previewImageUrl: imageUrl
    });
  }

  // บอลลูนที่ 3: ไฟล์ PDF (ถ้าคำตอบนั้นมีเอกสาร PDF)
  if (pdfUrl) {
    messages.push({
      type: "text",
      text: "📄 เอกสารแนบ (แตะเพื่อเปิดดูหรือดาวน์โหลดได้เลยครับ):\n" + pdfUrl
    });
  }

  if (messages.length === 0) return;

  const url = "https://api.line.me/v2/bot/message/reply";
  const payload = {
    replyToken: replyToken,
    messages: messages
  };

  try {
    UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: {
        "Authorization": "Bearer " + LINE_CHANNEL_ACCESS_TOKEN
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (err) {
    logError("LINE Reply API Error", "replyLineMessage", err.toString(), "ERROR");
  }
}
