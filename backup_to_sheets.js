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
// 🤖 AI SLIP VERIFICATION & EXTRACTION (GEMINI VISION)
// ==========================================
/**
 * วิเคราะห์และอ่านข้อมูลจากสลิปโอนเงินด้วย Google Gemini Vision AI
 * ดึงข้อมูล: ธนาคาร, ชื่อผู้โอน, ยอดเงิน, รหัสอ้างอิง, วันเวลาโอน
 * ตรวจสอบความถูกต้องของยอดเงิน และตรวจจับสลิปซ้ำในระบบ Google Sheets
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
    isDuplicate: false
  };

  if (!slipUrl || typeof slipUrl !== "string" || slipUrl.indexOf("http") !== 0) {
    return result;
  }

  const apiKey = getCleanScriptProperty("GEMINI_API_KEY");
  if (!apiKey) {
    result.status = "รอตรวจสอบ (ไม่ได้ตั้งค่า GEMINI_API_KEY)";
    return result;
  }

  try {
    // 1. ดาวน์โหลดภาพสลิปและแปลงเป็น Base64
    const response = UrlFetchApp.fetch(slipUrl, {
      method: "get",
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
      result.status = "รอตรวจสอบ (ดาวน์โหลดสลิปไม่สำเร็จ)";
      return result;
    }

    const blob = response.getBlob();
    const contentType = blob.getContentType() || "image/jpeg";
    const base64Data = Utilities.base64Encode(blob.getBytes());

    // 2. เรียกใช้งาน Gemini Vision API
    const systemInstruction = 
      "คุณคือ AI ตรวจสอบสลิปการโอนเงินของสนามเทนนิส The Grand Slam\n" +
      "หน้าที่ของคุณคืออ่านข้อมูลตัวอักษรและตัวเลขจากภาพสลิปธนาคารไทยอย่างแม่นยำ และตอบกลับเฉพาะ JSON ล้วนเท่านั้น ห้ามใส่คำบรรยายอื่นและห้ามใส่ markdown code block เด็ดขาด";

    const promptText = 
      "กรุณาอ่านข้อมูลจากสลิปนี้ และตอบกลับเป็น JSON รูปแบบนี้เท่านั้น:\n" +
      "{\n" +
      '  "bank": "ชื่อธนาคารของผู้โอน เช่น กสิกรไทย, ไทยพาณิชย์, กรุงไทย, กรุงเทพ, ออมสิน, ทหารไทยธนชาต, กรุงศรี, พร้อมเพย์",\n' +
      '  "senderName": "ชื่อ-นามสกุล หรือชื่อบัญชีของผู้โอนเงิน",\n' +
      '  "amount": ตัวเลขยอดเงินที่โอนสำเร็จ (ตัวเลขทศนิยมหรือจำนวนเต็ม เช่น 250 หรือ 500.00 โดยไม่ใส่เครื่องหมายจุลภาค),\n' +
      '  "refNo": "หมายเลขอ้างอิง หรือ รหัสธุรกรรม หรือ Transaction ID หรือ Ref No.",\n' +
      '  "transferTime": "วันและเวลาที่โอนเงินตามที่ระบุในสลิป (เช่น 21 พ.ย. 69 14:30 น. หรือ 21/11/2026 14:30:00)"\n' +
      "}";

    const payload = {
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
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
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-1.5-flash"
    ];

    let geminiRawResponse = "";
    let callSuccess = false;

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

        const resCode = geminiRes.getResponseCode();
        const resText = geminiRes.getContentText();

        if (resCode === 200) {
          const resJson = JSON.parse(resText);
          if (resJson.candidates && resJson.candidates.length > 0 && resJson.candidates[0].content) {
            geminiRawResponse = resJson.candidates[0].content.parts[0].text.trim();
            callSuccess = true;
            break;
          }
        }
      } catch (callErr) {
        // ลองโมเดลถัดไป
      }
    }

    if (!callSuccess || !geminiRawResponse) {
      result.status = "รอตรวจสอบ (Gemini OCR ไม่ตอบกลับ)";
      return result;
    }

    // 3. แปลงผลลัพธ์ JSON
    let parsedData = {};
    try {
      let cleanJson = geminiRawResponse.replace(/```json/gi, "").replace(/```/g, "").trim();
      parsedData = JSON.parse(cleanJson);
    } catch (parseErr) {
      result.status = "รอตรวจสอบ (แปลงข้อมูลไม่สำเร็จ)";
      return result;
    }

    result.bank = String(parsedData.bank || "-").trim();
    result.senderName = String(parsedData.senderName || "-").trim();
    result.amount = parseFloat(parsedData.amount) || 0;
    result.refNo = String(parsedData.refNo || "-").trim();
    result.transferTime = String(parsedData.transferTime || "-").trim();

    // 4. ตรวจสอบความถูกต้องของยอดเงิน
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
      result.status = "รอตรวจสอบ (ไม่พบยอดเงินในสลิป)";
    }

    // 5. ตรวจสอบสลิปซ้ำ (Duplicate Detection) ใน Google Sheets คอลัมน์ Ref No (คอลัมน์ V / 22)
    if (bookingSheet && result.refNo && result.refNo !== "-" && result.refNo.length >= 6) {
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
    }

    return result;

  } catch (err) {
    logError("Slip Analysis Error", "analyzePaymentSlip", err.toString(), "WARNING");
    result.status = "รอตรวจสอบ (เกิดข้อผิดพลาดในการอ่านสลิป)";
    return result;
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
    let badgeText = slipAnalysis.status || "ยอดเงินตรง ✅";

    if (slipAnalysis.isDuplicate) {
      badgeBg = "#FEE2E2";
      badgeTextColor = "#DC2626";
      badgeText = "🚨 ตรวจพบสลิปซ้ำ";
    } else if (slipAnalysis.amountMatch === false && slipAnalysis.amount > 0) {
      badgeBg = "#FFF4E5";
      badgeTextColor = "#D97706";
      badgeText = "⚠️ ยอดไม่ตรง";
    } else if (slipAnalysis.status && slipAnalysis.status.indexOf("รอตรวจสอบ") !== -1) {
      badgeBg = "#F1F5F9";
      badgeTextColor = "#64748B";
      badgeText = "⏳ รอตรวจสอบ";
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
                text: "🤖 AI ตรวจสอบสลิป",
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
            contents: [
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
              }
            ]
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
