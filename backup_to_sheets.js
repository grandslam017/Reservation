// ==========================================
// CONFIGURATION (ตั้งค่าการเชื่อมต่อ)
// ==========================================
const scriptProperties = PropertiesService.getScriptProperties();

// โหลดรหัส LINE Channel Access Token - Throw error if missing
const LINE_CHANNEL_ACCESS_TOKEN = scriptProperties.getProperty("LINE_CHANNEL_ACCESS_TOKEN");
if (!LINE_CHANNEL_ACCESS_TOKEN) {
  throw new Error("CRITICAL: LINE_CHANNEL_ACCESS_TOKEN is missing in Script Properties.");
}

// ไอดี LINE ส่วนตัวของแอดมินสำหรับส่งรูปสลิป - Throw error if missing
const ADMIN_LINE_USER_ID = scriptProperties.getProperty("ADMIN_LINE_USER_ID");
if (!ADMIN_LINE_USER_ID) {
  throw new Error("CRITICAL: ADMIN_LINE_USER_ID is missing in Script Properties.");
}

// อีเมลปฏิทินของโค้ช - Throw error if missing
const COACH_CALENDAR_ID = scriptProperties.getProperty("COACH_CALENDAR_ID");
if (!COACH_CALENDAR_ID) {
  throw new Error("CRITICAL: COACH_CALENDAR_ID is missing in Script Properties.");
}

// คีย์รหัสสำหรับตรวจสอบความปลอดภัยของ Webhook (HMAC Secret) - Throw error if missing
const WEBHOOK_SECRET = scriptProperties.getProperty("WEBHOOK_SECRET");
if (!WEBHOOK_SECRET) {
  throw new Error("CRITICAL: WEBHOOK_SECRET is missing in Script Properties.");
}

// อีเมลปฏิทินหลัก (MAIN_CALENDAR_ID) - เลือกกรอกได้ หากว่างจะใช้ปฏิทินเริ่มต้น (Default Calendar)
const MAIN_CALENDAR_ID = scriptProperties.getProperty("MAIN_CALENDAR_ID");

// การตั้งค่าราคาเช่าสนามผ่าน Script Properties
const OFF_PEAK_PRICE = parseFloat(scriptProperties.getProperty("OFF_PEAK_PRICE") || "250");
const PEAK_PRICE = parseFloat(scriptProperties.getProperty("PEAK_PRICE") || "350");

// รายชื่อสนามที่ได้รับอนุญาต (Whitelisted Courts)
const VALID_COURTS = ["Main Court"];

// ฟังก์ชันสร้างคีย์จองและตรวจเช็คชนกันแบบมาตรฐาน (Normalized Booking Key)
function getNormalizedBookingKey(dateStr, courtStr, slotStr) {
  return [
    String(dateStr || "").trim(),
    String(courtStr || "").trim().toUpperCase(),
    String(slotStr || "").trim()
  ].join("_");
}

// ฟังก์ชันบันทึกและตรวจสอบ Nonce ผ่านชีต Nonces เพื่อป้องกัน Replay Attack อย่างถาวร
function checkAndSaveNonce(nonce) {
  if (!nonce) return false;
  const cleanNonce = nonce.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!cleanNonce) return false;
  
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let nonceSheet = spreadsheet.getSheetByName("Nonces");
  if (!nonceSheet) {
    nonceSheet = spreadsheet.insertSheet("Nonces");
    nonceSheet.getRange(1, 1, 1, 2).setValues([["Nonce", "Timestamp"]]);
  }
  
  const lastRow = nonceSheet.getLastRow();
  const now = Date.now();
  
  // ล้าง Nonce เก่า (ที่มีอายุเกิน 10 นาที) เพื่อไม่ให้ชีตขยายขนาดมากเกินไป
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
  
  // ตรวจสอบเช็คว่ามี nonce นี้อยู่แล้วหรือไม่
  const freshLastRow = nonceSheet.getLastRow();
  if (freshLastRow > 1) {
    const nonces = nonceSheet.getRange(2, 1, freshLastRow - 1, 1).getValues().map(function(r) { return String(r[0]); });
    if (nonces.indexOf(cleanNonce) !== -1) {
      return false; // พบการ replay!
    }
  }
  
  // บันทึก nonce ใหม่ลงชีต
  nonceSheet.appendRow([cleanNonce, new Date()]);
  return true;
}

