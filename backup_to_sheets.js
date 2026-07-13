// ==========================================
// CONFIGURATION (ตั้งค่าการเชื่อมต่อ)
// ==========================================
// รหัส LINE Channel Access Token ของสนามคุณ
const LINE_CHANNEL_ACCESS_TOKEN = "ROLcBgCgfSEGWtxZaUA8Ua8iZw50lnLVHQVRuDlzL9qS9xEdNNuEf7HNqj+lkFsfcOdZZ6OlnCPjVj3tB35GzbnXzlNWsarirFTPTi7Rmg+BSY4NyI/ZCIyyIkrHrzjycET91QaUMbs7wfBM/uyRcQdB04t89/1O/w1cDnyilFU=";

// ไอดี LINE ส่วนตัวของแอดมิน (ขึ้นต้นด้วย U...) สำหรับรับรูปสลิปแจ้งชำระเงิน
const ADMIN_LINE_USER_ID = "U30c55060b9041d638b7a7759eeb29876";

// ==========================================
// CORE WEB APP GATEWAY (รับ Request จากระบบจอง)
// ==========================================
function doPost(e) {
  try {
    const rawContent = e.postData.contents;
    const data = JSON.parse(rawContent);
    
    // ตรวจสอบแอ็กชันการทำงาน
    if (data.action === "sendConfirmation") {
      return handleSendConfirmation(data);
    } else if (data.action === "cancelBooking") {
      return handleCancelBooking(data);
    } else if (data.action === "updateNotes") {
      return handleUpdateNotes(data);
    } else if (data.action === "uploadLedgerSlip") {
      return handleUploadLedgerSlip(data);
    }
    
    // หากไม่ใช่การส่งแจ้งเตือน ให้ทำงานเป็นระบบสำรองข้อมูล (Backup)
    return handleBackup(data);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// จัดการการอัปโหลดไฟล์สลิปหลักฐานรายรับ-รายจ่ายไปยัง Google Drive
function handleUploadLedgerSlip(data) {
  const folderName = data.folderName || "Slip บันทึกรายรับ - รายจ่าย";
  let folder;
  const folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = DriveApp.createFolder(folderName);
  }
  
  const decoded = Utilities.base64Decode(data.fileData);
  const blob = Utilities.newBlob(decoded, data.mimeType, data.fileName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  return ContentService.createTextOutput(JSON.stringify({ 
    status: "success", 
    fileUrl: file.getUrl() 
  })).setMimeType(ContentService.MimeType.JSON);
}

// จัดการการส่งการยืนยันจองทาง Email, LINE และบันทึกปฏิทิน
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
  
  // แปลงวันที่จาก 2026-08-02 เป็น 02 AUG 2026
  const formattedDate = formatDateString(dateStr);
  
  // 1. ส่งอีเมลยืนยันหากลูกค้ากรอกอีเมล
  let emailSent = false;
  if (email) {
    try {
      sendEmailConfirmation(email, name, formattedDate, slots, invoiceNo, receiptNo);
      emailSent = true;
    } catch (e) {
      console.error("Email send failed: ", e.toString());
    }
  }
  
  // 2. ส่งข้อความ LINE หากจองผ่าน LIFF (มี lineUserId)
  let lineSent = false;
  if (lineUserId && LINE_CHANNEL_ACCESS_TOKEN) {
    try {
      sendLineMessageConfirmation(lineUserId, name, formattedDate, slots, receiptNo);
      lineSent = true;
    } catch (e) {
      console.error("LINE send failed: ", e.toString());
    }
  }
  
  // 3. บันทึกปฏิทิน Google Calendar อัตโนมัติ (ใส่หมี 🧸 หรือ ไม้เทนนิส 🎾)
  let calendarCreated = false;
  try {
    createGoogleCalendarEvents(name, phone, dateStr, slots, receiptNo, requireCoach);
    calendarCreated = true;
  } catch (e) {
    console.error("Google Calendar failed: ", e.toString());
  }

  // 4. บันทึกข้อมูลการจองลงใน Google Sheets โดยตรงทันที
  let sheetSaved = false;
  try {
    addBookingToSheet(data);
    sheetSaved = true;
  } catch (e) {
    console.error("Google Sheets direct save failed: ", e.toString());
  }

  // 5. ส่งสลิปและข้อมูลการจองไปที่ LINE ส่วนตัวของแอดมินเพื่อตรวจสอบ
  if (ADMIN_LINE_USER_ID && ADMIN_LINE_USER_ID !== "ใส่_LINE_USER_ID_ส่วนตัวของแอดมิน_ที่นี่" && LINE_CHANNEL_ACCESS_TOKEN) {
    try {
      const slipUrl = data.slipUrl || "";
      sendAdminSlipNotification(name, formattedDate, slots, receiptNo, slipUrl);
    } catch (e) {
      console.error("Admin LINE notification failed: ", e.toString());
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify({ 
    status: "success", 
    message: "Notifications processed",
    emailSent: emailSent,
    lineSent: lineSent,
    calendarCreated: calendarCreated,
    sheetSaved: sheetSaved
  })).setMimeType(ContentService.MimeType.JSON);
}

// จัดการการยกเลิกการจอง (ลบแถวชีต และลบปฏิทิน)
function handleCancelBooking(data) {
  const name = data.name;
  const dateStr = data.date;
  const slotStr = data.slot;
  
  // 1. ลบจาก Google Sheets
  removeBookingFromSheet(dateStr, slotStr);
  
  // 2. ลบจาก Google Calendar
  deleteGoogleCalendarEvent(name, dateStr, slotStr);
  
  return ContentService.createTextOutput(JSON.stringify({ 
    status: "success", 
    message: "Booking cancellation processed" 
  })).setMimeType(ContentService.MimeType.JSON);
}

// จัดการการอัปเดตโน้ตแอดมิน (เขียนทับใน Google Sheets และปฏิทิน)
function handleUpdateNotes(data) {
  const name = data.name;
  const phone = data.phone;
  const dateStr = data.date;
  const slotStr = data.slot;
  const receiptNo = data.receiptNo;
  const requireCoach = data.requireCoach === true || data.requireCoach === "true";
  const adminNotes = data.adminNotes;
  
  // 1. อัปเดตข้อมูลในชีต
  updateBookingNoteInSheet(dateStr, slotStr, adminNotes);
  
  // 2. อัปเดตข้อมูลในปฏิทิน
  updateGoogleCalendarEventNotes(name, phone, dateStr, slotStr, receiptNo, requireCoach, adminNotes);
  
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
function sendEmailConfirmation(recipientEmail, name, dateStr, slots, invoiceNo, receiptNo) {
  const subject = "ยืนยันการจองสนามสำเร็จ - The Grand Slam Tennis Court";
  const formattedSlots = slots.join(", ");
  
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
  
  GmailApp.sendEmail(recipientEmail, subject, "", {
    htmlBody: htmlBody
  });
}

// ฟังก์ชันส่ง LINE Push Message แจ้งเตือนจองสำเร็จ
function sendLineMessageConfirmation(lineUserId, name, dateStr, slots, receiptNo) {
  const url = "https://api.line.me/v2/bot/message/push";
  const formattedSlots = slots.join(", ");
  
  const textMessage = `🎾 ยืนยันการจองสนามสำเร็จ!

👤 คุณ: ${name}
📅 วันที่: ${dateStr}
⏰ เวลา: ${formattedSlots}
🧾 เลขที่ใบเสร็จ: ${receiptNo}

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
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(url, options);
  console.log("LINE API Log: " + response.getContentText());
}

// ฟังก์ชันสร้างกิจกรรมบน Google Calendar (หมี 🧸 = ต้องการโค้ช | ไม้เทนนิส 🎾 = ไม่ต้องการโค้ช)
function createGoogleCalendarEvents(name, phone, dateStr, slots, receiptNo, requireCoach) {
  const dateParts = dateStr.split('-');
  if (dateParts.length !== 3) return;
  const year = parseInt(dateParts[0], 10);
  const month = parseInt(dateParts[1], 10) - 1;
  const day = parseInt(dateParts[2], 10);
  
  const calendar = CalendarApp.getDefaultCalendar();
  
  slots.forEach(slotStr => {
    try {
      const timeParts = slotStr.split(' - ');
      if (timeParts.length !== 2) return;
      
      const startStr = timeParts[0];
      const endStr = timeParts[1];
      
      const startHour = parseInt(startStr.split(':')[0], 10);
      const startMin = parseInt(startStr.split(':')[1], 10);
      const endHour = parseInt(endStr.split(':')[0], 10);
      const endMin = parseInt(endStr.split(':')[1], 10);
      
      const startTime = new Date(year, month, day, startHour, startMin, 0);
      const endTime = new Date(year, month, day, endHour, endMin, 0);
      
      // เลือกสัญลักษณ์กิจกรรม: ต้องการโค้ช = 🧸 | ไม่ต้องการโค้ช = 🎾
      const icon = requireCoach ? "🧸" : "🎾";
      const title = icon + " จองสนาม: คุณ " + name + " (" + slotStr + ")";
      
      const description = "ชื่อผู้จอง: " + name + "\n" +
                          "เบอร์โทร: " + phone + "\n" +
                          "เวลาจอง: " + slotStr + "\n" +
                          "เลขที่ใบเสร็จ: " + receiptNo + "\n" +
                          "ต้องการผู้ฝึกสอน (โค้ช): " + (requireCoach ? "ต้องการโค้ช 🟢" : "ไม่ต้องการโค้ช ❌");
      
      calendar.createEvent(title, startTime, endTime, {
        description: description
      });
    } catch(e) {
      console.error("Calendar event failed: " + e.toString());
    }
  });
}

// บันทึกคิวจองลงแผ่นงาน Google Sheets โดยตรง ป้องกันปัญหาการซิงก์หลุด
function addBookingToSheet(data) {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    let bookingSheet = spreadsheet.getSheetByName("Bookings");
    if (!bookingSheet) {
      bookingSheet = spreadsheet.insertSheet("Bookings");
      bookingSheet.appendRow(["ID", "Date", "Time Slot", "Customer", "Phone", "Email", "Court", "Require Coach", "Fee", "Invoice No", "Receipt No", "Slip URL", "LINE User ID", "Car Plate", "Reminder Sent", "Admin Notes"]);
    }
    
    const name = data.name;
    const phone = data.phone;
    const email = data.email || "";
    const dateStr = data.date;
    const slots = data.slots || [];
    const invoiceNo = data.invoiceNo || "";
    const receiptNo = data.receiptNo || "";
    const lineUserId = data.lineUserId || "";
    const lineIdInput = data.lineIdInput || ""; // ทะเบียนรถ
    const requireCoach = data.requireCoach === true || data.requireCoach === "true";
    const slipUrl = data.slipUrl || "";
    
    slots.forEach(slot => {
      // ตรวจสอบคิวจองที่ซ้ำซ้อนกันเพื่อป้องกันการบันทึกซ้ำ
      if (isBookingDuplicate(bookingSheet, dateStr, slot)) {
        console.log("Skipping duplicate booking row: " + dateStr + " - " + slot);
        return;
      }
      
      const fee = getSlotFee(slot);
      bookingSheet.appendRow([
        "b_" + Math.random().toString(36).substr(2, 9),
        dateStr,
        slot,
        name,
        phone,
        email,
        "Main Court",
        requireCoach ? "Yes" : "No",
        fee,
        invoiceNo,
        receiptNo,
        slipUrl,
        lineUserId,
        lineIdInput, // คอลัมน์ที่ 14 (Car Plate - ทะเบียนรถ)
        "",          // คอลัมน์ที่ 15 (Reminder Sent)
        ""           // คอลัมน์ที่ 16 (Admin Notes)
      ]);
    });
  } catch (e) {
    console.error("Direct save to sheet failed: " + e.toString());
  }
}

// ช่วยคำนวณค่าบริการต่อสล็อตเวลาตามกฎช่วงเวลา (08:00 - 16:00 = 250 | นอกนั้น = 350)
function getSlotFee(slotStr) {
  try {
    const startHourStr = slotStr.split(' - ')[0];
    const startHour = parseInt(startHourStr.split(':')[0], 10);
    return (startHour >= 8 && startHour < 16) ? 250 : 350;
  } catch (e) {
    return 250;
  }
}

// ตรวจสอบเช็คว่ามีแถวบันทึกจองนี้อยู่แล้วในชีตหรือไม่
function isBookingDuplicate(sheet, dateStr, slotStr) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return false;
  
  const values = sheet.getRange(2, 2, lastRow - 1, 2).getValues(); // คอลัมน์ B (Date) และ C (Slot)
  for (let i = 0; i < values.length; i++) {
    let rowDateStr = "";
    const rowDate = values[i][0];
    const rowSlot = values[i][1];
    
    if (rowDate instanceof Date) {
      rowDateStr = Utilities.formatDate(rowDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
    } else {
      rowDateStr = String(rowDate);
    }
    
    if (rowDateStr === dateStr && rowSlot === slotStr) {
      return true;
    }
  }
  return false;
}

// ฟังก์ชันลบแถวการจองจาก Google Sheet
function removeBookingFromSheet(dateStr, slotStr) {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const bookingSheet = spreadsheet.getSheetByName("Bookings");
    if (!bookingSheet) return;
    
    const lastRow = bookingSheet.getLastRow();
    if (lastRow <= 1) return;
    
    const range = bookingSheet.getRange(2, 2, lastRow - 1, 2); // B (Date), C (Slot)
    const values = range.getValues();
    
    for (let i = values.length - 1; i >= 0; i--) {
      const rowDate = values[i][0];
      const rowSlot = values[i][1];
      
      let rowDateStr = "";
      if (rowDate instanceof Date) {
        rowDateStr = Utilities.formatDate(rowDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
      } else {
        rowDateStr = String(rowDate);
      }
      
      if (rowDateStr === dateStr && rowSlot === slotStr) {
        bookingSheet.deleteRow(i + 2);
        console.log("Deleted Google Sheet row for booking: " + dateStr + " (" + slotStr + ")");
      }
    }
  } catch (e) {
    console.error("Failed to delete sheet row: " + e.toString());
  }
}

// ฟังก์ชันลบกิจกรรมปฏิทิน Google Calendar
function deleteGoogleCalendarEvent(name, dateStr, slotStr) {
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
    
    const startHour = parseInt(startStr.split(':')[0], 10);
    const startMin = parseInt(startStr.split(':')[1], 10);
    const endHour = parseInt(endStr.split(':')[0], 10);
    const endMin = parseInt(endStr.split(':')[1], 10);
    
    const startTime = new Date(year, month, day, startHour, startMin, 0);
    const endTime = new Date(year, month, day, endHour, endMin, 0);
    
    const calendar = CalendarApp.getDefaultCalendar();
    const events = calendar.getEvents(startTime, endTime);
    
    events.forEach(event => {
      const title = event.getTitle();
      if (title.indexOf(name) !== -1 && (title.indexOf("จองสนาม") !== -1)) {
        event.deleteEvent();
        console.log("Deleted Google Calendar event: " + title);
      }
    });
  } catch (e) {
    console.error("Failed to delete Calendar event: " + e.toString());
  }
}

// อัปเดตโน้ตแอดมินลงในชีตแท็บ Bookings คอลัมน์ที่ 16
function updateBookingNoteInSheet(dateStr, slotStr, adminNotes) {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const bookingSheet = spreadsheet.getSheetByName("Bookings");
    if (!bookingSheet) return;
    
    const lastRow = bookingSheet.getLastRow();
    if (lastRow <= 1) return;
    
    const range = bookingSheet.getRange(2, 2, lastRow - 1, 2);
    const values = range.getValues();
    
    for (let i = 0; i < values.length; i++) {
      const rowDate = values[i][0];
      const rowSlot = values[i][1];
      
      let rowDateStr = "";
      if (rowDate instanceof Date) {
        rowDateStr = Utilities.formatDate(rowDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
      } else {
        rowDateStr = String(rowDate);
      }
      
      if (rowDateStr === dateStr && rowSlot === slotStr) {
        // คอลัมน์ที่ 16 คือ P (Admin Notes)
        bookingSheet.getRange(i + 2, 16).setValue(adminNotes || "");
        console.log("Updated Google Sheet note at row " + (i + 2));
      }
    }
  } catch (e) {
    console.error("Failed to update sheet note: " + e.toString());
  }
}

// ค้นหาและอัปเดตคำอธิบายเพิ่มเติม (Description) ของ Google Calendar
function updateGoogleCalendarEventNotes(name, phone, dateStr, slotStr, receiptNo, requireCoach, adminNotes) {
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
    
    const startHour = parseInt(startStr.split(':')[0], 10);
    const startMin = parseInt(startStr.split(':')[1], 10);
    const endHour = parseInt(endStr.split(':')[0], 10);
    const endMin = parseInt(endStr.split(':')[1], 10);
    
    const startTime = new Date(year, month, day, startHour, startMin, 0);
    const endTime = new Date(year, month, day, endHour, endMin, 0);
    
    const calendar = CalendarApp.getDefaultCalendar();
    const events = calendar.getEvents(startTime, endTime);
    
    events.forEach(event => {
      const title = event.getTitle();
      if (title.indexOf(name) !== -1 && (title.indexOf("จองสนาม") !== -1)) {
        const description = "ชื่อผู้จอง: " + name + "\n" +
                            "เบอร์โทร: " + phone + "\n" +
                            "เวลาจอง: " + slotStr + "\n" +
                            "เลขที่ใบเสร็จ: " + receiptNo + "\n" +
                            "ต้องการผู้ฝึกสอน (โค้ช): " + (requireCoach ? "ต้องการโค้ช 🟢" : "ไม่ต้องการโค้ช ❌") + "\n" +
                            "โน้ตเพิ่มเติมจากแอดมิน: " + (adminNotes || "-");
        
        event.setDescription(description);
        console.log("Updated Google Calendar event description: " + title);
      }
    });
  } catch (e) {
    console.error("Failed to update Calendar event notes: " + e.toString());
  }
}

// ฟังก์ชันสำหรับการซิงก์ข้อมูลทั้งหมดแบบย้อนหลัง (Backup) ไปยัง Google Sheets
function handleBackup(data) {
  const bookings = data.bookings || [];
  const transactions = data.transactions || [];
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. จัดการข้อมูลการจอง
  let bookingSheet = spreadsheet.getSheetByName("Bookings");
  if (!bookingSheet) {
    bookingSheet = spreadsheet.insertSheet("Bookings");
    bookingSheet.appendRow(["ID", "Date", "Time Slot", "Customer", "Phone", "Email", "Court", "Require Coach", "Fee", "Invoice No", "Receipt No", "Slip URL", "LINE User ID", "Car Plate", "Reminder Sent", "Admin Notes"]);
  }
  
  const lastRowB = bookingSheet.getLastRow();
  if (lastRowB > 1) {
    bookingSheet.getRange(2, 1, lastRowB - 1, bookingSheet.getLastColumn()).clearContent();
  }
  
  const bookingRows = bookings.map(b => [
    b.id, b.date, b.slot, b.name, b.phone, b.email || "", b.court, b.requireCoach ? "Yes" : "No", b.fee, b.invoiceNo || "", b.receiptNo || "", b.slipUrl || "", b.lineUserId || "", b.lineIdInput || "", b.reminderSent || "", b.adminNotes || ""
  ]);
  
  if (bookingRows.length > 0) {
    bookingSheet.getRange(2, 1, bookingRows.length, bookingRows[0].length).setValues(bookingRows);
  }
  
  // 2. จัดการข้อมูลธุรกรรมการเงิน (Transactions)
  let txSheet = spreadsheet.getSheetByName("Transactions");
  if (!txSheet) {
    txSheet = spreadsheet.insertSheet("Transactions");
    txSheet.appendRow(["ID", "Date", "Type", "Category", "Amount", "Description"]);
  }
  
  const lastRowT = txSheet.getLastRow();
  if (lastRowT > 1) {
    txSheet.getRange(2, 1, lastRowT - 1, txSheet.getLastColumn()).clearContent();
  }
  
  const txRows = transactions.map(t => [
    t.id, t.date, t.type, t.category, t.amount, t.description
  ]);
  
  if (txRows.length > 0) {
    txSheet.getRange(2, 1, txRows.length, txRows[0].length).setValues(txRows);
  }
  
  return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Backup completed successfully" }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ฟังก์ชันสแกนและส่งข้อความเตือนความจำล่วงหน้า 24 ชั่วโมงทาง LINE
function checkAndSendReminders() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const bookingSheet = spreadsheet.getSheetByName("Bookings");
  if (!bookingSheet) return;
  
  const lastRow = bookingSheet.getLastRow();
  if (lastRow <= 1) return;
  
  // โหลดช่วงข้อมูลรวมตัวเช็คแจ้งเตือน (คอลัมน์ 1 ถึง 15)
  const range = bookingSheet.getRange(2, 1, lastRow - 1, 15);
  const values = range.getValues();
  
  const now = new Date();
  const token = LINE_CHANNEL_ACCESS_TOKEN;
  
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const bookingId = row[0];
    const dateVal = row[1];
    const slotStr = row[2];
    const name = row[3];
    const lineUserId = row[12];
    const reminderSent = row[14]; // คอลัมน์ที่ 15 คือดัชนีที่ 14 (Reminder Sent)
    
    // ข้ามหากแจ้งเตือนไปแล้ว หรือไม่มี LINE User ID
    if (reminderSent === "Yes" || !lineUserId) continue;
    
    const bookingTime = parseBookingDateTime(dateVal, slotStr);
    if (!bookingTime) continue;
    
    // คำนวณช่วงเวลาห่างหน่วยเป็นชั่วโมง
    const diffMs = bookingTime.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    
    // ส่งเตือนล่วงหน้าระหว่าง 23 ถึง 24 ชั่วโมง
    if (diffHours >= 23.0 && diffHours <= 24.0) {
      const success = sendLineReminder(lineUserId, name, dateVal, slotStr, token);
      if (success) {
        // อัปเดตคอลัมน์ O (Reminder Sent - ลำดับที่ 15) เป็น "Yes" ป้องกันส่งข้อความซ้ำ
        bookingSheet.getRange(i + 2, 15).setValue("Yes");
      }
    }
  }
}

// ผู้ช่วยแปลงวันที่และสล็อตเวลาเป็น Date Object
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

// ผู้ช่วยยิง Push Message แจ้งเตือนลูกค้าล่วงหน้า 24 ชม.
function sendLineReminder(lineUserId, name, dateVal, slotStr, token) {
  if (!token || token === "YOUR_LINE_CHANNEL_ACCESS_TOKEN") return false;
  
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
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    console.log("Reminder Sent Status: " + response.getContentText());
    return response.getResponseCode() === 200;
  } catch (e) {
    console.error("LINE reminder push failed: " + e.toString());
    return false;
  }
}

// ฟังก์ชันส่งสลิปและรายละเอียดการจองไปยัง LINE ส่วนตัวของแอดมิน
function sendAdminSlipNotification(name, dateStr, slots, receiptNo, slipUrl) {
  const url = "https://api.line.me/v2/bot/message/push";
  const formattedSlots = slots.join(", ");
  
  const textMessage = `🔔 มีรายการจองใหม่เข้ามาและแจ้งชำระเงิน!

👤 ลูกค้า: คุณ ${name}
📅 วันที่: ${dateStr}
⏰ เวลา: ${formattedSlots}
🧾 เลขที่ใบเสร็จ: ${receiptNo || "-"}`;

  const messages = [
    {
      type: "text",
      text: textMessage
    }
  ];
  
  // แนบรูปภาพสลิปไปด้วยหากมีสลิปแนบมา
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
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    console.log("Admin Slip Notification Status: " + response.getContentText());
  } catch(e) {
    console.error("Failed to notify admin LINE: " + e.toString());
  }
}

// ฟังก์ชัน GET สำหรับทดสอบ Web App
function doGet(e) {
  return ContentService.createTextOutput("Notification & Backup Web App is active.")
    .setMimeType(ContentService.MimeType.TEXT);
}

// ฟังก์ชันดึงสิทธิ์เพื่อทดสอบระบบและปลดล็อก
function testEmail() {
  const calendar = CalendarApp.getDefaultCalendar();
  console.log("ชื่อปฏิทินของคุณคือ: " + calendar.getName());
  
  GmailApp.sendEmail("grandslamcourt@gmail.com", "🎾 ทดสอบระบบอีเมลและปฏิทิน", "ยินดีด้วย! สิทธิ์การเข้าถึงปฏิทิน Google Calendar และอีเมล ได้รับการปลดล็อกแล้ว");
}