// ==========================================
// CORE WEB APP GATEWAY (รับ Request จากระบบจอง)
// ==========================================
function doPost(e) {
  try {
    const rawContent = e.postData.contents;
    const data = JSON.parse(rawContent);
    
    // 5. ป้องกันสแปมด้วยระบบจำกัดคำสั่งจอง (Rate Limiting)
    const rateLimitError = checkRateLimit(data);
    if (rateLimitError) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: rateLimitError }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // 2. ตรวจสอบความปลอดภัย Webhook (HMAC Signature & Timestamp Verification)
    const clientSignature = data.signature;
    const clientTimestamp = data.timestamp;
    const clientNonce = data.nonce;
    
    if (!clientSignature || !clientTimestamp || !clientNonce) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Unauthorized: Missing signature, timestamp, or nonce." }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // ตรวจสอบ Replay Attack (ตรวจเช็ค nonce ซ้ำซ้อนอย่างปลอดภัยโดยใช้ Lock ร่วมกับ Nonce Sheet)
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(5000);
      const nonceValid = checkAndSaveNonce(clientNonce);
      if (!nonceValid) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Replay attack detected (duplicate nonce)." }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    } catch(lockErr) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Server busy. Failed to verify nonce." }))
        .setMimeType(ContentService.MimeType.JSON);
    } finally {
      try {
        lock.releaseLock();
      } catch(e) {}
    }
    
    // ตรวจสอบ Replay Attack (ต้องส่งคำขอในเวลาไม่เกิน 5 นาที)
    if (Math.abs(Date.now() - parseInt(clientTimestamp, 10)) > 5 * 60 * 1000) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Request expired (timestamp skew too high)." }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // ถอดและประกอบโครงสร้างข้อมูลเพื่อตรวจสอบลายเซ็นแบบ Deterministic
    const unsignedData = {...data};
    delete unsignedData.signature;
    const sortedData = sortObjectKeys(unsignedData);
    const rawUnsigned = JSON.stringify(sortedData);
    
    const verified = verifyHMACSignature(rawUnsigned, clientSignature, WEBHOOK_SECRET);
    if (!verified) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Unauthorized: Invalid signature." }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // 9. ตรวจสอบความถูกต้องของข้อมูล (Input Validation)
    const valError = validateInput(data);
    if (valError) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Validation failed: " + valError }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    let response;
    // เลือกประมวลผลตามแอ็กชันที่กำหนด
    if (data.action === "sendConfirmation") {
      response = handleSendConfirmation(data);
    } else if (data.action === "cancelBooking") {
      response = handleCancelBooking(data);
    } else if (data.action === "updateNotes") {
      response = handleUpdateNotes(data);
    } else if (data.action === "uploadLedgerSlip") {
      response = handleUploadLedgerSlip(data);
    } else if (data.action === "backup") {
      response = handleBackup(data);
    } else {
      response = handleBackup(data);
    }
    
    return response;
  } catch (error) {
    logError("Runtime doPost Error", "doPost", error.toString(), "CRITICAL");
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Constant-Time String Comparison Helper (Timing Attack Protection)
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  var result = 0;
  for (var i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ยืนยันลายเซ็น HMAC SHA-256 ร่วมกับการเปรียบเทียบค่าแบบ Timing-Safe
function verifyHMACSignature(message, clientSignature, secret) {
  if (!clientSignature) return false;
  try {
    const byteSignature = Utilities.computeHmacSignature(
      Utilities.MacAlgorithm.HMAC_SHA_256,
      message,
      secret,
      Utilities.Charset.UTF_8
    );
    const serverSignature = byteSignature.map(function(byte) {
      return ('0' + (byte & 0xFF).toString(16)).slice(-2);
    }).join('');
    return safeCompare(serverSignature, clientSignature);
  } catch (e) {
    logError("Signature Verification Error", "verifyHMACSignature", e.toString(), "WARNING");
    return false;
  }
}

// 5. ป้องกันสแปมด้วยระบบจำกัดคำสั่งจอง (Rate Limiting) แยกตามประเภท Action ผ่าน CacheService
function checkRateLimit(data) {
  if (data.action === "backup") {
    return null;
  }
  
  const cache = CacheService.getScriptCache();
  // ข้อมูลลูกค้าทั้งหมดได้รับการลงลายเซ็น HMAC ป้องกันการปลอมแปลงค่า
  const identifier = data.lineUserId || data.phone || data.email || data.clientFingerprint || "anonymous";
  
  let limit = 5; // ค่าเริ่มต้นสำหรับการจอง (sendConfirmation)
  if (data.action === "cancelBooking") {
    limit = 10;
  } else if (data.action === "updateNotes" || data.action === "uploadLedgerSlip") {
    limit = 20;
  } else {
    limit = 10; // ค่าเริ่มต้นทั่วไป
  }
  
  const cleanAction = String(data.action || "default").replace(/[^a-zA-Z0-9_]/g, "");
  const cleanId = identifier.replace(/[^a-zA-Z0-9_]/g, "");
  const cacheKey = "rate_" + cleanAction + "_" + cleanId;
  const countStr = cache.get(cacheKey);
  
  if (countStr) {
    const count = parseInt(countStr, 10);
    if (count >= limit) {
      return "Rate limit exceeded for " + data.action + ". Please wait 1 minute.";
    }
    cache.put(cacheKey, String(count + 1), 60);
  } else {
    cache.put(cacheKey, "1", 60);
  }
  return null;
}

// ตัวจัดเรียงคีย์ออบเจกต์แบบ Deterministic สำหรับลายเซ็น
function sortObjectKeys(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return obj;
  }
  const sorted = {};
  Object.keys(obj).sort().forEach(function(key) {
    sorted[key] = sortObjectKeys(obj[key]);
  });
  return sorted;
}

// Helper ตรวจสอบรูปแบบและขอบเขตชั่วโมงเวลาบริการ
function isValidTimeSlot(slotStr) {
  const match = slotStr.match(/^(\d{2}):(\d{2}) - (\d{2}):(\d{2})$/);
  if (!match) return false;
  
  const startHour = parseInt(match[1], 10);
  const startMin = parseInt(match[2], 10);
  const endHour = parseInt(match[3], 10);
  const endMin = parseInt(match[4], 10);
  
  // ตรวจสอบชั่วโมงสนามเปิดให้บริการ (08:00 - 23:00)
  if (startHour < 8 || startHour > 22) return false;
  if (endHour < 9 || endHour > 23) return false;
  if (startMin !== 0 && startMin !== 30) return false;
  if (endMin !== 0 && endMin !== 30) return false;
  
  const startVal = startHour * 60 + startMin;
  const endVal = endHour * 60 + endMin;
  
  return startVal < endVal; // ตรวจให้แน่ใจว่าเวลาเริ่มก่อนเวลาสิ้นสุด
}

// 9 & 10. ฟังก์ชันคัดกรองข้อมูลนำเข้าอย่างเคร่งครัด (Strict Input Validation)
function validateInput(data) {
  if (!data.action) return "Missing action.";
  
  if (data.action === "sendConfirmation" || data.action === "cancelBooking" || data.action === "updateNotes") {
    if (!data.date || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
      return "Invalid date format (expected YYYY-MM-DD).";
    }
  }
  
  if (data.action === "sendConfirmation") {
    if (!data.name || data.name.trim().length === 0) return "Name is required.";
    if (!data.phone || !/^[0-9\-\+\s]{9,15}$/.test(data.phone)) return "Invalid phone number format.";
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return "Invalid email format.";
    if (!data.slots || !Array.isArray(data.slots) || data.slots.length === 0) return "At least one time slot is required.";
    if (data.court && VALID_COURTS.indexOf(data.court) === -1) {
      return "Invalid court selection: " + data.court;
    }
    
    // ตรวจสอบความถูกต้องของสล็อตเวลาอย่างระมัดระวัง
    for (let i = 0; i < data.slots.length; i++) {
      if (!isValidTimeSlot(data.slots[i])) {
        return "Invalid time slot values or chronologically incorrect: " + data.slots[i];
      }
    }
    
    // ตรวจสอบรูปแบบ invoiceNo และ receiptNo
    if (data.invoiceNo && !/^INV\.\d{9}$/.test(data.invoiceNo)) {
      return "Invalid invoice format. Expected 'INV.YYYYMMNNN' (9 digits).";
    }
    if (data.receiptNo && !/^R\.\d{9}$/.test(data.receiptNo)) {
      return "Invalid receipt format. Expected 'R.YYYYMMNNN' (9 digits).";
    }
  }
  
  if (data.action === "cancelBooking" || data.action === "updateNotes") {
    if (!data.slot || !isValidTimeSlot(data.slot)) {
      return "Invalid time slot format or bounds: " + data.slot;
    }
    if (data.court && VALID_COURTS.indexOf(data.court) === -1) {
      return "Invalid court selection: " + data.court;
    }
  }
  
  return null;
}

// 13. บันทึกข้อผิดพลาดเข้าชีต Logs (เฉพาะระดับวิกฤต CRITICAL เท่านั้นเพื่อกันโควตาการเขียนเต็ม)
function logError(type, functionName, errorDescription, severity) {
  const currentSeverity = severity || "CRITICAL";
  
  if (currentSeverity === "CRITICAL") {
    console.error("[" + type + "] in " + functionName + ": " + errorDescription);
  } else {
    console.warn("[" + type + "] in " + functionName + ": " + errorDescription);
  }
  
  // บันทึกเข้าชีตเฉพาะเคสวิกฤต
  if (currentSeverity !== "CRITICAL") {
    return;
  }
  
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    let logSheet = spreadsheet.getSheetByName("Logs");
    if (!logSheet) {
      logSheet = spreadsheet.insertSheet("Logs");
      const headers = ["Timestamp", "Execution ID", "Type", "Function", "Description"];
      logSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
    
    // จำกัดขนาดล็อกชีตไม่เกิน 1,000 แถว
    const lastRow = logSheet.getLastRow();
    if (lastRow >= 1000) {
      logSheet.deleteRows(2, 200); 
    }
    
    let executionId = "";
    try {
      executionId = ScriptApp.getExecutionInfo().getExecutionId();
    } catch(err) {
      executionId = Utilities.getUuid();
    }
    const timestamp = new Date();
    
    logSheet.getRange(logSheet.getLastRow() + 1, 1, 1, 5).setValues([[
      timestamp,
      executionId,
      type,
      functionName,
      errorDescription
    ]]);
  } catch (e) {
    console.error("CRITICAL: Failed to write log to sheet: " + e.toString());
  }
}

// สร้างดัชนีชั่วคราวในเมมโมรี (In-Memory Index Map) หลีกเลี่ยงความซับซ้อนของการวนซ้ำอ่าน API หลายรอบ O(N)
// รองรับการทำงาน Multi-Court โดยใช้คีย์ผสม date_court_slot
function getBookingsIndexMap(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { dateSlotMap: {}, uuidRowMap: {} };
  
  const values = sheet.getRange(2, 1, lastRow - 1, 17).getValues();
  const dateSlotMap = {};
  const uuidRowMap = {};
  
  for (let i = 0; i < values.length; i++) {
    const rowNum = i + 2;
    const statusVal = String(values[i][16] || "").trim();
    if (statusVal === "CANCELLED") {
      continue; // ข้ามรายการจองที่ถูกยกเลิกแล้ว (Soft Deleted)
    }
    
    const uuid = String(values[i][0] || "").trim();
    const dateVal = values[i][1];
    const slot = String(values[i][2] || "").trim();
    const court = String(values[i][6] || "Main Court").trim(); // คอลัมน์ที่ 7 คือ Court (สนาม)
    
    let dateStr = "";
    if (dateVal instanceof Date) {
      dateStr = Utilities.formatDate(dateVal, Session.getScriptTimeZone(), "yyyy-MM-dd");
    } else {
      dateStr = String(dateVal);
    }
    
    // แปลงคีย์สนามและเวลาให้เป็นตัวใหญ่ตัดเศษขอบเขตเดียวกัน (Normalized Key)
    const key = getNormalizedBookingKey(dateStr, court, slot);
    dateSlotMap[key] = rowNum;
    
    if (uuid) {
      if (uuidRowMap[uuid]) {
        throw new Error("Duplicate UUID detected in Bookings sheet: '" + uuid + "' at rows " + uuidRowMap[uuid] + " and " + rowNum);
      }
      uuidRowMap[uuid] = rowNum;
    }
  }
  
  return { dateSlotMap: dateSlotMap, uuidRowMap: uuidRowMap };
}

// 3 & 4. อัปโหลดไฟล์สลิปขึ้น Drive คัดกรองและ Re-encode ป้องกันมัลแวร์
function handleUploadLedgerSlip(data) {
  if (!data.fileData || !data.mimeType || !data.fileName) {
    throw new Error("Missing file data parameters.");
  }
  
  const approxSize = data.fileData.length * 0.75;
  if (approxSize > 1024 * 1024) {
    throw new Error("File size exceeds 1MB limit.");
  }
  
  // ตรวจเช็คความถูกต้องของนามสกุลไฟล์นำเข้า (Strict Extension matching)
  const extMatch = data.fileName.match(/\.([^.]+)$/);
  if (!extMatch) {
    throw new Error("Security Error: Uploaded file has no extension.");
  }
  const ext = extMatch[1].toLowerCase();
  if (ext !== "png" && ext !== "jpg" && ext !== "jpeg") {
    throw new Error("Security Error: Invalid file extension.");
  }
  
  const decoded = Utilities.base64Decode(data.fileData);
  
  // ตรวจสอบ Magic Numbers
  const magicError = validateMagicNumbers(decoded, data.mimeType);
  if (magicError) {
    throw new Error(magicError);
  }
  
  // ทำการ Re-encode รูปภาพผ่าน Google Web Engine เพื่อถอดล้างข้อมูลแฝง (EXIF/Steganography Malware)
  let sanitizedBlob;
  try {
    const rawBlob = Utilities.newBlob(decoded, data.mimeType, data.fileName);
    sanitizedBlob = rawBlob.getAs(MimeType.PNG); // บีบอัดแปลงเป็น PNG สะอาด
    sanitizedBlob.setName(data.fileName.replace(/\.[^.]+$/, ".png")); // อัปเดตนามสกุล
  } catch(e) {
    throw new Error("Security Error: Failed to re-encode and sanitize the image. File might be corrupted or malicious.");
  }
  
  const folderName = data.folderName || "Slip บันทึกรายรับ - รายจ่าย";
  let folder;
  const folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = DriveApp.createFolder(folderName);
  }
  
  const file = folder.createFile(sanitizedBlob);
  try {
    file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  } catch (err) {
    console.warn("Failed to set file sharing to PRIVATE: " + err.toString());
  }
  
  return ContentService.createTextOutput(JSON.stringify({ 
    status: "success", 
    fileUrl: file.getUrl() 
  })).setMimeType(ContentService.MimeType.JSON);
}

function validateMagicNumbers(byteArray, declaredMime) {
  if (!byteArray || byteArray.length < 8) {
    return "Security Error: File payload is too small.";
  }
  
  const byte0 = byteArray[0] & 0xFF;
  const byte1 = byteArray[1] & 0xFF;
  const byte2 = byteArray[2] & 0xFF;
  const byte3 = byteArray[3] & 0xFF;
  const byte4 = byteArray[4] & 0xFF;
  const byte5 = byteArray[5] & 0xFF;
  const byte6 = byteArray[6] & 0xFF;
  const byte7 = byteArray[7] & 0xFF;
  
  // ตรวจสอบเช็ค 8 ไบต์ตามมาตรฐานสากลของ PNG
  const isPNG = (byte0 === 137 && byte1 === 80 && byte2 === 78 && byte3 === 71 &&
                 byte4 === 13 && byte5 === 10 && byte6 === 26 && byte7 === 10);
                 
  // ตรวจสอบเช็คหัวไฟล์ (FF D8 FF) และท้ายไฟล์ (FF D9) ของ JPEG Standard
  const isJPEGStandardStart = (byte0 === 255 && byte1 === 216 && byte2 === 255);
  const lastIndex = byteArray.length - 1;
  const isJPEGStandardEnd = ((byteArray[lastIndex - 1] & 0xFF) === 255 && (byteArray[lastIndex] & 0xFF) === 217);
  const isJPEGStandard = isJPEGStandardStart && isJPEGStandardEnd;
  
  let isJPEG2000 = false;
  if (byte0 === 0 && byte1 === 0 && byte2 === 0 && byte3 === 12 && byte4 === 106 && byte5 === 80) {
    isJPEG2000 = true;
  }
  
  const isJPEG = isJPEGStandard || isJPEG2000;
  const mimeLower = declaredMime.toLowerCase();
  
  if (isPNG) {
    if (mimeLower !== "image/png") {
      return "Security Error: MIME mismatch (expected image/png for PNG magic number).";
    }
    return null;
  }
  
  if (isJPEG) {
    if (mimeLower !== "image/jpeg" && mimeLower !== "image/jpg") {
      return "Security Error: MIME mismatch (expected image/jpeg or image/jpg for JPEG magic number).";
    }
    return null;
  }
  
  return "Security Error: Uploaded file is not a valid PNG or JPEG image (magic numbers check failed).";
}

// ตัวสร้าง Booking Key ID แบบเฉพาะตัวคัดแยกตามสนามและวันเวลา ป้องกันปัญหาการสลับตำแหน่งอาเรย์ตอน Retry
function generateSlotId(bookingKey, dateStr, court, slotStr) {
  const cleanCourt = String(court).replace(/[^a-zA-Z0-9]/g, "");
  const cleanSlot = String(slotStr).replace(/[^a-zA-Z0-9-:]/g, "");
  return bookingKey + "_" + dateStr + "_" + cleanCourt + "_" + cleanSlot;
}

// 6 & 7 & 8. จัดการส่งการยืนยันจอง (พร้อมกลไกป้องกันจองซ้ำ Idempotency Key, Batch Calendar IDs, และระบบ Rollback)
function handleSendConfirmation(data) {
  const name = data.name;
  const phone = data.phone;
  const email = data.email;
  const dateStr = data.date;
  const slots = data.slots || [];
  const invoiceNo = data.invoiceNo;
  const receiptNo = data.receiptNo;
  const lineUserId = data.lineUserId;
  const requireCoach = data.requireCoach === true || data.requireCoach === "true";
  const bookingKey = data.bookingKey || "";
  const court = data.court || "Main Court";
  
  const formattedDate = formatDateString(dateStr);
  const warnings = [];
  
  // 1. กรองสล็อตเวลาซ้ำภายในคำขอเดียวกัน (Same-request slot deduplication)
  const uniqueSlots = [];
  const slotSeen = {};
  slots.forEach(function(slot) {
    if (slot && !slotSeen[slot]) {
      slotSeen[slot] = true;
      uniqueSlots.push(slot);
    }
  });
  
  if (uniqueSlots.length === 0) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "No unique time slots provided." }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  // A. ขอบเขตการล็อคขนาดเล็ก (Micro-Lock Scope) เฉพาะตรวจสอบสล็อตว่างและจองแถว
  const lock = LockService.getScriptLock();
  let lockReleased = false;
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
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    bookingSheet = spreadsheet.getSheetByName("Bookings");
    if (!bookingSheet) {
      bookingSheet = spreadsheet.insertSheet("Bookings");
      const headers = ["ID", "Date", "Time Slot", "Customer", "Phone", "Email", "Court", "Require Coach", "Fee", "Invoice No", "Receipt No", "Slip URL", "LINE User ID", "Car Plate", "Reminder Sent", "Admin Notes", "Calendar Event ID"];
      bookingSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
    
    // ดึงดัชนีข้อมูลจองเดิมใน memory
    indexMap = getBookingsIndexMap(bookingSheet);
    
    // 2. ตรวจสอบเช็ค BookingKey ระดับทั้งรายการจองเพื่อป้องกันธุรกรรมซ้ำอย่างถูกต้อง
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
    
    // ตรวจสอบเช็คจองซ้ำข้ามสนาม (Multi-Court check)
    const duplicates = [];
    uniqueSlots.forEach(function(slot) {
      if (isBookingDuplicate(indexMap, dateStr, court, slot)) {
        duplicates.push(slot);
      }
    });
    
    if (duplicates.length > 0) {
      throw new Error("DUPLICATE_BOOKINGS:" + duplicates.join(", "));
    }
    
    // เขียนข้อมูลการจองลงชีต (Batch Write)
    const newRows = [];
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
        email || "",
        court,
        requireCoach ? "Yes" : "No",
        fee,
        invoiceNo || "",
        receiptNo || "",
        data.slipUrl || "",
        lineUserId || "",
        data.lineIdInput || "",
        "", 
        "", 
        "PENDING"  // ป้องกันการเกิด Partial Booking โดยกำหนดสถานะเริ่มต้นในปฏิทินเป็น PENDING
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
    if (!lockReleased) {
      try {
        lock.releaseLock();
      } catch (err) {
        console.warn("Finally block lock release warning: " + err.toString());
      }
      lockReleased = true;
    }
  }
  
  // B. บันทึกกิจกรรมปฏิทิน Google Calendar อัตโนมัติ (พร้อมกลไกโยน Exception และ Rollback แถว Sheets อัตโนมัติหากสร้างไม่ครบทุกสล็อต)
  let calendarEventIds = [];
  try {
    calendarEventIds = createGoogleCalendarEvents(name, phone, dateStr, uniqueSlots, receiptNo, requireCoach, court);
    
    // อัปเดตข้อมูล Event IDs แบบคำสั่งเดียว (Contiguous Batch Write) โดยเก็บเป็นโครงสร้าง JSON
    const calendarValues = calendarEventIds.map(function(id) { return [id]; });
    bookingSheet.getRange(lastRow + 1, 17, calendarValues.length, 1).setValues(calendarValues);
  } catch (e) {
    logError("Calendar Creation Failure - Initiating ROLLBACK", "handleSendConfirmation", e.toString(), "CRITICAL");
    
    // Rollback 1: ปรับแก้ข้อมูลแถวจองใน Sheets ให้เป็น "CANCELLED" แทนการเรียกลบแถวป้องกัน Row Shifting
    try {
      if (bookingSheet && lastRow > 0) {
        const cancelledValues = uniqueSlots.map(function() { return ["CANCELLED"]; });
        bookingSheet.getRange(lastRow + 1, 17, cancelledValues.length, 1).setValues(cancelledValues);
      }
    } catch(sheetErr) {
      logError("Rollback Sheets Status Failure", "handleSendConfirmation", sheetErr.toString(), "CRITICAL");
    }
    
    // Rollback 2: ลบปฏิทินที่สร้างเสร็จบางส่วน
    calendarEventIds.forEach(function(eventId) {
      if (eventId) {
        try {
          deleteGoogleCalendarEvent("", dateStr, "", eventId);
        } catch(calErr) {
          logError("Rollback Calendar Delete Failure", "handleSendConfirmation", calErr.toString(), "CRITICAL");
        }
      }
    });
    
    return ContentService.createTextOutput(JSON.stringify({ 
      status: "error", 
      message: "Booking failed due to calendar synchronization error. Rolled back." 
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  // C. แจ้งเตือนลูกค้าและแอดมิน (Warnings are caught and logged, not failing the transaction)
  let emailSent = false;
  if (email) {
    try {
      sendEmailConfirmation(email, name, formattedDate, uniqueSlots, invoiceNo, receiptNo, requireCoach);
      emailSent = true;
    } catch (e) {
      logError("Email Send Error", "sendEmailConfirmation", e.toString(), "WARNING");
      warnings.push("Email send failed: " + e.toString());
    }
  }
  
  let lineSent = false;
  if (lineUserId && LINE_CHANNEL_ACCESS_TOKEN) {
    try {
      sendLineMessageConfirmation(lineUserId, name, formattedDate, uniqueSlots, receiptNo, requireCoach);
      lineSent = true;
    } catch (e) {
      logError("LINE User Notification Error", "sendLineMessageConfirmation", e.toString(), "WARNING");
      warnings.push("LINE user push failed: " + e.toString());
    }
  }
  
  let adminLineSent = false;
  if (ADMIN_LINE_USER_ID && ADMIN_LINE_USER_ID !== "ใส่_LINE_USER_ID_ส่วนตัวของแอดมิน_ที่นี่" && LINE_CHANNEL_ACCESS_TOKEN) {
    try {
      const slipUrl = data.slipUrl || "";
      sendAdminSlipNotification(name, formattedDate, uniqueSlots, receiptNo, slipUrl, requireCoach);
      adminLineSent = true;
    } catch (e) {
      logError("Admin LINE Notification Error", "sendAdminSlipNotification", e.toString(), "WARNING");
      warnings.push("Admin LINE alert failed: " + e.toString());
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify({ 
    status: warnings.length === 0 ? "success" : "warning", 
    warnings: warnings,
    emailSent: emailSent,
    lineSent: lineSent,
    calendarCreated: calendarEventIds.length > 0,
    sheetSaved: uuids.length > 0
  })).setMimeType(ContentService.MimeType.JSON);
}

// ตรวจสอบเช็คว่ามีแถวบันทึกจองนี้อยู่แล้วในชีตหรือไม่โดยใช้ตำแหน่งสนามและวัน-เวลา
function isBookingDuplicate(indexMap, dateStr, courtStr, slotStr) {
  const key = getNormalizedBookingKey(dateStr, courtStr, slotStr);
  return !!indexMap.dateSlotMap[key];
}

// 6. จัดการการยกเลิกการจอง (แบบใช้ Micro-Lock Scope ดึงคีย์ลบปฏิทินนอกล็อค)
function handleCancelBooking(data) {
  const dateStr = data.date;
  const slotStr = data.slot;
  const courtStr = data.court || "Main Court";
  
  removeBookingFromSheet(dateStr, slotStr, courtStr);
  
  return ContentService.createTextOutput(JSON.stringify({ 
    status: "success", 
    message: "Booking cancellation processed" 
  })).setMimeType(ContentService.MimeType.JSON);
}

// ลบแถวจองสนามและการจองในปฏิทินโดยรองรับ Multi-Court (ใช้คีย์ผสมระบุตัวแถว)
function removeBookingFromSheet(dateStr, slotStr, courtStr) {
  const activeCourt = courtStr || "Main Court";
  const lock = LockService.getScriptLock();
  let lockReleased = false;
  try {
    lock.waitLock(10000);
  } catch (e) {
    logError("Lock Timeout Error", "removeBookingFromSheet", "Could not lock sheet for row deletion.", "CRITICAL");
    throw new Error("Server busy. Failed to delete booking.");
  }
  
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const bookingSheet = spreadsheet.getSheetByName("Bookings");
    if (!bookingSheet) return;
    
    // โหลด map เพื่อค้นหาตำแหน่งใน O(1)
    const indexMap = getBookingsIndexMap(bookingSheet);
    
    // ดึงคีย์สนามมาตรฐาน
    const key = getNormalizedBookingKey(dateStr, activeCourt, slotStr);
    const row = indexMap.dateSlotMap[key];
    
    if (row) {
      const eventId = bookingSheet.getRange(row, 17).getValue();
      
      // ปรับปรุงเป็น Soft Delete: เปลี่ยนสถานะแถวจองในชีตเป็น CANCELLED แทนการลบแถว
      bookingSheet.getRange(row, 17).setValue("CANCELLED");
      
      // ปลดล็อคชีตทันทีก่อนยิงลบ Google Calendar
      if (!lockReleased) {
        lock.releaseLock();
        lockReleased = true;
      }
      
      deleteGoogleCalendarEvent("", dateStr, slotStr, eventId);
      console.log("Cancelled row " + row + " (Soft Delete) and synced Calendar event.");
    }
  } catch (e) {
    logError("Delete Booking Error", "removeBookingFromSheet", e.toString(), "CRITICAL");
    throw e;
  } finally {
    if (!lockReleased) {
      try {
        lock.releaseLock();
      } catch (err) {
        console.warn("Finally lock release warning: " + err.toString());
      }
      lockReleased = true;
    }
  }
}

// 6. จัดการการอัปเดตข้อมูลลูกค้าและโน้ตแอดมิน
function handleUpdateNotes(data) {
  const name = data.name;
  const phone = data.phone;
  const email = data.email || "";
  const lineUserId = data.lineUserId || "";
  const dateStr = data.date;
  const slotStr = data.slot;
  const receiptNo = data.receiptNo;
  const requireCoach = data.requireCoach === true || data.requireCoach === "true";
  const adminNotes = data.adminNotes;
  const court = data.court || "Main Court";
  
  let eventId = "";
  
  const lock = LockService.getScriptLock();
  let lockReleased = false;
  try {
    lock.waitLock(10000);
  } catch (e) {
    logError("Lock Timeout Error", "handleUpdateNotes", "Could not lock sheet for updating note.", "CRITICAL");
    throw new Error("Server busy. Failed to update notes.");
  }
  
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const bookingSheet = spreadsheet.getSheetByName("Bookings");
    if (bookingSheet) {
      const indexMap = getBookingsIndexMap(bookingSheet);
      const key = getNormalizedBookingKey(dateStr, court, slotStr);
      const row = indexMap.dateSlotMap[key];
      
      if (row) {
        bookingSheet.getRange(row, 4).setValue(name);
        bookingSheet.getRange(row, 5).setValue(phone);
        bookingSheet.getRange(row, 6).setValue(email);
        bookingSheet.getRange(row, 8).setValue(requireCoach ? "Yes" : "No");
        bookingSheet.getRange(row, 13).setValue(lineUserId);
        bookingSheet.getRange(row, 16).setValue(adminNotes || "");
        eventId = bookingSheet.getRange(row, 17).getValue();
      }
    }
  } catch (e) {
    logError("Update Note Sheets Error", "handleUpdateNotes", e.toString(), "CRITICAL");
    throw e;
  } finally {
    if (!lockReleased) {
      try {
        lock.releaseLock();
      } catch (err) {
        console.warn("Finally lock release warning: " + err.toString());
      }
      lockReleased = true;
    }
  }
  
  updateGoogleCalendarEventNotes(name, phone, dateStr, slotStr, receiptNo, requireCoach, adminNotes, eventId);
  
  return ContentService.createTextOutput(JSON.stringify({ 
    status: "success", 
    message: "Notes update processed" 
  })).setMimeType(ContentService.MimeType.JSON);
}

// ฟังก์ชันจัดรูปแบบวันที่ (เช่น 2026-08-02 -> 02 AUG 2026)
function formatDateString(dateStr) {
  try {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const year = parts[0];
    const monthIdx = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    
    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const formattedDay = String(day).padStart(2, '0');
    const monthName = months[monthIdx] || "";
    
    return `${formattedDay} ${monthName} ${year}`;
  } catch (e) {
    return dateStr;
  }
}

// ฟังก์ชันส่งอีเมลด้วย GmailApp
function sendEmailConfirmation(recipientEmail, name, dateStr, slots, invoiceNo, receiptNo, requireCoach) {
  const subject = "ยืนยันการจองสนามสำเร็จ - The Grand Slam Tennis Court";
  const formattedSlots = slots.join(", ");
  const coachText = requireCoach ? "ต้องการโค้ช 🟢" : "ไม่ต้องการโค้ช ❌";
  
  const htmlBody = `
    <div style="font-family: 'Sarabun', sans-serif, Arial; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1a202c;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="color: #10b981; margin: 10px 0 0 0;">ยืนยันการจองสนามเทนนิสสำเร็จ</h2>
      </div>
      
      <p style="font-size: 16px;">สวัสดีคุณ <strong>${name}</strong>,</p>
      <p style="font-size: 14px; line-height: 1.6; color: #4a5568;">ระบบได้รับหลักฐานการชำระเงินและขอยืนยันการจองสนามเทนนิสของคุณเป็นที่เรียบร้อยแล้ว โดยมีรายละเอียดดังนี้:</p>
      
      <div style="background-color: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #edf2f7;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 6px 0; color: #718096; width: 40%;">หมายเลขใบเสร็จ:</td>
            <td style="padding: 6px 0; font-weight: bold; color: #10b981;">${receiptNo}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #718096;">หมายเลขใบแจ้งหนี้:</td>
            <td style="padding: 6px 0; color: #4a5568;">${invoiceNo}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #718096;">วันที่จอง:</td>
            <td style="padding: 6px 0; font-weight: bold; color: #1a202c;">${dateStr}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #718096;">ช่วงเวลาใช้บริการ:</td>
            <td style="padding: 6px 0; font-weight: bold; color: #10b981;">${formattedSlots}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #718096;">ผู้ฝึกสอน (โค้ช):</td>
            <td style="padding: 6px 0; font-weight: bold; color: #1a202c;">${coachText}</td>
          </tr>
        </table>
      </div>
      
      <p style="font-size: 14px; line-height: 1.6; color: #b45309; font-weight: bold; text-align: center; background-color: #fffbeb; padding: 12px; border: 1px solid #fef3c7; border-radius: 8px; margin: 20px 0;">
        กรณีมีความจำเป็นต้องการเลื่อน กรุณาแจ้งแอดมินล่วงหน้าอย่างน้อย 2วันนะครับ
      </p>
      
      <div style="margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
        <p style="font-size: 14px; line-height: 1.6; margin: 0; color: #718096;">ขอแสดงความนับถือ,</p>
        <p style="font-size: 14px; font-weight: bold; margin: 5px 0 0 0; color: #1a202c;">The Grand Slam Tennis Court</p>
      </div>
      
      <div style="margin-top: 30px; text-align: center; font-size: 12px; color: #a0aec0;">
        นี่เป็นระบบตอบกลับอัตโนมัติ กรุณาอย่าตอบกลับอีเมลนี้
      </div>
    </div>
  `;
  
  sendEmailWithRetry(recipientEmail, subject, htmlBody);
}

// ฟังก์ชันส่งอีเมลด้วย GmailApp พร้อมกลไกส่งซ้ำหากผิดพลาด (Retry with Exponential Backoff and Jitter)
function sendEmailWithRetry(recipientEmail, subject, htmlBody) {
  let attempt = 0;
  const retries = 3;
  while (attempt < retries) {
    try {
      GmailApp.sendEmail(recipientEmail, subject, "", {
        htmlBody: htmlBody
      });
      return;
    } catch (e) {
      attempt++;
      console.warn("GmailApp.sendEmail failed (attempt " + attempt + "): " + e.toString());
      if (attempt < retries) {
        Utilities.sleep(Math.random() * 1000 + Math.pow(2, attempt) * 1000);
      } else {
        throw e;
      }
    }
  }
}

// 14. ฟังก์ชันส่งคำสั่งเชื่อมต่อ HTTP ลองใหม่อัตโนมัติ (Retry with Exponential Backoff - กรองเฉพาะ 5xx และ 429 เท่านั้น)
function fetchWithRetry(url, options, retries = 3) {
  let attempt = 0;
  let response;
  
  const fetchOptions = {...options};
  fetchOptions.muteHttpExceptions = true;
  
  while (attempt < retries) {
    try {
      response = UrlFetchApp.fetch(url, fetchOptions);
      const code = response.getResponseCode();
      
      if (code >= 200 && code < 300) {
        return response;
      }
      
      const shouldRetry = (code >= 500 && code <= 599) || code === 429;
      if (!shouldRetry) {
        console.warn("Fetch attempt " + (attempt + 1) + " returned client error " + code + ". Breaking retry loop.");
        return response;
      }
      
      console.warn("Fetch attempt " + (attempt + 1) + " returned HTTP code " + code + ". Retrying...");
    } catch (e) {
      console.warn("Fetch attempt " + (attempt + 1) + " failed due to network error: " + e.toString());
    }
    attempt++;
    if (attempt < retries) {
      Utilities.sleep(Math.random() * 1000 + Math.pow(2, attempt) * 1000); 
    }
  }
  
  if (response) return response;
  return UrlFetchApp.fetch(url, fetchOptions);
}

// ส่งข้อความ LINE Push Message แจ้งเตือนจองสำเร็จ
function sendLineMessageConfirmation(lineUserId, name, dateStr, slots, receiptNo, requireCoach) {
  const url = "https://api.line.me/v2/bot/message/push";
  const formattedSlots = slots.join(", ");
  const coachText = requireCoach ? "ต้องการโค้ช 🟢" : "ไม่ต้องการโค้ช ❌";
  
  const textMessage = `🎾 ยืนยันการจองสนามสำเร็จ!
 
👤 คุณ: ${name}
📅 วันที่: ${dateStr}
⏰ เวลา: ${formattedSlots}
🧸 โค้ช: ${coachText}
📄 เลขที่ใบเสร็จ: ${receiptNo}
 
กรณีมีความจำเป็นต้องการเลื่อน กรุณาแจ้งแอดมินล่วงหน้าอย่างน้อย 2วันนะครับ 💚`;

  const payload = {
    to: lineUserId,
    messages: [
      {
        type: "text",
        text: textMessage
      }
    ]
  };
  
  const options = {
    method: "post",
    contentType: "application/json",
    headers: {
      "Authorization": "Bearer " + LINE_CHANNEL_ACCESS_TOKEN
    },
    payload: JSON.stringify(payload)
  };
  
  const response = fetchWithRetry(url, options);
  const code = response.getResponseCode();
  if (code !== 200) {
    throw new Error("LINE Push API failed with response code " + code + ": " + response.getContentText());
  }
  console.log("LINE API Log: Success");
}

// สร้างกิจกรรมปฏิทิน Google Calendar อัตโนมัติ โดยโยน Exception และทำ Rollback ในตัวหากสร้างไม่ครบทุกสล็อต
function createGoogleCalendarEvents(name, phone, dateStr, slots, receiptNo, requireCoach, court) {
  const activeCourt = court || "Main Court";
  const dateParts = dateStr.split('-');
  if (dateParts.length !== 3) return [];
  const year = parseInt(dateParts[0], 10);
  const month = parseInt(dateParts[1], 10) - 1;
  const day = parseInt(dateParts[2], 10);
  
  // ตั้งค่าปฏิทินหลัก
  let calendar = null;
  if (typeof MAIN_CALENDAR_ID !== "undefined" && MAIN_CALENDAR_ID) {
    try {
      calendar = CalendarApp.getCalendarById(MAIN_CALENDAR_ID);
    } catch (err) {
      console.warn("Failed to get main calendar by ID: " + err.toString());
    }
  }
  if (!calendar) {
    calendar = CalendarApp.getDefaultCalendar();
  }
  
  let coachCalendar = null;
  if (requireCoach) {
    if (typeof COACH_CALENDAR_ID === "undefined" || !COACH_CALENDAR_ID) {
      throw new Error("COACH_CALENDAR_ID is missing but requireCoach is true.");
    }
    try {
      coachCalendar = CalendarApp.getCalendarById(COACH_CALENDAR_ID);
    } catch(err) {
      throw new Error("Failed to access coach calendar: " + err.toString());
    }
    if (!coachCalendar) {
      throw new Error("Failed to access coach calendar (returned null for ID: " + COACH_CALENDAR_ID + ")");
    }
  }
  
  const eventIds = [];
  
  // โอนเปลี่ยนลูปเป็นแบบ throw exception ทันทีเมื่อเกิดการผิดพลาดสล็อตใดสล็อตหนึ่ง
  for (let i = 0; i < slots.length; i++) {
    const slotStr = slots[i];
    try {
      const timeParts = slotStr.split(' - ');
      if (timeParts.length !== 2) {
        throw new Error("Invalid time slot format: " + slotStr);
      }
      
      const startStr = timeParts[0];
      const endStr = timeParts[1];
      
      const startTime = new Date(year, month, day, parseInt(startStr.split(':')[0], 10), parseInt(startStr.split(':')[1], 10), 0);
      const endTime = new Date(year, month, day, parseInt(endStr.split(':')[0], 10), parseInt(endStr.split(':')[1], 10), 0);
      
      const icon = requireCoach ? "🧸" : "🎾";
      const title = icon + " [" + activeCourt + "] จอง: คุณ " + name + " (" + slotStr + ")";
      
      const description = "ชื่อผู้จอง: " + name + "\n" +
                          "เบอร์โทร: " + phone + "\n" +
                          "สนาม: " + activeCourt + "\n" +
                          "เวลาจอง: " + slotStr + "\n" +
                          "เลขที่ใบเสร็จ: " + receiptNo + "\n" +
                          "ต้องการผู้ฝึกสอน (โค้ช): " + (requireCoach ? "ต้องการโค้ช 🟢" : "ไม่ต้องการโค้ช ❌");
      
      const event = calendar.createEvent(title, startTime, endTime, {
        description: description
      });
      const mainEventId = event.getId();
      
      let coachEventId = "";
      if (coachCalendar) {
        const coachTitle = "🧸 [" + activeCourt + "] สอน: คุณ " + name + " (" + slotStr + ")";
        const cEvent = coachCalendar.createEvent(coachTitle, startTime, endTime, {
          description: description
        });
        coachEventId = cEvent.getId();
      }
      
      // เก็บข้อมูล Event IDs เป็นโครงสร้าง JSON
      eventIds.push(JSON.stringify({ main: mainEventId, coach: coachEventId }));
    } catch(e) {
      // ROLLBACK Local: ลบ Event ทั้งหมดที่เพิ่งถูกสร้างขึ้นมาในสายนี้ก่อนหน้านี้
      eventIds.forEach(function(createdJson) {
        if (createdJson) {
          try {
            deleteGoogleCalendarEvent("", dateStr, "", createdJson);
          } catch(err) {}
        }
      });
      throw new Error("Calendar event creation failed for slot '" + slotStr + "': " + e.toString());
    }
  }
  
  return eventIds;
}

// ช่วยคำนวณค่าบริการต่อสล็อตเวลาตามกฎช่วงเวลาโหลดผ่าน Script Properties
function getSlotFee(slotStr) {
  try {
    const startHourStr = slotStr.split(' - ')[0];
    const startHour = parseInt(startHourStr.split(':')[0], 10);
    return (startHour >= 8 && startHour < 16) ? OFF_PEAK_PRICE : PEAK_PRICE;
  } catch (e) {
    return OFF_PEAK_PRICE;
  }
}

// ลบกิจกรรมปฏิทิน Google Calendar โดยตรงจาก Event ID (รองรับการแกะโครงสร้าง JSON)
function deleteGoogleCalendarEvent(name, dateStr, slotStr, eventIdStr) {
  let calendar = null;
  if (typeof MAIN_CALENDAR_ID !== "undefined" && MAIN_CALENDAR_ID) {
    try {
      calendar = CalendarApp.getCalendarById(MAIN_CALENDAR_ID);
    } catch (err) {
      console.warn("Failed to get main calendar by ID: " + err.toString());
    }
  }
  if (!calendar) {
    calendar = CalendarApp.getDefaultCalendar();
  }

  if (eventIdStr) {
    let mainId = "";
    let coachId = "";
    
    try {
      const parsed = JSON.parse(eventIdStr);
      mainId = parsed.main || "";
      coachId = parsed.coach || "";
    } catch(e) {
      // โหมดเข้ากันได้ย้อนหลัง (Fallback)
      if (eventIdStr.indexOf('|') !== -1) {
        const parts = eventIdStr.split('|');
        mainId = parts[0];
        coachId = parts[1];
      } else {
        mainId = eventIdStr;
      }
    }
    
    if (mainId) {
      try {
        const ev = calendar.getEventById(mainId);
        if (ev) ev.deleteEvent();
      } catch (err) {
        console.warn("Failed to delete main event by ID: " + err.toString());
      }
    }
    if (coachId && typeof COACH_CALENDAR_ID !== "undefined" && COACH_CALENDAR_ID) {
      try {
        const coachCalendar = CalendarApp.getCalendarById(COACH_CALENDAR_ID);
        if (coachCalendar) {
          const ev = coachCalendar.getEventById(coachId);
          if (ev) ev.deleteEvent();
        }
      } catch (err) {
        console.warn("Failed to delete coach event by ID: " + err.toString());
      }
    }
    return;
  }

  // Fallback
  try {
    const dateParts = dateStr.split('-');
    if (dateParts.length !== 3) return;
    const year = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10) - 1;
    const day = parseInt(dateParts[2], 10);
    
    const timeParts = slotStr.split(' - ');
    if (timeParts.length !== 2) return;
    
    const startStr = timeParts[0];
    const endStr = timeParts[1];
    
    const startTime = new Date(year, month, day, parseInt(startStr.split(':')[0], 10), parseInt(startStr.split(':')[1], 10), 0);
    const endTime = new Date(year, month, day, parseInt(endStr.split(':')[0], 10), parseInt(endStr.split(':')[1], 10), 0);
    
    const searchStart = new Date(startTime.getTime() - 15 * 60 * 1000);
    const searchEnd = new Date(endTime.getTime() + 15 * 60 * 1000);
    
    calendar.getEvents(searchStart, searchEnd).forEach(function(event) {
      const title = event.getTitle();
      if (title.indexOf(name) !== -1 && (title.indexOf("จองสนาม") !== -1)) {
        event.deleteEvent();
      }
    });

    if (typeof COACH_CALENDAR_ID !== "undefined" && COACH_CALENDAR_ID) {
      try {
        const coachCalendar = CalendarApp.getCalendarById(COACH_CALENDAR_ID);
        if (coachCalendar) {
          coachCalendar.getEvents(searchStart, searchEnd).forEach(function(event) {
            const title = event.getTitle();
            if (title.indexOf(name) !== -1 && (title.indexOf("สอนเทนนิส") !== -1)) {
              event.deleteEvent();
            }
          });
        }
      } catch(err) {
        console.error("Failed to delete coach calendar event: " + err.toString());
      }
    }
  } catch (e) {
    console.error("Failed to delete Calendar event fallback: " + e.toString());
  }
}

// อัปเดตกิจกรรมปฏิทิน Google Calendar ด้วย Event ID (รองรับโครงสร้างแบบ JSON)
function updateGoogleCalendarEventNotes(name, phone, dateStr, slotStr, receiptNo, requireCoach, adminNotes, eventIdStr) {
  let calendar = null;
  if (typeof MAIN_CALENDAR_ID !== "undefined" && MAIN_CALENDAR_ID) {
    try {
      calendar = CalendarApp.getCalendarById(MAIN_CALENDAR_ID);
    } catch (err) {
      console.warn("Failed to get main calendar by ID: " + err.toString());
    }
  }
  if (!calendar) {
    calendar = CalendarApp.getDefaultCalendar();
  }

  const description = "ชื่อผู้จอง: " + name + "\n" +
                      "เบอร์โทร: " + phone + "\n" +
                      "เวลาจอง: " + slotStr + "\n" +
                      "เลขที่ใบเสร็จ: " + receiptNo + "\n" +
                      "ต้องการผู้ฝึกสอน (โค้ช): " + (requireCoach ? "ต้องการโค้ช 🟢" : "ไม่ต้องการโค้ช ❌") + "\n" +
                      "โน้ตเพิ่มเติมจากแอดมิน: " + (adminNotes || "-");

  let mainId = "";
  let coachId = "";
  if (eventIdStr) {
    try {
      const parsed = JSON.parse(eventIdStr);
      mainId = parsed.main || "";
      coachId = parsed.coach || "";
    } catch(e) {
      if (eventIdStr.indexOf('|') !== -1) {
        const parts = eventIdStr.split('|');
        mainId = parts[0];
        coachId = parts[1];
      } else {
        mainId = eventIdStr;
      }
    }
    
    if (mainId) {
      try {
        const ev = calendar.getEventById(mainId);
        if (ev) {
          const icon = requireCoach ? "🧸" : "🎾";
          ev.setTitle(icon + " จองสนาม: คุณ " + name + " (" + slotStr + ")");
          ev.setDescription(description);
        }
      } catch (err) {
        console.warn("Failed to update main calendar event by ID: " + err.toString());
      }
    }
    if (typeof COACH_CALENDAR_ID !== "undefined" && COACH_CALENDAR_ID) {
      try {
        const coachCalendar = CalendarApp.getCalendarById(COACH_CALENDAR_ID);
        if (coachCalendar) {
          if (coachId) {
            const ev = coachCalendar.getEventById(coachId);
            if (ev) {
              if (requireCoach) {
                ev.setTitle("🧸 สอนเทนนิส: คุณ " + name + " (" + slotStr + ")");
                ev.setDescription(description);
              } else {
                ev.deleteEvent();
              }
            }
          } else if (requireCoach) {
            const dp = dateStr.split('-');
            const tp = slotStr.split(' - ');
            const st = new Date(parseInt(dp[0],10), parseInt(dp[1],10)-1, parseInt(dp[2],10), parseInt(tp[0].split(':')[0],10), parseInt(tp[0].split(':')[1],10), 0);
            const et = new Date(parseInt(dp[0],10), parseInt(dp[1],10)-1, parseInt(dp[2],10), parseInt(tp[1].split(':')[0],10), parseInt(tp[1].split(':')[1],10), 0);
            coachCalendar.createEvent("🧸 สอนเทนนิส: คุณ " + name + " (" + slotStr + ")", st, et, { description: description });
          }
        }
      } catch (err) {
        console.warn("Failed to update/create coach calendar event by ID: " + err.toString());
      }
    }
    return;
  }

  // Fallback
  try {
    const dateParts = dateStr.split('-');
    if (dateParts.length !== 3) return;
    const year = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10) - 1;
    const day = parseInt(dateParts[2], 10);
    
    const timeParts = slotStr.split(' - ');
    if (timeParts.length !== 2) return;
    
    const startStr = timeParts[0];
    const endStr = timeParts[1];
    
    const startTime = new Date(year, month, day, parseInt(startStr.split(':')[0], 10), parseInt(startStr.split(':')[1], 10), 0);
    const endTime = new Date(year, month, day, parseInt(endStr.split(':')[0], 10), parseInt(endStr.split(':')[1], 10), 0);
    
    const searchStart = new Date(startTime.getTime() - 15 * 60 * 1000);
    const searchEnd = new Date(endTime.getTime() + 15 * 60 * 1000);
    
    calendar.getEvents(searchStart, searchEnd).forEach(function(event) {
      const title = event.getTitle() || "";
      const desc = event.getDescription() || "";
      const isMatch = (receiptNo && desc.indexOf(receiptNo) !== -1) || (name && title.indexOf(name) !== -1);
      
      if (isMatch && (title.indexOf("จองสนาม") !== -1)) {
        const icon = requireCoach ? "🧸" : "🎾";
        event.setTitle(icon + " จองสนาม: คุณ " + name + " (" + slotStr + ")");
        event.setDescription(description);
      }
    });

    if (typeof COACH_CALENDAR_ID !== "undefined" && COACH_CALENDAR_ID) {
      try {
        const coachCalendar = CalendarApp.getCalendarById(COACH_CALENDAR_ID);
        if (coachCalendar) {
          const coachEvents = coachCalendar.getEvents(searchStart, searchEnd);
          let coachEvent = null;
          
          coachEvents.forEach(function(event) {
            const title = event.getTitle() || "";
            const desc = event.getDescription() || "";
            const isMatch = (receiptNo && desc.indexOf(receiptNo) !== -1) || (name && title.indexOf(name) !== -1);
            
            if (isMatch && title.indexOf("สอนเทนนิส") !== -1) {
              coachEvent = event;
            }
          });
          
          if (requireCoach) {
            if (!coachEvent) {
              const coachTitle = "🧸 สอนเทนนิส: คุณ " + name + " (" + slotStr + ")";
              coachCalendar.createEvent(coachTitle, startTime, endTime, {
                description: description
              });
            } else {
              const coachTitle = "🧸 สอนเทนนิส: คุณ " + name + " (" + slotStr + ")";
              coachEvent.setTitle(coachTitle);
              coachEvent.setDescription(description);
            }
          } else {
            if (coachEvent) {
              coachEvent.deleteEvent();
            }
          }
        }
      } catch(err) {
        console.error("Failed to sync coach calendar during update notes: " + err.toString());
      }
    }
  } catch (e) {
    console.error("Failed to update Calendar event notes fallback: " + e.toString());
  }
}

// 5. ซิงก์ข้อมูลแบบปลอดภัยสูงสุดโดยใช้ระบบ Atomic Swap Swapping พร้อมการโรลแบ็คคืนค่าสลับชื่อชีตเดิมหากล้มเหลว
function handleBackup(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    logError("Lock Timeout Error", "handleBackup", "Could not lock sheet for backup operations.", "CRITICAL");
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Server busy. Please try again." }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let tempBookingSheet = null;
  let tempTxSheet = null;
  
  try {
    const bookings = data.bookings || [];
    tempBookingSheet = spreadsheet.insertSheet("Bookings_Temp");
    
    // เขียนหัวตารางคอลัมน์ (Batch write)
    const headers = ["ID", "Date", "Time Slot", "Customer", "Phone", "Email", "Court", "Require Coach", "Fee", "Invoice No", "Receipt No", "Slip URL", "LINE User ID", "Car Plate", "Reminder Sent", "Admin Notes", "Calendar Event ID"];
    tempBookingSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    const bookingRows = bookings.map(function(b) {
      return [
        b.id,
        b.date,
        b.slot,
        b.name,
        b.phone,
        b.email || "",
        b.court || "Main Court",
        b.requireCoach ? "Yes" : "No",
        parseFloat(b.fee) || 0,
        b.invoiceNo || "",
        b.receiptNo || "",
        b.slipUrl || "",
        b.lineUserId || "",
        b.lineIdInput || "",
        b.reminderSent || "",
        b.adminNotes || "",
        b.calendarEventId || ""
      ];
    });
    
    if (bookingRows.length > 0) {
      tempBookingSheet.getRange(2, 1, bookingRows.length, bookingRows[0].length).setValues(bookingRows);
    }
  } catch (e) {
    if (tempBookingSheet) {
      try { spreadsheet.deleteSheet(tempBookingSheet); } catch(shErr) {}
    }
    logError("Backup Bookings Failure", "handleBackup", e.toString(), "CRITICAL");
    if (lock.hasLock()) lock.releaseLock();
    throw new Error("Bookings backup failed: " + e.toString());
  }
  
  try {
    const transactions = data.transactions || [];
    tempTxSheet = spreadsheet.insertSheet("Transactions_Temp");
    
    // เขียนหัวตารางคอลัมน์ (Batch write)
    const headers = ["ID", "Date", "Type", "Category", "Amount", "Description"];
    tempTxSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    const txRows = transactions.map(function(t) {
      return [t.id, t.date, t.type, t.category, t.amount, t.description];
    });
    
    if (txRows.length > 0) {
      tempTxSheet.getRange(2, 1, txRows.length, txRows[0].length).setValues(txRows);
    }
  } catch (e) {
    if (tempBookingSheet) {
      try { spreadsheet.deleteSheet(tempBookingSheet); } catch(shErr) {}
    }
    if (tempTxSheet) {
      try { spreadsheet.deleteSheet(tempTxSheet); } catch(shErr) {}
    }
    logError("Backup Transactions Failure", "handleBackup", e.toString(), "CRITICAL");
    if (lock.hasLock()) lock.releaseLock();
    throw new Error("Transactions backup failed: " + e.toString());
  }
  
  // สลับชื่อชีต (Atomic Swap) พร้อมลบประวัติ Old เดิมที่มีอยู่ก่อนหน้าออกก่อนเปลี่ยนชื่อเพื่อป้องกันชื่อชนล้มเหลว
  let bookingsSwapped = false;
  let transactionsSwapped = false;
  
  try {
    const oldBookingSheet = spreadsheet.getSheetByName("Bookings");
    if (oldBookingSheet) {
      const existingOld = spreadsheet.getSheetByName("Bookings_Old");
      if (existingOld) {
        spreadsheet.deleteSheet(existingOld);
      }
      oldBookingSheet.setName("Bookings_Old");
      tempBookingSheet.setName("Bookings");
      bookingsSwapped = true;
    } else {
      tempBookingSheet.setName("Bookings");
      bookingsSwapped = true;
    }
    
    const oldTxSheet = spreadsheet.getSheetByName("Transactions");
    if (oldTxSheet) {
      const existingOld = spreadsheet.getSheetByName("Transactions_Old");
      if (existingOld) {
        spreadsheet.deleteSheet(existingOld);
      }
      oldTxSheet.setName("Transactions_Old");
      tempTxSheet.setName("Transactions");
      transactionsSwapped = true;
    } else {
      tempTxSheet.setName("Transactions");
      transactionsSwapped = true;
    }
    
    // หากสลับสำเร็จและไม่มีปัญหาคัดแยก ให้ทำการลบชีตเก่าออก
    if (oldBookingSheet) {
      const sheetToDelete = spreadsheet.getSheetByName("Bookings_Old");
      if (sheetToDelete) spreadsheet.deleteSheet(sheetToDelete);
    }
    if (oldTxSheet) {
      const sheetToDelete = spreadsheet.getSheetByName("Transactions_Old");
      if (sheetToDelete) spreadsheet.deleteSheet(sheetToDelete);
    }
  } catch(swapErr) {
    logError("Backup Swapping Failure - Initiating ROLLBACK", "handleBackup", swapErr.toString(), "CRITICAL");
    
    // ทำ Rollback เปลี่ยนชื่อกู้คืนชีตหลักกลับมาทันที
    try {
      if (bookingsSwapped) {
        const activeBookings = spreadsheet.getSheetByName("Bookings");
        if (activeBookings) spreadsheet.deleteSheet(activeBookings);
        
        const oldBookings = spreadsheet.getSheetByName("Bookings_Old");
        if (oldBookings) oldBookings.setName("Bookings");
      }
      if (transactionsSwapped) {
        const activeTxs = spreadsheet.getSheetByName("Transactions");
        if (activeTxs) spreadsheet.deleteSheet(activeTxs);
        
        const oldTxs = spreadsheet.getSheetByName("Transactions_Old");
        if (oldTxs) oldTxs.setName("Transactions");
      }
    } catch(rollErr) {
      logError("Backup Swapping Rollback Failed - DATABASE CORRUPTED", "handleBackup", rollErr.toString(), "CRITICAL");
    }
    
    // ทำความสะอาดชีต temp ที่ยังคงค้างอยู่
    try {
      const tempB = spreadsheet.getSheetByName("Bookings_Temp");
      if (tempB) spreadsheet.deleteSheet(tempB);
      const tempT = spreadsheet.getSheetByName("Transactions_Temp");
      if (tempT) spreadsheet.deleteSheet(tempT);
    } catch(cleanErr) {}
    
    if (lock.hasLock()) lock.releaseLock();
    throw swapErr;
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
  
  return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Backup completed successfully" }))
    .setMimeType(ContentService.MimeType.JSON);
}

// สแกนและส่งข้อความเตือนความจำล่วงหน้าภายใน 24 ชั่วโมงทาง LINE
function checkAndSendReminders() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const bookingSheet = spreadsheet.getSheetByName("Bookings");
  if (!bookingSheet) return;
  
  const lastRow = bookingSheet.getLastRow();
  if (lastRow <= 1) return;
  
  const range = bookingSheet.getRange(2, 1, lastRow - 1, 15);
  const values = range.getValues();
  
  const now = new Date();
  const token = LINE_CHANNEL_ACCESS_TOKEN;
  
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const lineUserId = row[12];
    const reminderSent = row[14];
    
    if (reminderSent === "Yes" || !lineUserId) continue;
    
    const bookingTime = parseBookingDateTime(row[1], row[2]);
    if (!bookingTime) continue;
    
    const diffMs = bookingTime.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    
    // ส่งเตือนล่วงหน้าหากช่วงจองจวนจะถึงใน 24 ชั่วโมงข้างหน้า และไม่เลยกำหนดไปแล้ว ( diffHours <= 24.0 && diffHours > 0 )
    if (diffHours > 0 && diffHours <= 24.0) {
      const success = sendLineReminder(lineUserId, row[3], row[1], row[2], token);
      if (success) {
        bookingSheet.getRange(i + 2, 15).setValue("Yes");
      }
    }
  }
}

// ช่วยแปลงวันที่และสล็อตเวลาเป็น Date Object
function parseBookingDateTime(dateVal, slotStr) {
  try {
    let dateStr = "";
    if (dateVal instanceof Date) {
      const y = dateVal.getFullYear();
      const m = String(dateVal.getMonth() + 1).padStart(2, '0');
      const d = String(dateVal.getDate()).padStart(2, '0');
      dateStr = `${y}-${m}-${d}`;
    } else {
      dateStr = String(dateVal);
    }
    
    const parts = dateStr.split('-');
    if (parts.length !== 3) return null;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    
    const timeParts = slotStr.split(' - ');
    if (timeParts.length < 1) return null;
    const startTimeStr = timeParts[0];
    
    const hour = parseInt(startTimeStr.split(':')[0], 10);
    const min = parseInt(startTimeStr.split(':')[1], 10);
    
    return new Date(year, month, day, hour, min, 0);
  } catch(e) {
    return null;
  }
}

// ส่งการแจ้งเตือนทาง LINE 24 ชม ล่วงหน้า
function sendLineReminder(lineUserId, name, dateVal, slotStr, token) {
  if (!token) return false;
  
  const url = "https://api.line.me/v2/bot/message/push";
  let dateText = "";
  if (dateVal instanceof Date) {
    const dOpt = { day: 'numeric', month: 'short', year: 'numeric' };
    dateText = dateVal.toLocaleDateString('th-TH', dOpt);
  } else {
    dateText = dateVal;
  }
  
  const textMessage = `🔔 แจ้งเตือนการใช้บริการสนาม (ล่วงหน้า 24 ชม.)
 
📅 วันที่: ${dateText}
⏰ เวลา: ${slotStr}
📍 สถานที่: The Grand Slam Tennis Court
 
🎾เตรียมตัวให้พร้อมแล้วเจอกันพรุ่งนี้ครับ🎾`;

  const payload = {
    to: lineUserId,
    messages: [
      {
        type: "text",
        text: textMessage
      }
    ]
  };
  
  const options = {
    method: "post",
    contentType: "application/json",
    headers: {
      "Authorization": "Bearer " + token
    },
    payload: JSON.stringify(payload)
  };
  
  try {
    const response = fetchWithRetry(url, options);
    const code = response.getResponseCode();
    if (code !== 200) {
      throw new Error("LINE Push API failed with response code " + code + ": " + response.getContentText());
    }
    return true;
  } catch (e) {
    console.error("LINE reminder push failed: " + e.toString());
    return false;
  }
}

// ส่งแจ้งสลิปและข้อมูลการจองไปยังแอดมินทาง LINE
function sendAdminSlipNotification(name, dateStr, slots, receiptNo, slipUrl, requireCoach) {
  const url = "https://api.line.me/v2/bot/message/push";
  const formattedSlots = slots.join(", ");
  const coachText = requireCoach ? "ต้องการโค้ช 🟢" : "ไม่ต้องการโค้ช ❌";
  
  const textMessage = `🔔 มีรูปภาพสลิปแจ้งชำระเงินเข้ามาใหม่!
 
👤 ลูกค้า: คุณ ${name}
📅 วันที่: ${dateStr}
⏰ เวลา: ${formattedSlots}
🧸 โค้ช: ${coachText}
🧾 เลขที่ใบเสร็จ: ${receiptNo || "-"}`;

  const messages = [
    {
      type: "text",
      text: textMessage
    }
  ];
  
  if (slipUrl) {
    messages.push({
      type: "image",
      originalContentUrl: slipUrl,
      previewImageUrl: slipUrl
    });
  }
  
  const payload = {
    to: ADMIN_LINE_USER_ID,
    messages: messages
  };
  
  const options = {
    method: "post",
    contentType: "application/json",
    headers: {
      "Authorization": "Bearer " + LINE_CHANNEL_ACCESS_TOKEN
    },
    payload: JSON.stringify(payload)
  };
  
  try {
    const response = fetchWithRetry(url, options);
    const code = response.getResponseCode();
    if (code !== 200) {
      throw new Error("LINE Admin Push API failed with response code " + code + ": " + response.getContentText());
    }
  } catch(e) {
    console.error("Failed to notify admin LINE: " + e.toString());
  }
}

// GET Gateway for Testing
function doGet(e) {
  return ContentService.createTextOutput("Notification & Backup Web App is active.")
    .setMimeType(ContentService.MimeType.TEXT);
}

// ตัวดึงสิทธิ์เพื่อทดสอบระบบเมลและปฏิทิน
function testEmail() {
  const calendar = CalendarApp.getDefaultCalendar();
  console.log("ชื่อปฏิทินของคุณคือ: " + calendar.getName());
  
  GmailApp.sendEmail("grandslamcourt@gmail.com", "🎾 ทดสอบระบบอีเมลและปฏิทิน", "ยินดีด้วย! สิทธิ์การเข้าถึงปฏิทิน Google Calendar และอีเมล ได้รับการปลดล็อกแล้ว");
}