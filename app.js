// app.js - Core application logic for The Grand Slam Tennis Court Booking App

// Language Translations Dictionary
const translations = {
  th: {
    appTitle: "The Grand Slam Tennis Court",
    bookingTab: "จองสนาม & โค้ช",
    adminTab: "ผู้ดูแลระบบ (Admin)",
    mainCourtTitle: "ค่าบริการ",
    courtStatus: "08:00-16:00: 250 ฿/ชม. | 16:00-23:00: 350 ฿/ชม.",
    coachSelectLabel: "ความต้องการผู้ฝึกสอน (Coach Selection)",
    coachNo: "ไม่ต้องการโค้ช",
    coachYes: "ต้องการโค้ช",
    calendarTitle: "เลือกวันที่ต้องการเพิ่มความสุข",
    slotsTitle: "ตารางเวลาของวันที่",
    legendAvailable: "ว่าง",
    legendBooked: "จองแล้ว",
    legendSelected: "กำลังเลือก",
    slotAvailable: "ว่าง",
    slotBooked: "จองแล้ว",
    summaryTitle: "สรุปรายละเอียดการจอง",
    summaryCourt: "ค่าบริการสนาม (Court Rental Fee)",
    summaryTotal: "ยอดรวมทั้งสิ้น",
    btnBookNow: "ยืนยันการจองสนาม",
    modalBookTitle: "กรอกข้อมูลรายละเอียดผู้จอง",
    labelCustName: "ชื่อลูกค้า *",
    labelCustPhone: "เบอร์โทรศัพท์ติดต่อ *",
    labelCustEmail: "อีเมลสำหรับการยืนยันการจอง *",
    placeholderName: "เช่น สมชาย รักเรียน",
    placeholderPhone: "เช่น 081-234-5678",
    placeholderEmail: "เช่น somchai@gmail.com",
    privacyRemark: "ผู้ใช้บริการอนุญาตให้เก็บข้อมูลส่วนบุคคลเพื่อใช้สำหรับสนามเทนนิสเท่านั้น",
    consentAllow: "อนุญาต",
    consentDisallow: "ไม่อนุญาต",
    btnCancel: "ยกเลิก",
    btnConfirm: "ยืนยัน",
    adminLoginTitle: "ผู้ดูแลระบบเข้าสู่ระบบ",
    labelPassword: "รหัสผ่านผู้ดูแลระบบ",
    placeholderPassword: "ป้อนรหัสผ่าน (เริ่มต้น admin123)",
    btnLogin: "เข้าสู่ระบบ",
    adminDashboardTitle: "แผงควบคุมผู้ดูแลระบบ (Dashboard)",
    statTotalRevenue: "รายได้รวมทั้งหมด",
    statTotalExpense: "รายจ่ายรวมทั้งหมด",
    statNetProfit: "กำไรสุทธิ",
    statOccupancy: "อัตราการจองสนาม",
    chartTrendTitle: "แนวโน้มรายรับ - รายจ่ายประจำเดือน",
    chartIncomeTitle: "สัดส่วนรายได้แยกตามหมวดหมู่",
    chartExpenseTitle: "สัดส่วนรายจ่ายแยกตามหมวดหมู่",
    supabaseConfigTitle: "เชื่อมต่อระบบ supabaseClient Backend",
    backupConfigTitle: "สำรองข้อมูล & ซิงก์ไปที่ Google Sheet",
    btnSaveConfig: "บันทึกการตั้งค่า",
    btnTestConfig: "ทดสอบการเชื่อมต่อ",
    adminMonthlyLocksTitle: "จัดการการเปิดจองรายเดือน (Monthly Authorization)",
    btnUnlockMonth: "อนุมัติเปิดจอง",
    btnLockMonth: "ปิดการจอง",
    txtStatusUnlocked: "เปิดให้จองแล้ว",
    txtStatusLocked: "ยังไม่เปิดให้จอง",
    lockedMonthTitle: "การจองสำหรับเดือนนี้ยังไม่เปิดให้บริการ",
    lockedMonthDesc: "กรุณาติดต่อเจ้าหน้าที่ หรือรอผู้ดูแลระบบอนุมัติเปิดระบบจองสำหรับเดือนนี้",
    ledgerTitle: "บันทึกรายรับ - รายจ่าย (แอดมิน)",
    labelTxDate: "วันที่ทำรายการ",
    labelTxType: "ประเภทรายการ",
    labelTxCategory: "หมวดหมู่",
    labelTxAmount: "จำนวนเงิน (บาท)",
    labelTxDesc: "คำอธิบายเพิ่มเติม",
    btnSaveTx: "บันทึกธุรกรรม",
    recentTxTitle: "ประวัติรายรับ-รายจ่ายล่าสุด",
    thTxDate: "วันที่",
    thTxType: "ประเภท",
    thTxCategory: "หมวดหมู่",
    thTxAmount: "จำนวนเงิน",
    thTxDesc: "รายละเอียด",
    thTxAction: "จัดการ",
    bookingMgrTitle: "ตารางสรุปการจองสนามเทนนิสทั้งหมด",
    thBookDate: "วันที่จอง",
    thBookTime: "เวลา",
    thBookCust: "ชื่อลูกค้า",
    thBookPhone: "เบอร์โทร",
    thBookCoach: "โค้ช",
    thBookFee: "ค่าบริการ",
    thBookAction: "จัดการ",
    btnCancelBooking: "ยกเลิกการจอง",
    btnLogout: "ออกจากระบบ",
    optIncome: "รายรับ",
    optExpense: "รายจ่าย",
    toastSuccessTitle: "สำเร็จ",
    toastErrorTitle: "เกิดข้อผิดพลาด",
    toastBookingSuccess: "ทำการจองสนามเรียบร้อยแล้ว!",
    toastBookingCollision: "บางช่วงเวลาที่เลือกถูกจองไปแล้ว กรุณาตรวจสอบแล้วเลือกใหม่อีกครั้ง",
    toastSelectSlot: "กรุณาเลือกช่วงเวลาที่ต้องการจองก่อน",
    toastFillRequired: "กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน",
    toastInvalidEmail: "รูปแบบอีเมลไม่ถูกต้อง กรุณากรอกใหม่อีกครั้ง",
    toastLoginSuccess: "เข้าสู่ระบบแอดมินสำเร็จ",
    toastLoginFail: "รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง",
    toastConfigSaved: "บันทึกการเชื่อมต่อ Google API เรียบร้อยแล้ว",
    toastTxSaved: "บันทึกธุรกรรมการเงินเรียบร้อยแล้ว",
    toastBookingCancelled: "ยกเลิกรายการจองสำเร็จ และหักล้างยอดรายได้แล้ว",
    toastTxDeleted: "ลบรายการธุรกรรมเรียบร้อยแล้ว",
    toastGasSyncing: "กำลังส่งอีเมลและบันทึกข้อมูลไปยัง Google Sheets...",
    toastGasSuccess: "ซิงก์ข้อมูลและส่งอีเมลยืนยันการจองเรียบร้อยแล้ว!",
    toastGasFail: "ส่งข้อมูล Google ล้มเหลว (ข้อมูลบันทึกในเครื่องปกติ)",
    txtNoCoach: "ไม่รับโค้ช",
    txtNeedCoach: "รับโค้ช",
    txtCourtRentalCat: "ค่าเช่าสนาม",
    txtCoachFeeCat: "ค่าโค้ช",
    txtUtilitiesCat: "ค่าน้ำค่าไฟ/สาธารณูปโภค",
    txtMaintenanceCat: "ค่าซ่อมบำรุงรักษา",
    txtSalariesCat: "เงินเดือนพนักงาน",
    txtCoachPayoutCat: "จ่ายส่วนแบ่งโค้ช",
    txtEquipmentPurchaseCat: "จัดซื้ออุปกรณ์",
    txtEquipmentShopCat: "ขายอุปกรณ์กีฬา (Shop)",
    txtCafeCat: "คาเฟ่ / ขนม (Snacks)",
    txtOtherIncomeCat: "รายรับอื่นๆ",
    txtOtherExpenseCat: "รายจ่ายอื่นๆ",
    confirmCancelBookingPrompt: "คุณต้องการยกเลิกการจองนี้ใช่หรือไม่? การจองจะถูกลบและเวลาจะถูกปล่อยให้จองใหม่",
    confirmDeleteTxPrompt: "คุณต้องการลบธุรกรรมนี้ใช่หรือไม่?",
    searchTab: "ตรวจสอบการจอง",
    searchViewTitle: "ค้นหาและสรุปรายการจองสนาม",
    searchViewDesc: "ใส่ชื่อของคุณที่ใช้จองสนามเพื่อสรุปวันเวลาและรายละเอียดการจองทั้งหมดของคุณ",
    searchPlaceholderName: "ระบุชื่อ-นามสกุลลูกค้าที่ใช้จอง (เช่น สมชาย รักเรียน)",
    btnSearch: "ค้นหา",
    thInvoiceNumber: "หมายเลขใบแจ้งหนี้",
    thReceiptNumber: "หมายเลขใบเสร็จ"
  },
  en: {
    appTitle: "The Grand Slam Tennis Court",
    bookingTab: "Book Court & Coach",
    adminTab: "Admin Portal",
    mainCourtTitle: "Court Fees",
    courtStatus: "08:00-16:00: 250 ฿/hr | 16:00-23:00: 350 ฿/hr",
    coachSelectLabel: "Coach Selection",
    coachNo: "No Coach Required",
    coachYes: "Require Coach",
    calendarTitle: "Select date to increase happiness",
    slotsTitle: "Time Slots for",
    legendAvailable: "Available",
    legendBooked: "Booked",
    legendSelected: "Selected",
    slotAvailable: "Available",
    slotBooked: "Booked",
    summaryTitle: "Booking Summary",
    summaryCourt: "Court Rental Fee",
    summaryTotal: "Total Amount",
    btnBookNow: "Confirm Booking",
    modalBookTitle: "Enter Customer Information",
    labelCustName: "Customer Name *",
    labelCustPhone: "Contact Phone Number *",
    labelCustEmail: "Booking Confirmation Email *",
    placeholderName: "e.g. John Doe",
    placeholderPhone: "e.g. 081-234-5678",
    placeholderEmail: "e.g. somchai@gmail.com",
    privacyRemark: "The user allows personal data to be collected for tennis court usage only.",
    consentAllow: "Allow",
    consentDisallow: "Do not allow",
    btnCancel: "Cancel",
    btnConfirm: "Confirm",
    adminLoginTitle: "Admin Authentication",
    labelPassword: "Admin Password",
    placeholderPassword: "Enter password (default: admin123)",
    btnLogin: "Login",
    adminDashboardTitle: "Admin Dashboard",
    statTotalRevenue: "Total Revenue",
    statTotalExpense: "Total Expenses",
    statNetProfit: "Net Profit",
    statOccupancy: "Court Occupancy Rate",
    chartTrendTitle: "Monthly Revenue vs. Expenses Trend",
    chartIncomeTitle: "Income Distribution by Category",
    chartExpenseTitle: "Expense Distribution by Category",
    supabaseConfigTitle: "Supabase Integration",
    backupConfigTitle: "Backup & Sync to Google Sheet",
    btnSaveConfig: "Save Settings",
    btnTestConfig: "Test Connection",
    adminMonthlyLocksTitle: "Monthly Booking Authorization Manager",
    btnUnlockMonth: "Unlock Booking",
    btnLockMonth: "Lock Booking",
    txtStatusUnlocked: "Unlocked",
    txtStatusLocked: "Locked",
    lockedMonthTitle: "Booking is not yet open for this month",
    lockedMonthDesc: "Please contact court staff or wait for the administrator to authorize booking.",
    ledgerTitle: "Income & Expense Ledger",
    labelTxDate: "Transaction Date",
    labelTxType: "Transaction Type",
    labelTxCategory: "Category",
    labelTxAmount: "Amount (THB)",
    labelTxDesc: "Additional Description",
    btnSaveTx: "Save Transaction",
    recentTxTitle: "Recent Financial Transactions",
    thTxDate: "Date",
    thTxType: "Type",
    thTxCategory: "Category",
    thTxAmount: "Amount",
    thTxDesc: "Description",
    thTxAction: "Action",
    bookingMgrTitle: "Tennis Court Bookings Manager",
    thBookDate: "Date",
    thBookTime: "Time Slot",
    thBookCust: "Customer Name",
    thBookPhone: "Phone",
    thBookCoach: "Coach",
    thBookFee: "Total Fee",
    thBookAction: "Action",
    btnCancelBooking: "Cancel Booking",
    btnLogout: "Log Out",
    optIncome: "Income",
    optExpense: "Expense",
    toastSuccessTitle: "Success",
    toastErrorTitle: "Error",
    toastBookingSuccess: "Court booking saved successfully!",
    toastBookingCollision: "Some selected slots are already booked. Please review and choose again.",
    toastSelectSlot: "Please select a time slot first.",
    toastFillRequired: "Please fill in all required fields.",
    toastInvalidEmail: "Invalid email format. Please check and try again.",
    toastLoginSuccess: "Logged in as Admin successfully",
    toastLoginFail: "Incorrect password. Please try again.",
    toastConfigSaved: "Google Apps Script configuration saved.",
    toastTxSaved: "Financial transaction saved.",
    toastBookingCancelled: "Booking cancelled and corresponding revenue removed.",
    toastTxDeleted: "Transaction deleted successfully.",
    toastGasSyncing: "Sending email and syncing data to Google Sheets...",
    toastGasSuccess: "Email sent and data synced to Google Sheets successfully!",
    toastGasFail: "Google sync failed (Data saved locally on this machine)",
    txtNoCoach: "No Coach",
    txtNeedCoach: "Coach Required",
    txtCourtRentalCat: "Court Rental",
    txtCoachFeeCat: "Coach Fee",
    txtUtilitiesCat: "Utilities (Water/Electric)",
    txtMaintenanceCat: "Court Maintenance",
    txtSalariesCat: "Staff Salaries",
    txtCoachPayoutCat: "Coach Payout",
    txtEquipmentPurchaseCat: "Equipment Purchase",
    txtEquipmentShopCat: "Equipment Shop",
    txtCafeCat: "Cafe / Snacks",
    txtOtherIncomeCat: "Other Income",
    txtOtherExpenseCat: "Other Expense",
    confirmCancelBookingPrompt: "Are you sure you want to cancel this booking? This slot will become available again.",
    confirmDeleteTxPrompt: "Are you sure you want to delete this transaction?",
    searchTab: "My Bookings",
    searchViewTitle: "Search & Summarize Bookings",
    searchViewDesc: "Enter the customer name used for booking to see your reserved times and summary.",
    searchPlaceholderName: "Enter the customer name (e.g. John Doe)",
    btnSearch: "Search",
    thInvoiceNumber: "Invoice No.",
    thReceiptNumber: "Receipt No."
  }
};

// Global App State
const state = {
  bookings: [],
  transactions: [],
  config: {
    supabaseUrl: "https://eqwmodrhorcbwsshbepg.supabase.co",
    supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxd21vZHJob3JjYndzc2hiZXBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyODUzOTQsImV4cCI6MjA5Nzg2MTM5NH0.KuvE9-4x9hHpp7D-uEyXriSC24Knzb9E9ls4K884pDY",
    liffId: "2010398825-4Z3Ff2Gf",
    gasUrl: "https://script.google.com/macros/s/AKfycbz8OefERQJ5pIBVLz7BF7gPbOtsBIs-gQx1dpvJlLk4trnlvQ0RAAIs7pxsXWMOCJ_Udw/exec",
    rateDay: 250,              // 08:00 - 16:00
    rateNight: 350,            // 16:00 - 23:00 (Night rate updated to 350)
    advanceBookingMonths: 1    // Default 1 month
  },
  currentDate: new Date(),          // For calendar view navigations
  selectedDate: new Date(),         // Selected booking date
  selectedSlots: [],                // Array to store multiple selected time slots (e.g. ["09:00 - 10:00", "10:00 - 11:00"])
  requireCoach: false,              // Coach request flag
  language: "th",                  // Language: th or en
  isAdminLoggedIn: false,
  liffProfile: null,
  currentSlipData: null,
  lastSearchQuery: "",
  isFetchingBookings: false,
  autoRefreshTimer: null
};

// Helper: Get Year-Month String (e.g., "2026-05")
function getYearMonthString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// Helper: Check if month is locked for booking
function isMonthLocked(date) {
  const today = new Date();
  const monthsDiff = (date.getFullYear() - today.getFullYear()) * 12 + (date.getMonth() - today.getMonth());
  
  const maxAdvance = state.config.advanceBookingMonths !== undefined ? parseInt(state.config.advanceBookingMonths) : 1;
  
  // Current month and past months are always unlocked
  if (monthsDiff <= 0) {
    return false;
  }
  
  return monthsDiff > maxAdvance;
}

// Helper: Generate Running Number (YYYYMMxxx)
function getRunningNumber(type) {
  // ใช้วันที่ที่ลูกค้าเลือกจอง (Booking Date) เป็นตัวกำหนดเดือน
  const targetDate = state.selectedDate || new Date();
  const yyyy = targetDate.getFullYear();
  const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
  const prefix = `${yyyy}${mm}`;
  
  const countersObjName = `${type}Counters`;
  // สร้าง Object เก็บ Counter แยกรุ่นตามเดือน เช่น { "202606": 2, "202607": 1 }
  if (!state.config[countersObjName]) {
    state.config[countersObjName] = {};
  }
  
  // ถ้าย้อนกลับไปจองเดือนอื่น จะได้ไม่ไปรีเซ็ตเดือนเดิม
  if (!state.config[countersObjName][prefix]) {
    state.config[countersObjName][prefix] = 1;
  } else {
    state.config[countersObjName][prefix]++;
  }
  
  saveStateToStorage();
  const countStr = String(state.config[countersObjName][prefix]).padStart(3, '0');
  return `${prefix}${countStr}`;
}

// Helper: Calculate price for a single slot string (e.g. "08:00 - 09:00" -> 250)
function getSlotPrice(slotString) {
  const startHourStr = slotString.split(' - ')[0]; // e.g. "08:00"
  const startHour = parseInt(startHourStr.split(':')[0], 10); // e.g. 8

  if (startHour >= 8 && startHour < 16) {
    return state.config.rateDay;
  } else {
    return state.config.rateNight;
  }
}

// Helper: Calculate total fee for current selections
function calculateTotalFee() {
  let total = 0;
  state.selectedSlots.forEach(slot => {
    total += getSlotPrice(slot);
  });
  return total;
}

// ----------------------------------------------------
// UI Notification Toast System
// ----------------------------------------------------
function showToast(message, type = 'info', title = null) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  if (!title) {
    title = type === 'success' ? translations[state.language].toastSuccessTitle : 
            type === 'error' ? translations[state.language].toastErrorTitle : '';
  }

  const iconClass = type === 'success' ? 'fa-circle-check text-green' : 
                     type === 'error' ? 'fa-triangle-exclamation text-red' : 'fa-circle-info text-blue';

  toast.innerHTML = `
    <i class="fa-solid ${iconClass}"></i>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close"><i class="fa-solid fa-xmark"></i></button>
  `;

  container.appendChild(toast);

  // Close event listener
  toast.querySelector('.toast-close').addEventListener('click', () => {
    toast.remove();
  });

  // Auto remove toast
  setTimeout(() => {
    toast.style.animation = 'fadeIn 0.3s ease reverse forwards';
    setTimeout(() => { toast.remove(); }, 300);
  }, 4000);
}

// ----------------------------------------------------
// Local Storage Persistence & Mock Data Preloading
// ----------------------------------------------------
function loadStateFromStorage() {
  const localTransactions = localStorage.getItem('tennis_transactions');
  const localConfig = localStorage.getItem('tennis_config');
  const localLang = localStorage.getItem('tennis_lang');

  try {
    if (localConfig) {
      const parsedConfig = JSON.parse(localConfig);
      // Merge values but keep hardcoded defaults if local storage values are empty
      if (!parsedConfig.supabaseUrl) parsedConfig.supabaseUrl = state.config.supabaseUrl;
      if (!parsedConfig.supabaseKey) parsedConfig.supabaseKey = state.config.supabaseKey;
      state.config = { ...state.config, ...parsedConfig };
    }
  } catch (err) {
    console.error("Failed to parse localConfig from localStorage:", err);
  }

  if (localLang) state.language = localLang;

  // Set Language select
  const langSelect = document.getElementById('langSwitch');
  if (langSelect) langSelect.value = state.language;

  // Bookings state initialized empty. Supabase is the source of truth.
  state.bookings = [];

  // Initialize Supabase Client
  initSupabaseClient();

  if (supabaseClient) {
    // Do NOT fetch transactions on page load for general users (causes RLS error).
    // Transactions will be fetched upon successful Admin authentication.
    state.transactions = [];
  } else {
    // No Supabase URL configured yet → use mock data or local storage
    try {
      if (localTransactions) {
        state.transactions = JSON.parse(localTransactions);
      } else {
        if (!localConfig) {
          preloadMockData();
        } else {
          state.transactions = [];
        }
      }
    } catch (err) {
      console.error("Failed to parse localTransactions from localStorage:", err);
      state.transactions = [];
    }
  }
}

function saveStateToStorage() {
  try {
    // We no longer save bookings to localStorage to prevent out-of-sync double-booking bugs
    if (!supabaseClient) {
      localStorage.setItem('tennis_transactions', JSON.stringify(state.transactions));
    } else {
      localStorage.removeItem('tennis_transactions'); // Clean up transactions cache if Supabase is active
    }
    localStorage.setItem('tennis_config', JSON.stringify(state.config));
    localStorage.setItem('tennis_lang', state.language);
  } catch (error) {
    console.warn("Storage warning: Could not save to localStorage (Quota exceeded?). Data might not persist across reloads.", error);
  }
}

function preloadMockData() {
  const bookings = [];
  const transactions = [];
  const today = new Date();
  
  // Format Date Helper
  const formatDateString = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const makeId = () => Math.random().toString(36).substr(2, 9);

  // Define some customer names
  const names = ['สมศักดิ์ ปัญญาดี', 'วิภา นามสกุลดี', 'David Beckham', 'กิตติพงศ์ ทองแท้', 'พิมลวรรณ สุขใจ', 'นงนุช โชคดี', 'Thomas Muller'];
  const phones = ['081-555-1234', '089-777-4321', '062-888-9999', '095-222-3333', '086-444-5555', '083-999-8888', '084-222-1111'];
  const emails = ['somsak@gmail.com', 'wipa@hotmail.com', 'david@beckham.com', 'kitti@gmail.com', 'pim@gmail.com', 'nongnuch@outlook.com', 'thomas@muller.de'];

  // Add 12 Bookings scattered over the last 15 days, today, and the next 5 days
  for (let i = -15; i <= 5; i++) {
    if (i % 2 === 0 || i === 0) {
      const bookDate = new Date(today);
      bookDate.setDate(today.getDate() + i);
      const dateStr = formatDateString(bookDate);
      
      const slotHour = 8 + Math.abs(i) % 15; // slots 08:00 - 23:00
      const startStr = String(slotHour).padStart(2, '0') + ":00";
      const endStr = String(slotHour + 1).padStart(2, '0') + ":00";
      const slot = `${startStr} - ${endStr}`;
      
      const reqCoach = i % 3 === 0;
      const slotPrice = slotHour < 16 ? state.config.rateDay : state.config.rateNight;
      const clientIndex = Math.abs(i) % names.length;
      
      const bookingId = makeId();
      bookings.push({
        id: bookingId,
        date: dateStr,
        slot: slot,
        name: names[clientIndex],
        phone: phones[clientIndex],
        email: emails[clientIndex], // email added to mock data
        court: "Main Court",
        requireCoach: reqCoach,
        fee: slotPrice
      });

      // Create transaction for this booking
      transactions.push({
        id: 'tx_b_' + bookingId,
        date: dateStr,
        type: 'income',
        category: 'Court Rental',
        amount: slotPrice,
        description: `ค่าเช่าสนาม: คุณ ${names[clientIndex]} (${slot})`
      });
    }
  }

  // Add manual expenses & incomes
  const mockExpenses = [
    { cat: 'Utilities (Electricity/Water)', amount: 4800, desc: 'ค่าไฟฟ้าประจำเดือน พฤษภาคม 2026', daysAgo: 10 },
    { cat: 'Maintenance', amount: 3500, desc: 'ค่าปรับปรุงขึงตาข่ายสนามและล้างทำความสะอาดสนาม', daysAgo: 15 },
    { cat: 'Staff Salaries', amount: 12000, desc: 'เงินเดือนพนักงานดูแลสนามประจำเดือน', daysAgo: 1 },
    { cat: 'Coach Payout', amount: 3600, desc: 'ส่วนแบ่งรายได้ให้โค้ช สมชาย และ พิม', daysAgo: 3 },
    { cat: 'Equipment Purchase', amount: 2500, desc: 'ซื้อลูกเทนนิสใหม่ 10 กล่อง สำหรับฝึกซ้อม', daysAgo: 8 },
    { cat: 'Other Expense', amount: 800, desc: 'ค่ากวาดใบไม้และทำความสะอาดที่จอดรถ', daysAgo: 12 }
  ];

  const mockOtherIncomes = [
    { cat: 'Equipment Shop', amount: 1500, desc: 'ขายไม้เทนนิสและอุปกรณ์เอ็นเทนนิส', daysAgo: 5 },
    { cat: 'Cafe / Snacks', amount: 1200, desc: 'ขายเครื่องดื่มเกลือแร่และน้ำดื่มให้ลูกค้าประจำสัปดาห์', daysAgo: 2 },
    { cat: 'Other Income', amount: 600, desc: 'ค่าที่จอดรถกิจกรรมพิเศษรายวัน', daysAgo: 14 }
  ];

  mockExpenses.forEach(exp => {
    const txDate = new Date(today);
    txDate.setDate(today.getDate() - exp.daysAgo);
    transactions.push({
      id: makeId(),
      date: formatDateString(txDate),
      type: 'expense',
      category: exp.cat,
      amount: exp.amount,
      description: exp.desc
    });
  });

  mockOtherIncomes.forEach(inc => {
    const txDate = new Date(today);
    txDate.setDate(today.getDate() - inc.daysAgo);
    transactions.push({
      id: makeId(),
      date: formatDateString(txDate),
      type: 'income',
      category: inc.cat,
      amount: inc.amount,
      description: inc.desc
    });
  });

  state.bookings = bookings;
  state.transactions = transactions;
  saveStateToStorage();
}

// ----------------------------------------------------
// supabaseClient Database & Storage API Integration
// ----------------------------------------------------
// Initialize Supabase Client
let supabaseClient = null;
function initSupabaseClient() {
  try {
    if (state.config.supabaseUrl && state.config.supabaseKey) {
      if (window.supabase) {
        supabaseClient = window.supabase.createClient(state.config.supabaseUrl, state.config.supabaseKey);
      } else {
        console.error("Supabase SDK is not loaded from CDN.");
      }
    }
  } catch (err) {
    console.error("Failed to initialize Supabase client:", err);
    supabaseClient = null;
  }
}

async function syncBookingWithSupabase(booking) {
  if (!supabaseClient) {
    return { status: "local" };
  }

  try {
    const { data, error } = await supabaseClient
      .from('bookings')
      .insert([{
        booking_date: booking.date,
        time_slot: booking.slot,
        customer_name: booking.name,
        phone: booking.phone,
        email: booking.email,
        line_id_input: booking.lineIdInput,
        line_user_id: booking.lineUserId,
        slip_url: booking.slipUrl || null,
        invoice_no: booking.invoiceNo,
        receipt_no: booking.receiptNo,
        court: booking.court,
        require_coach: booking.requireCoach,
        fee: booking.fee,
        status: 'confirmed'
      }])
      .select();

    if (error) {
      if (error.code === '23505') {
        return { status: "collision" };
      }
      throw error;
    }

    return { status: "success", data: data[0] };
  } catch (error) {
    console.error("Supabase Sync Error: ", error);
    return { status: "error", message: error.message || error.toString() };
  }
}

async function fetchBookingsFromSupabase(silent = false) {
  if (!supabaseClient) return;
  
  state.isFetchingBookings = true;
  
  try {
    const { data, error } = await supabaseClient
      .from('bookings')
      .select('*')
      .neq('status', 'cancelled');

    if (error) throw error;
    
    if (data) {
      const dbBookings = data.map(b => ({
        id: b.id,
        date: b.booking_date,
        slot: b.time_slot,
        name: b.customer_name,
        phone: b.phone,
        email: b.email,
        lineIdInput: b.line_id_input,
        lineUserId: b.line_user_id,
        slipUrl: b.slip_url,
        invoiceNo: b.invoice_no,
        receiptNo: b.receipt_no,
        court: b.court,
        requireCoach: b.require_coach,
        fee: parseFloat(b.fee) || 0
      }));
      
      state.bookings = dbBookings;
      saveStateToStorage();
    }
  } catch (error) {
    console.error("Failed to fetch bookings from Supabase:", error);
    if (!silent) {
      showToast("ไม่สามารถดึงข้อมูลการจองล่าสุดจากเซิร์ฟเวอร์ได้", "error");
    }
  } finally {
    state.isFetchingBookings = false;
  }
}

async function addTransactionToSupabase(tx) {
  if (!supabaseClient) {
    state.transactions.push({
      id: tx.id || Math.random().toString(36).substr(2, 9),
      ...tx
    });
    saveStateToStorage();
    return;
  }
  try {
    const { data, error } = await supabaseClient
      .from('transactions')
      .insert([{
        transaction_date: tx.date,
        type: tx.type,
        category: tx.category,
        amount: tx.amount,
        description: tx.description,
        booking_id: tx.bookingId || null
      }])
      .select();

    if (error) throw error;
    
    if (data && data[0]) {
      state.transactions.push({
        id: data[0].id,
        date: data[0].transaction_date,
        type: data[0].type,
        category: data[0].category,
        amount: parseFloat(data[0].amount),
        description: data[0].description,
        bookingId: data[0].booking_id
      });
      saveStateToStorage();
    }
  } catch (error) {
    console.error("Failed to save transaction to Supabase:", error);
  }
}

async function fetchTransactionsFromSupabase() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient
      .from('transactions')
      .select('*')
      .order('transaction_date', { ascending: false });

    if (error) throw error;

    state.transactions = (data || []).map(tx => ({
      id: tx.id,
      date: tx.transaction_date,
      type: tx.type,
      category: tx.category,
      amount: parseFloat(tx.amount),
      description: tx.description,
      bookingId: tx.booking_id
    }));
    saveStateToStorage();
  } catch (error) {
    console.error("Failed to fetch transactions from Supabase:", error);
  }
}

// ----------------------------------------------------
// Translation and Localization Rendering
// ----------------------------------------------------
function applyLanguage() {
  const currentDict = translations[state.language];

  // 1. Text translations for data-translate tags
  document.querySelectorAll('[data-translate]').forEach(el => {
    const key = el.getAttribute('data-translate');
    if (currentDict[key]) {
      el.textContent = currentDict[key];
    }
  });

  // 2. Input placeholder translations
  document.querySelectorAll('[data-translate-placeholder]').forEach(el => {
    const key = el.getAttribute('data-translate-placeholder');
    if (currentDict[key]) {
      el.setAttribute('placeholder', currentDict[key]);
    }
  });

  updateCategoryDropdown();
  renderCalendar();
  renderTimeSlots();
  showSummaryPanel();
  
  if (state.lastSearchQuery) {
    performBookingSearch(state.lastSearchQuery, true);
  }
}

function updateCategoryDropdown() {
  const typeSelect = document.getElementById('txType');
  const catSelect = document.getElementById('txCategory');
  if (!typeSelect || !catSelect) return;

  const currentType = typeSelect.value;
  const currentDict = translations[state.language];

  let categories = [];
  if (currentType === 'income') {
    categories = [
      { value: 'Court Rental', label: currentDict.txtCourtRentalCat },
      { value: 'Coach Fee', label: currentDict.txtCoachFeeCat },
      { value: 'Equipment Shop', label: currentDict.txtEquipmentShopCat },
      { value: 'Cafe / Snacks', label: currentDict.txtCafeCat },
      { value: 'Other Income', label: currentDict.txtOtherIncomeCat }
    ];
  } else {
    categories = [
      { value: 'Utilities (Electricity/Water)', label: currentDict.txtUtilitiesCat },
      { value: 'Maintenance', label: currentDict.txtMaintenanceCat },
      { value: 'Staff Salaries', label: currentDict.txtSalariesCat },
      { value: 'Coach Payout', label: currentDict.txtCoachPayoutCat },
      { value: 'Equipment Purchase', label: currentDict.txtEquipmentPurchaseCat },
      { value: 'Other Expense', label: currentDict.txtOtherExpenseCat }
    ];
  }

  catSelect.innerHTML = categories.map(cat => `<option value="${cat.value}">${cat.label}</option>`).join('');
}

// ----------------------------------------------------
// UI Logic: Views and Navigation
// ----------------------------------------------------
function setupTabNavigation() {
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');

      if (tabId === 'admin' && !state.isAdminLoggedIn) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('navAdminBtn').classList.add('active');
        showView('admin-login-gate');
      } else {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        showView(tabId);
        if (tabId === 'admin') {
          renderAdminDashboard();
        }
      }
    });
  });
}

function showView(viewId) {
  document.querySelectorAll('.view').forEach(view => {
    view.classList.remove('active');
  });
  const viewEl = document.getElementById(viewId);
  if (viewEl) viewEl.classList.add('active');
}

// ----------------------------------------------------
// Customer UI: Calendar rendering
// ----------------------------------------------------
function renderCalendar() {
  const grid = document.getElementById('calendarGrid');
  const monthTitle = document.getElementById('currentMonthYear');
  if (!grid || !monthTitle) return;

  grid.innerHTML = '';

  const year = state.currentDate.getFullYear();
  const month = state.currentDate.getMonth();

  const monthName = state.currentDate.toLocaleString(state.language === 'th' ? 'th-TH' : 'en-US', { month: 'long' });
  const displayYear = state.language === 'th' ? year + 543 : year;
  monthTitle.textContent = `${monthName} ${displayYear}`;

  const daysOfWeek = state.language === 'th' ? 
    ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'] : 
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  daysOfWeek.forEach(day => {
    const el = document.createElement('div');
    el.className = 'weekday-header';
    el.textContent = day;
    grid.appendChild(el);
  });

  const firstDayIndex = new Date(year, month, 1).getDay();
  const lastDay = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < firstDayIndex; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'calendar-day empty';
    grid.appendChild(emptyCell);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0); // normalize to midnight for date comparison
  
  for (let d = 1; d <= lastDay; d++) {
    const cellDate = new Date(year, month, d);
    const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    
    const dayCell = document.createElement('div');
    dayCell.className = 'calendar-day';
    
    const isPast = cellDate < today;
    
    const selectedDateString = `${state.selectedDate.getFullYear()}-${String(state.selectedDate.getMonth() + 1).padStart(2, '0')}-${String(state.selectedDate.getDate()).padStart(2, '0')}`;
    if (dateString === selectedDateString) {
      dayCell.classList.add('selected');
    }

    if (cellDate.toDateString() === new Date().toDateString()) {
      dayCell.classList.add('today');
    }
    
    if (isPast) {
      dayCell.classList.add('disabled');
    }

    dayCell.innerHTML = `<span class="calendar-day-num">${d}</span>`;

    if (!isPast) {
      dayCell.addEventListener('click', () => {
        state.selectedDate = cellDate;
        state.selectedSlots = []; // Clear selections on date change
        showSummaryPanel(); // Recalculate 0
        renderCalendar();
        renderTimeSlots();
      });
    }

    grid.appendChild(dayCell);
  }
}

// renderTimeSlots: ดึงข้อมูลล่าสุดจาก Google Sheets ก่อนแสดงผล
function renderTimeSlots() {
  const slotsGrid = document.getElementById('slotsGrid');
  if (!slotsGrid) return;

  // ถ้าเชื่อมต่อ supabaseClient → fetch ล่าสุดก่อนแสดง
  if (state.config.supabaseUrl && state.config.supabaseKey && !state.isFetchingBookings) {
    // แสดง loading indicator
    slotsGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: var(--text-secondary);">
      <i class="fa-solid fa-spinner fa-spin" style="font-size: 1.5rem; margin-bottom: 0.5rem;"></i>
      <div style="font-size: 0.9rem;">กำลังโหลดข้อมูลการจองล่าสุด...</div>
    </div>`;
    
    fetchBookingsFromSupabase(true).then(() => {
      renderTimeSlotsUI();
    });
  } else {
    renderTimeSlotsUI();
  }
}

// renderTimeSlotsUI: แสดง time slots จากข้อมูล state.bookings ปัจจุบัน
function renderTimeSlotsUI() {
  const slotsGrid = document.getElementById('slotsGrid');
  const titleEl = document.getElementById('selectedDateText');
  const activeSlotsPanel = document.getElementById('activeSlotsPanel');
  const lockedMonthPanel = document.getElementById('lockedMonthPanel');

  if (!slotsGrid || !titleEl || !activeSlotsPanel || !lockedMonthPanel) return;

  slotsGrid.innerHTML = '';

  const dateStr = `${state.selectedDate.getFullYear()}-${String(state.selectedDate.getMonth() + 1).padStart(2, '0')}-${String(state.selectedDate.getDate()).padStart(2, '0')}`;
  
  const opt = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
  const displayDate = state.selectedDate.toLocaleDateString(state.language === 'th' ? 'th-TH' : 'en-US', opt);
  titleEl.textContent = `${translations[state.language].slotsTitle} ${displayDate}`;

  // Check if month is locked
  const locked = isMonthLocked(state.selectedDate);
  if (locked) {
    activeSlotsPanel.style.display = 'none';
    lockedMonthPanel.style.display = 'flex';
    return;
  } else {
    activeSlotsPanel.style.display = 'flex';
    lockedMonthPanel.style.display = 'none';
  }

  // Time Slots 08:00 - 23:00 (15 hourly slots)
  for (let hour = 8; hour < 23; hour++) {
    const startStr = String(hour).padStart(2, '0') + ":00";
    const endStr = String(hour + 1).padStart(2, '0') + ":00";
    const slot = `${startStr} - ${endStr}`;

    // ค้นหาว่า slot นี้ถูกจองหรือไม่ พร้อมดึงข้อมูลผู้จอง
    const bookedEntry = state.bookings.find(b => b.date === dateStr && b.slot === slot);
    const isBooked = !!bookedEntry;
    
    // Check if this slot is in the past (for today's date)
    const now = new Date();
    const isToday = state.selectedDate.toDateString() === now.toDateString();
    const isPastSlot = isToday && (hour + 1) <= now.getHours(); // slot end hour already passed
    
    const slotItem = document.createElement('div');
    
    if (isBooked || isPastSlot) {
      slotItem.className = 'slot-item booked';
      if (isBooked && bookedEntry.name) {
        // แสดงชื่อผู้จองเพื่อความชัดเจน
        const shortName = bookedEntry.name.length > 12 ? bookedEntry.name.substring(0, 12) + '...' : bookedEntry.name;
        slotItem.innerHTML = `<span class="slot-time">${slot}</span><span class="slot-booker" style="font-size: 0.7rem; opacity: 0.8; display: block; margin-top: 2px;">🔒 ${shortName}</span>`;
      } else {
        slotItem.innerHTML = `<span class="slot-time">${slot}</span>`;
      }
    } else {
      const isSelected = state.selectedSlots.includes(slot);
      slotItem.className = `slot-item available ${isSelected ? 'selected' : ''}`;
      
      slotItem.innerHTML = `<span class="slot-time">${slot}</span>`;

      slotItem.addEventListener('click', () => {
        if (state.selectedSlots.includes(slot)) {
          state.selectedSlots = state.selectedSlots.filter(s => s !== slot);
        } else {
          state.selectedSlots.push(slot);
        }
        // ใช้ renderTimeSlotsUI โดยตรง เพื่อไม่ fetch ซ้ำตอนกดเลือก slot
        renderTimeSlotsUI();
        showSummaryPanel();
      });
    }

    slotsGrid.appendChild(slotItem);
  }
}

// Show Summary Widget Panel - ALWAYS visible and starts at 0 ฿
function showSummaryPanel() {
  const panel = document.getElementById('bookingSummaryPanel');
  if (!panel) return;

  panel.style.display = 'block';

  let total = 0;
  let dayHours = 0;
  let nightHours = 0;
  
  state.selectedSlots.forEach(slot => {
    const startHourStr = slot.split(' - ')[0]; // e.g. "08:00"
    const startHour = parseInt(startHourStr.split(':')[0], 10);
    
    if (startHour >= 8 && startHour < 16) {
      dayHours++;
      total += state.config.rateDay;
    } else {
      nightHours++;
      total += state.config.rateNight;
    }
  });

  const count = state.selectedSlots.length;
  
  // Breakdown UI
  const breakdownContainer = document.getElementById('summaryFeeBreakdown');
  if (breakdownContainer) {
    let html = '';
    if (dayHours > 0) {
      html += `
        <div class="summary-row">
          <span>ช่วงกลางวัน 08:00-16:00 (${state.config.rateDay} ฿/ชม.)</span>
          <span class="summary-value">${(dayHours * state.config.rateDay).toLocaleString()} ฿</span>
        </div>`;
    }
    if (nightHours > 0) {
      html += `
        <div class="summary-row">
          <span>ช่วงเย็น 16:00-23:00 (${state.config.rateNight} ฿/ชม.)</span>
          <span class="summary-value">${(nightHours * state.config.rateNight).toLocaleString()} ฿</span>
        </div>`;
    }
    
    // Fallback if empty
    if (count === 0) {
      html = `
        <div class="summary-row">
          <span data-translate="summaryCourt">${translations[state.language].summaryCourt || 'ค่าบริการสนาม (Court Rental Fee)'}</span>
          <span class="summary-value">0 ฿</span>
        </div>`;
    }
    
    breakdownContainer.innerHTML = html;
  }

  document.getElementById('summaryTotalFee').textContent = `${total.toLocaleString()} ฿`;

  // Disable button if no slot is selected
  const bookBtn = document.getElementById('btnBookNow');
  if (bookBtn) {
    if (count === 0) {
      bookBtn.disabled = true;
      bookBtn.style.opacity = '0.5';
      bookBtn.style.cursor = 'not-allowed';
    } else {
      bookBtn.disabled = false;
      bookBtn.style.opacity = '1';
      bookBtn.style.cursor = 'pointer';
    }
  }
}

function hideSummaryPanel() {
  // Overridden: Instead of hiding, reset and show 0 ฿
  showSummaryPanel();
}

// ----------------------------------------------------
// Booking Wizard flow
// ----------------------------------------------------
function initBookingWizard() {
  const noCoachRadio = document.getElementById('coachNoRadio');
  const yesCoachRadio = document.getElementById('coachYesRadio');

  if (noCoachRadio && yesCoachRadio) {
    noCoachRadio.addEventListener('change', () => {
      state.requireCoach = false;
      showSummaryPanel();
    });
    yesCoachRadio.addEventListener('change', () => {
      state.requireCoach = true;
      showSummaryPanel();
    });
  }

  // Booking Modal triggers
  const btnBookNow = document.getElementById('btnBookNow');
  const modal = document.getElementById('bookingModal');
  const btnModalClose = document.getElementById('btnModalClose');
  const btnModalCancel = document.getElementById('btnModalCancel');
  const btnModalConfirm = document.getElementById('btnModalConfirm');

  if (btnBookNow && modal) {
    btnBookNow.addEventListener('click', () => {
      if (state.selectedSlots.length === 0) {
        showToast(translations[state.language].toastSelectSlot, 'error');
        return;
      }
      
      const opt = { day: 'numeric', month: 'long', year: 'numeric' };
      const dateText = state.selectedDate.toLocaleDateString(state.language === 'th' ? 'th-TH' : 'en-US', opt);
      const sortedSlots = [...state.selectedSlots].sort();

      document.getElementById('modalSelectedDate').textContent = dateText;
      document.getElementById('modalSelectedSlot').textContent = sortedSlots.join(', ');
      document.getElementById('modalSelectedCoach').textContent = state.requireCoach ? 
        translations[state.language].txtNeedCoach : translations[state.language].txtNoCoach;
      
      modal.style.display = 'flex';
    });
  }

  const closeModal = () => {
    modal.style.display = 'none';
    document.getElementById('custName').value = '';
    document.getElementById('custPhone').value = '';
    document.getElementById('custEmail').value = '';
    document.getElementById('custLineId').value = '';
    const consentAllowRadio = document.getElementById('consentAllow');
    if (consentAllowRadio) consentAllowRadio.checked = true;
    if (btnModalConfirm) {
      btnModalConfirm.disabled = false;
      btnModalConfirm.style.opacity = '1';
      btnModalConfirm.style.cursor = 'pointer';
    }
  };

  if (btnModalClose) btnModalClose.addEventListener('click', closeModal);
  if (btnModalCancel) btnModalCancel.addEventListener('click', closeModal);

  // Auto-fill logic for existing customers
  const checkAutoFill = () => {
    const custNameInput = document.getElementById('custName');
    const custPhoneInput = document.getElementById('custPhone');
    const custLineIdInput = document.getElementById('custLineId');
    const custEmailInput = document.getElementById('custEmail');
    
    if (custNameInput && custPhoneInput) {
      const nameVal = custNameInput.value.trim().toLowerCase();
      const phoneVal = custPhoneInput.value.trim();
      
      if (nameVal && phoneVal) {
        // Find past booking
        const match = state.bookings.find(b => 
          b.name.toLowerCase() === nameVal && b.phone === phoneVal
        );
        
        if (match) {
          if (match.lineIdInput && custLineIdInput && !custLineIdInput.value) {
            custLineIdInput.value = match.lineIdInput;
          }
          if (match.email && custEmailInput && !custEmailInput.value) {
            custEmailInput.value = match.email;
          }
        }
      }
    }
  };

  const custNameInput = document.getElementById('custName');
  const custPhoneInput = document.getElementById('custPhone');
  if (custNameInput) custNameInput.addEventListener('blur', checkAutoFill);
  if (custPhoneInput) custPhoneInput.addEventListener('blur', checkAutoFill);

  // Privacy consent toggle logic
  const consentAllowRadio = document.getElementById('consentAllow');
  const consentDisallowRadio = document.getElementById('consentDisallow');
  
  if (consentDisallowRadio && btnModalConfirm) {
    consentDisallowRadio.addEventListener('change', () => {
      btnModalConfirm.disabled = true;
      btnModalConfirm.style.opacity = '0.5';
      btnModalConfirm.style.cursor = 'not-allowed';
    });
  }
  if (consentAllowRadio && btnModalConfirm) {
    consentAllowRadio.addEventListener('change', () => {
      btnModalConfirm.disabled = false;
      btnModalConfirm.style.opacity = '1';
      btnModalConfirm.style.cursor = 'pointer';
    });
  }

  if (btnModalConfirm) {
    btnModalConfirm.addEventListener('click', async () => {
      const nameInput = document.getElementById('custName');
      const phoneInput = document.getElementById('custPhone');
      const emailInput = document.getElementById('custEmail');

      if (!nameInput || !phoneInput || !emailInput) return;

      const name = nameInput.value.trim();
      const phone = phoneInput.value.trim();
      const email = emailInput.value.trim();

      if (!name) {
        showToast(translations[state.language].toastFillRequired, 'error');
        return;
      }

      // Safe email pattern check (if provided)
      if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          showToast(translations[state.language].toastInvalidEmail, 'error');
          return;
        }
      }

      // === Double-check กับ Google Sheets ก่อนจอง ===
      // Fetch ข้อมูลล่าสุดเพื่อป้องกันการจอง slot ที่คนอื่นเพิ่งจองไป
      const dateStr = `${state.selectedDate.getFullYear()}-${String(state.selectedDate.getMonth() + 1).padStart(2, '0')}-${String(state.selectedDate.getDate()).padStart(2, '0')}`;
      
      if (state.config.supabaseUrl && state.config.supabaseKey) {
        showToast(state.language === 'th' ? 'กำลังตรวจสอบสถานะเวลาว่าง...' : 'Checking availability...', 'info');
        await fetchBookingsFromSupabase(true);
      }
      
      // ตรวจสอบ collision หลัง fetch ล่าสุด
      const collisionSlots = state.selectedSlots.filter(slot => 
        state.bookings.some(b => b.date === dateStr && b.slot === slot)
      );

      if (collisionSlots.length > 0) {
        const collisionMsg = state.language === 'th' 
          ? `เวลา ${collisionSlots.join(', ')} ถูกจองไปแล้ว! กรุณาเลือกเวลาใหม่` 
          : `Slots ${collisionSlots.join(', ')} are already booked! Please choose another time.`;
        showToast(collisionMsg, 'error');
        // ลบ slot ที่ชนออกจากที่เลือก
        state.selectedSlots = state.selectedSlots.filter(s => !collisionSlots.includes(s));
        closeModal();
        renderTimeSlots();
        showSummaryPanel();
        return;
      }

      // Generate Invoice
      const invoiceNumber = 'INV.' + getRunningNumber('invoice');
      const invoiceAmount = calculateTotalFee();
      const invoiceDate = state.selectedDate.toLocaleDateString(state.language === 'th' ? 'th-TH' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });

      document.getElementById('invoiceNumber').textContent = invoiceNumber;
      document.getElementById('invoiceCustName').textContent = name;
      document.getElementById('invoiceDate').textContent = invoiceDate;
      document.getElementById('invoiceAmount').textContent = `${invoiceAmount.toLocaleString()} ฿`;
      
      // Reset Slip UI
      document.getElementById('slipUpload').value = '';
      document.getElementById('slipValidationLoader').style.display = 'none';
      document.getElementById('receiptBox').style.display = 'none';
      document.getElementById('btnConfirmPayment').style.display = 'block';
      document.getElementById('btnFinishBooking').style.display = 'none';

      // Hide booking modal, show invoice modal
      closeModal();
      document.getElementById('invoiceSlipModal').style.display = 'flex';
      
      // Setup Slip Upload Flow
      const btnConfirmPayment = document.getElementById('btnConfirmPayment');
      const btnFinishBooking = document.getElementById('btnFinishBooking');
      let receiptNumber = '';
      
      btnConfirmPayment.onclick = () => {
        const fileInput = document.getElementById('slipUpload');
        if (!fileInput.files || fileInput.files.length === 0) {
          showToast('กรุณาแนบหลักฐานการโอนเงินก่อนแจ้งชำระ', 'error');
          return;
        }

        btnConfirmPayment.style.display = 'none';
        document.getElementById('slipValidationLoader').style.display = 'block';
        
        const file = fileInput.files[0];
        const reader = new FileReader();
        reader.onloadend = () => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 800;
            const MAX_HEIGHT = 800;
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
                width = MAX_WIDTH;
              }
            } else {
              if (height > MAX_HEIGHT) {
                width *= MAX_HEIGHT / height;
                height = MAX_HEIGHT;
              }
            }
            
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            document.getElementById('slipValidationLoader').style.display = 'none';
            
            receiptNumber = 'R.' + getRunningNumber('receipt');
            document.getElementById('receiptNumber').textContent = receiptNumber;
            document.getElementById('receiptBox').style.display = 'block';
            btnFinishBooking.style.display = 'block';

            // Convert canvas content to blob and save for Supabase Storage upload
            canvas.toBlob((blob) => {
              state.currentSlipFile = new File([blob], `${invoiceNumber}.jpg`, { type: 'image/jpeg' });
            }, 'image/jpeg', 0.7);
          };
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      };
      
      btnFinishBooking.onclick = async () => {
        const slotsBooked = [...state.selectedSlots]; // Capture slots before they are cleared
        document.getElementById('invoiceSlipModal').style.display = 'none';
        showToast(translations[state.language].toastGasSyncing, 'info');

        const lineIdInput = document.getElementById('custLineId')?.value.trim() || '';

        let hasCollision = false;
        let hasError = false;
        let gasErrorMessage = '';

        // 1. Upload payment slip to Supabase Storage if file exists
        let slipUrl = '';
        if (state.currentSlipFile && supabaseClient) {
          try {
            const fileExt = state.currentSlipFile.name.split('.').pop() || 'jpg';
            const fileName = `${invoiceNumber}_${Date.now()}.${fileExt}`;
            const { data, error: uploadError } = await supabaseClient.storage
              .from('slips')
              .upload(fileName, state.currentSlipFile);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabaseClient.storage
              .from('slips')
              .getPublicUrl(fileName);
            
            slipUrl = publicUrl;
          } catch (err) {
            console.error("Storage upload failed, trying to save transaction anyways:", err);
          }
        }

        // 2. Insert bookings
        for (const slot of slotsBooked) {
          const bookingId = Math.random().toString(36).substr(2, 9);
          const slotPrice = getSlotPrice(slot);

          const newBooking = {
            id: bookingId,
            date: dateStr,
            slot: slot,
            name: name,
            phone: phone,
            email: email,
            lineIdInput: lineIdInput,
            lineUserId: state.liffProfile ? state.liffProfile.userId : '',
            slipUrl: slipUrl,
            court: "Main Court",
            requireCoach: state.requireCoach,
            fee: slotPrice,
            invoiceNo: invoiceNumber,
            receiptNo: receiptNumber
          };

          const result = await syncBookingWithSupabase(newBooking);

          if (result && result.status === "collision") {
             hasCollision = true;
          } else if (result && result.status === "success") {
             // Handled automatically by Supabase Database Trigger (trigger_after_booking_insert)
             // No client-side call to addTransactionToSupabase needed to avoid RLS blocks and duplicate transactions
          } else if (result && result.status === "local") {
             state.bookings.push(newBooking);
             const courtTx = {
               id: 'tx_b_' + bookingId,
               date: dateStr,
               type: 'income',
               category: 'Court Rental',
               amount: slotPrice,
               description: `ค่าเช่าสนาม: คุณ ${name} (${slot}) [Receipt: ${receiptNumber}]` + (state.requireCoach ? ' (+โค้ช)' : '')
             };
             await addTransactionToSupabase(courtTx);
          } else {
             hasError = true;
             if (result && result.message) {
               gasErrorMessage = result.message;
             }
          }
        }

        saveStateToStorage();

        state.selectedSlots = [];
        showSummaryPanel(); // Resets back to 0 ฿

        if (hasCollision) {
           showToast(translations[state.language].toastBookingCollision, 'error');
        } else if (hasError) {
           let errorMsg = translations[state.language].toastGasFail;
           if (gasErrorMessage) {
             errorMsg += `: ${gasErrorMessage}`;
           }
           showToast(errorMsg, 'error');
        } else {
           showToast(translations[state.language].toastBookingSuccess, 'success');
           // Trigger notifications via GAS
           if (state.config.gasUrl) {
             sendBookingConfirmationNotifications({
               name: name,
               phone: phone,
               email: email,
               date: dateStr,
               slots: slotsBooked,
               invoiceNo: invoiceNumber,
               receiptNo: receiptNumber,
               lineIdInput: lineIdInput,
               lineUserId: state.liffProfile ? state.liffProfile.userId : ''
             });
           }
        }

        // Clean up temporary slip file reference
        state.currentSlipFile = null;

        await fetchBookingsFromSupabase();
        if (state.isAdminLoggedIn) {
          await fetchTransactionsFromSupabase();
        }
        renderCalendar();
        renderTimeSlots();
        if (state.isAdminLoggedIn && document.getElementById('admin').classList.contains('active')) {
          renderAdminDashboard();
        }
      };

      async function sendBookingConfirmationNotifications(info) {
        try {
          const payload = {
            action: "sendConfirmation",
            ...info
          };
          fetch(state.config.gasUrl, {
            method: 'POST',
            body: JSON.stringify(payload)
          }).catch(err => console.error("GAS notification trigger failed:", err));
        } catch (e) {
          console.error("Error triggering booking notifications:", e);
        }
      }
      
      // Close invoice modal if clicked X
      document.getElementById('btnInvoiceClose').onclick = () => {
        document.getElementById('invoiceSlipModal').style.display = 'none';
        state.selectedSlots = [];
        showSummaryPanel();
        renderTimeSlots();
      };

    });
  }
}

// ----------------------------------------------------
// Admin Gate Authentication
// ----------------------------------------------------
function initAdminAuth() {
  const loginBtn = document.getElementById('btnLogin');
  const passwordInput = document.getElementById('adminPassword');

  if (loginBtn && passwordInput) {
    loginBtn.addEventListener('click', async () => {
      const password = passwordInput.value;
      if (supabaseClient) {
        showToast(state.language === 'th' ? "กำลังเข้าสู่ระบบ..." : "Logging in...", 'info');
        try {
          const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: 'admin@grandslam.com',
            password: password
          });
          
          if (error) throw error;
          
          state.isAdminLoggedIn = true;
          passwordInput.value = '';
          showToast(translations[state.language].toastLoginSuccess, 'success');
          
          // Fetch transactions after auth is successful
          await fetchTransactionsFromSupabase();
          
          showView('admin');
          renderAdminDashboard();
        } catch (err) {
          console.error("supabaseClient login failed:", err);
          // Fallback to static check for backward compatibility or local test mode
          if (password === 'Zxcv1234') {
            state.isAdminLoggedIn = true;
            passwordInput.value = '';
            showToast(translations[state.language].toastLoginSuccess, 'success');
            showView('admin');
            renderAdminDashboard();
          } else {
            showToast(translations[state.language].toastLoginFail, 'error');
          }
        }
      } else {
        // Fallback static validation (Offline mode)
        if (password === 'Zxcv1234') {
          state.isAdminLoggedIn = true;
          passwordInput.value = '';
          showToast(translations[state.language].toastLoginSuccess, 'success');
          showView('admin');
          renderAdminDashboard();
        } else {
          showToast(translations[state.language].toastLoginFail, 'error');
        }
      }
    });

    passwordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') loginBtn.click();
    });
  }

  const logoutBtn = document.getElementById('btnLogout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (supabaseClient) {
        await supabaseClient.auth.signOut();
      }
      state.isAdminLoggedIn = false;
      showToast(state.language === 'th' ? 'ออกจากระบบเรียบร้อย' : 'Logged out', 'info');
      
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.getElementById('navBookingBtn').classList.add('active');
      showView('booking');
    });
  }
}

// ----------------------------------------------------
// Admin Dashboard Analytics & Table Managers
// ----------------------------------------------------
// Helper: Populate admin Year Filter options dynamically
function populateYearFilter() {
  const yearFilterSelect = document.getElementById('adminYearFilter');
  if (!yearFilterSelect) return;

  const currentValue = yearFilterSelect.value;
  const years = new Set();
  
  // Extract years from transactions
  state.transactions.forEach(tx => {
    if (tx.date) {
      const y = tx.date.substring(0, 4);
      if (y && /^\d{4}$/.test(y)) years.add(y);
    }
  });

  // Extract years from bookings
  state.bookings.forEach(b => {
    if (b.date) {
      const y = b.date.substring(0, 4);
      if (y && /^\d{4}$/.test(y)) years.add(y);
    }
  });

  // Always include current year
  years.add(new Date().getFullYear().toString());

  // Sort years descending
  const sortedYears = Array.from(years).sort((a, b) => b - a);

  // Build options HTML
  let html = `<option value="" style="background: #1e293b;">${state.language === 'th' ? 'ทุกปี' : 'All Years'}</option>`;
  sortedYears.forEach(y => {
    const displayYear = state.language === 'th' ? parseInt(y) + 543 : y;
    html += `<option value="${y}" style="background: #1e293b;">${displayYear}</option>`;
  });

  yearFilterSelect.innerHTML = html;
  
  // Restore previous selection if it is still valid
  if (sortedYears.includes(currentValue)) {
    yearFilterSelect.value = currentValue;
  } else {
    yearFilterSelect.value = '';
  }
}

// ----------------------------------------------------
// Admin Dashboard Analytics & Table Managers
// ----------------------------------------------------
function renderAdminDashboard() {
  if (!state.isAdminLoggedIn) return;

  // 0. Populate Year dropdown if not populated
  populateYearFilter();

  const monthFilter = document.getElementById('adminMonthFilter')?.value || '';
  const yearFilter = document.getElementById('adminYearFilter')?.value || '';

  // 1. Filter Transactions for Stats and Category Doughnuts
  const filteredTxsForMetrics = state.transactions.filter(tx => {
    if (monthFilter) {
      return tx.date.startsWith(monthFilter);
    }
    if (yearFilter) {
      return tx.date.startsWith(yearFilter);
    }
    return true;
  });

  // 2. Filter Transactions for Trend Chart (Income vs Expense Monthly Trend)
  // Shows all months in the selected year, or selected month's year, or all time
  const filteredTxsForTrend = state.transactions.filter(tx => {
    if (yearFilter) {
      return tx.date.startsWith(yearFilter);
    }
    if (monthFilter) {
      const year = monthFilter.split('-')[0];
      return tx.date.startsWith(year);
    }
    return true;
  });

  // Calculate Metrics Card Values
  let totalRevenue = 0;
  let totalExpense = 0;

  filteredTxsForMetrics.forEach(tx => {
    const amount = parseFloat(tx.amount) || 0;
    if (tx.type === 'income') {
      totalRevenue += amount;
    } else if (tx.type === 'expense') {
      totalExpense += amount;
    }
  });

  const netProfit = totalRevenue - totalExpense;

  // Calculate Occupancy Rate
  let occupancyRate = 0;
  if (monthFilter) {
    // Calculate for the specific month
    const [year, month] = monthFilter.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const totalSlotsInMonth = daysInMonth * 15; // 15 slots/day (08:00 to 23:00)
    
    const bookingsInMonth = state.bookings.filter(b => b.date.startsWith(monthFilter));
    occupancyRate = Math.min(100, Math.round((bookingsInMonth.length / totalSlotsInMonth) * 100));
  } else if (yearFilter) {
    // Calculate for the specific year
    const yr = Number(yearFilter);
    const isLeap = (yr % 4 === 0 && yr % 100 !== 0) || (yr % 400 === 0);
    const daysInYear = isLeap ? 366 : 365;
    const totalSlotsInYear = daysInYear * 15;
    
    const bookingsInYear = state.bookings.filter(b => b.date.startsWith(yearFilter));
    occupancyRate = Math.min(100, Math.round((bookingsInYear.length / totalSlotsInYear) * 100));
  } else {
    // Fallback to last 30 days
    const today = new Date();
    const past30Days = new Date();
    past30Days.setDate(today.getDate() - 30);

    const bookingsLast30Days = state.bookings.filter(b => {
      const bDate = new Date(b.date);
      return bDate >= past30Days && bDate <= today;
    });

    occupancyRate = Math.min(100, Math.round((bookingsLast30Days.length / 450) * 100));
  }

  document.getElementById('statTotalRevenue').textContent = `${totalRevenue.toLocaleString()} ฿`;
  document.getElementById('statTotalExpense').textContent = `${totalExpense.toLocaleString()} ฿`;
  
  const profitEl = document.getElementById('statNetProfit');
  profitEl.textContent = `${netProfit.toLocaleString()} ฿`;
  if (netProfit < 0) {
    profitEl.className = 'stat-value text-red';
  } else {
    profitEl.className = 'stat-value text-green';
  }
  
  document.getElementById('statOccupancy').textContent = `${occupancyRate}%`;

  if (typeof updateDashboardCharts === 'function') {
    updateDashboardCharts(filteredTxsForTrend, filteredTxsForMetrics, state.language);
  }

  const supabaseUrlInput = document.getElementById('supabaseUrlInput');
  const supabaseKeyInput = document.getElementById('supabaseKeyInput');
  const liffInput = document.getElementById('liffIdInput');
  if (supabaseUrlInput) {
    supabaseUrlInput.value = state.config.supabaseUrl || '';
  }
  if (supabaseKeyInput) {
    supabaseKeyInput.value = state.config.supabaseKey || '';
  }
  if (liffInput) {
    liffInput.value = state.config.liffId || '';
  }
  const gasUrlInput = document.getElementById('gasUrlInput');
  if (gasUrlInput) {
    gasUrlInput.value = state.config.gasUrl || '';
  }

  // Setup Admin search input handler
  const searchInput = document.getElementById('bookingSearchInput');
  if (searchInput) {
    searchInput.oninput = () => renderBookingsTable();
  }

  // Setup Admin Advance Booking Dropdown
  const advanceSelect = document.getElementById('advanceBookingMonths');
  if (advanceSelect) {
    advanceSelect.value = state.config.advanceBookingMonths !== undefined ? state.config.advanceBookingMonths : 1;
    advanceSelect.onchange = (e) => {
      state.config.advanceBookingMonths = parseInt(e.target.value);
      saveStateToStorage();
      renderCalendar();
      renderTimeSlots();
      showToast(state.language === 'th' ? 'บันทึกการตั้งค่าล่วงหน้าเรียบร้อยแล้ว' : 'Advance booking settings saved', 'success');
    };
  }

  renderBookingsTable();
  renderLedgerTable(filteredTxsForMetrics);
}

// ----------------------------------------------------
// Admin Forms & Handlers setup
// ----------------------------------------------------
function initAdminForms() {
  const typeSelect = document.getElementById('txType');
  if (typeSelect) {
    typeSelect.addEventListener('change', () => {
      updateCategoryDropdown();
    });
  }

  const btnSaveTx = document.getElementById('btnSaveTx');
  if (btnSaveTx) {
    btnSaveTx.addEventListener('click', () => {
      const dateEl = document.getElementById('txDate');
      const typeEl = document.getElementById('txType');
      const catEl = document.getElementById('txCategory');
      const amountEl = document.getElementById('txAmount');
      const descEl = document.getElementById('txDesc');

      if (!dateEl || !typeEl || !catEl || !amountEl || !descEl) return;

      const date = dateEl.value;
      const type = typeEl.value;
      const category = catEl.value;
      const amount = parseFloat(amountEl.value) || 0;
      const desc = descEl.value.trim();

      if (!date || amount <= 0) {
        showToast(translations[state.language].toastFillRequired, 'error');
        return;
      }

      const newTx = {
        id: Math.random().toString(36).substr(2, 9),
        date: date,
        type: type,
        category: category,
        amount: amount,
        description: desc || category
      };

      state.transactions.push(newTx);
      saveStateToStorage();

      amountEl.value = '';
      descEl.value = '';

      showToast(translations[state.language].toastTxSaved, 'success');
      renderAdminDashboard();
    });
  }

  const btnSaveConfig = document.getElementById('btnSaveConfig');
  if (btnSaveConfig) {
    btnSaveConfig.addEventListener('click', () => {
      const urlInput = document.getElementById('supabaseUrlInput');
      const keyInput = document.getElementById('supabaseKeyInput');
      const liffInput = document.getElementById('liffIdInput');
      if (urlInput || keyInput || liffInput) {
        if (urlInput) state.config.supabaseUrl = urlInput.value.trim();
        if (keyInput) state.config.supabaseKey = keyInput.value.trim();
        if (liffInput) state.config.liffId = liffInput.value.trim();
        saveStateToStorage();
        initSupabaseClient();
        showToast(translations[state.language].toastConfigSaved, 'success');
        // Re-init LIFF if updated
        initLiff();
      }
    });
  }

  const btnTestConfig = document.getElementById('btnTestConfig');
  if (btnTestConfig) {
    btnTestConfig.addEventListener('click', async () => {
      const url = document.getElementById('supabaseUrlInput').value.trim();
      const key = document.getElementById('supabaseKeyInput').value.trim();
      if (!url || !key) {
        showToast(state.language === 'th' ? "กรุณากรอก URL และ Key เพื่อทดสอบ" : "Please enter URL and Key to test", 'error');
        return;
      }

      showToast(state.language === 'th' ? "กำลังเชื่อมต่อ..." : "Testing connection...", 'info');

      try {
        const testClient = window.supabase.createClient(url, key);
        const { error } = await testClient.from('bookings').select('id').limit(1);
        if (error && error.code !== 'PGRST116') { // PGRST116 is just empty table error, which is fine
          throw error;
        }
        showToast(state.language === 'th' ? "การเชื่อมต่อสำเร็จ!" : "Connection successful!", 'success');
      } catch (err) {
        console.error("Test connection failed:", err);
        showToast(state.language === 'th' ? "การเชื่อมต่อล้มเหลว ตรวจสอบ URL, Key หรือ การเปิดสิทธิ์ RLS" : "Connection failed. Check URL, Key or RLS settings.", 'error');
      }
    });
  }

  const btnSaveGasConfig = document.getElementById('btnSaveGasConfig');
  if (btnSaveGasConfig) {
    btnSaveGasConfig.addEventListener('click', () => {
      const gasInput = document.getElementById('gasUrlInput');
      if (gasInput) {
        state.config.gasUrl = gasInput.value.trim();
        saveStateToStorage();
        showToast(translations[state.language].toastConfigSaved, 'success');
      }
    });
  }

  const btnBackupData = document.getElementById('btnBackupData');
  if (btnBackupData) {
    btnBackupData.addEventListener('click', async () => {
      // 1. Generate CSV
      let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
      
      // Bookings CSV
      csvContent += "--- Bookings ---\n";
      csvContent += "ID,Date,Time Slot,Customer,Phone,Email,Court,Coach,Fee\n";
      state.bookings.forEach(b => {
        const row = [
          b.id, b.date, b.slot, `"${b.name}"`, b.phone, b.email || '', b.court, b.requireCoach ? 'Yes' : 'No', b.fee
        ];
        csvContent += row.join(",") + "\n";
      });

      // Transactions CSV
      csvContent += "\n--- Transactions ---\n";
      csvContent += "ID,Date,Type,Category,Amount,Description\n";
      state.transactions.forEach(tx => {
        const row = [
          tx.id, tx.date, tx.type, tx.category, tx.amount, `"${tx.description.replace(/"/g, '""')}"`
        ];
        csvContent += row.join(",") + "\n";
      });

      // Download CSV locally
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `backup_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // 2. Send to Google Sheets if URL is configured
      if (state.config.gasUrl) {
        showToast(state.language === 'th' ? "กำลังซิงก์ข้อมูลไปที่ Google Sheet..." : "Syncing data to Google Sheet...", 'info');
        try {
          const payload = {
            bookings: state.bookings,
            transactions: state.transactions
          };
          const response = await fetch(state.config.gasUrl, {
            method: 'POST',
            body: JSON.stringify(payload)
          });
          
          showToast(state.language === 'th' ? "ซิงก์ข้อมูลไปที่ Google Sheet สำเร็จ" : "Synced to Google Sheet successfully", 'success');
        } catch (error) {
          console.error("Backup to GAS failed:", error);
          showToast(state.language === 'th' ? "การซิงก์ข้อมูลล้มเหลว กรุณาตรวจสอบ URL หรือสิทธิ์การเข้าถึง" : "Sync failed. Check URL and permissions.", 'error');
        }
      } else {
        showToast(state.language === 'th' ? "ดาวน์โหลดไฟล์ CSV เรียบร้อยแล้ว" : "CSV downloaded successfully.", 'success');
      }
    });
  }
}

function renderBookingsTable() {
  const tbody = document.getElementById('bookingsTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  // Get Admin filters
  const monthFilter = document.getElementById('adminMonthFilter')?.value || '';
  const yearFilter = document.getElementById('adminYearFilter')?.value || '';

  // Filter bookings first
  let filteredBookings = [...state.bookings];
  if (monthFilter) {
    filteredBookings = filteredBookings.filter(b => b.date.startsWith(monthFilter));
  } else if (yearFilter) {
    filteredBookings = filteredBookings.filter(b => b.date.startsWith(yearFilter));
  }

  // Sort bookings: newest bookings first
  filteredBookings.sort((a, b) => new Date(b.date + 'T' + b.slot.split(' - ')[0]) - new Date(a.date + 'T' + a.slot.split(' - ')[0]));

  // Get Admin Search query
  const query = document.getElementById('bookingSearchInput')?.value.toLowerCase().trim() || '';
  
  // Filter bookings by customer name
  if (query !== '') {
    filteredBookings = filteredBookings.filter(b => b.name.toLowerCase().includes(query));
  }

  if (filteredBookings.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state"><i class="fa-regular fa-calendar-xmark"></i>${state.language === 'th' ? 'ไม่พบรายการจองสนามที่ค้นหา' : 'No matching bookings found'}</td></tr>`;
    return;
  }

  filteredBookings.forEach(booking => {
    const row = document.createElement('tr');
    
    const dOpt = { day: 'numeric', month: 'short', year: 'numeric' };
    const formattedDate = new Date(booking.date).toLocaleDateString(state.language === 'th' ? 'th-TH' : 'en-US', dOpt);

    const coachBadgeText = booking.requireCoach ? 
      translations[state.language].txtNeedCoach : translations[state.language].txtNoCoach;
    const coachBadgeClass = booking.requireCoach ? 'badge coach' : 'badge no-coach';

    row.innerHTML = `
      <td style="font-weight: 500;">${formattedDate}</td>
      <td class="text-accent" style="font-weight: 600;">${booking.slot}</td>
      <td>
        <div style="font-weight: 600; color: var(--text-primary);">${booking.name}</div>
        <div style="font-size: 0.75rem; color: var(--text-secondary);">${booking.email || ''}</div>
      </td>
      <td>${booking.phone}</td>
      <td><span class="${coachBadgeClass}">${coachBadgeText}</span></td>
      <td style="font-weight: 600;">${booking.fee.toLocaleString()} ฿</td>
      <td>
        <button class="btn-danger-sm" data-cancel-id="${booking.id}">
          <i class="fa-regular fa-trash-can"></i> ${translations[state.language].btnCancelBooking}
        </button>
      </td>
    `;

    row.querySelector('.btn-danger-sm').addEventListener('click', () => {
      const confirmMsg = translations[state.language].confirmCancelBookingPrompt;
      if (confirm(confirmMsg)) {
        cancelBooking(booking.id);
      }
    });

    tbody.appendChild(row);
  });
}

function renderLedgerTable(filteredTxs) {
  const tbody = document.getElementById('ledgerTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  const txsSource = filteredTxs || state.transactions;
  const sortedTxs = [...txsSource].sort((a, b) => new Date(b.date) - new Date(a.date));

  if (sortedTxs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><i class="fa-solid fa-receipt"></i>${state.language === 'th' ? 'ไม่มีรายการประวัติการเงิน' : 'No transactions recorded'}</td></tr>`;
    return;
  }

  const limitedTxs = sortedTxs.slice(0, 50);

  limitedTxs.forEach(tx => {
    const row = document.createElement('tr');

    const typeBadge = tx.type === 'income' ? 
      `<span class="badge income">${translations[state.language].optIncome}</span>` : 
      `<span class="badge expense">${translations[state.language].optExpense}</span>`;
    
    let labelCat = tx.category;
    const currentDict = translations[state.language];
    if (tx.category === 'Court Rental') labelCat = currentDict.txtCourtRentalCat;
    else if (tx.category === 'Coach Fee') labelCat = currentDict.txtCoachFeeCat;
    else if (tx.category === 'Equipment Shop') labelCat = currentDict.txtEquipmentShopCat;
    else if (tx.category === 'Cafe / Snacks') labelCat = currentDict.txtCafeCat;
    else if (tx.category === 'Utilities (Electricity/Water)') labelCat = currentDict.txtUtilitiesCat;
    else if (tx.category === 'Maintenance') labelCat = currentDict.txtMaintenanceCat;
    else if (tx.category === 'Staff Salaries') labelCat = currentDict.txtSalariesCat;
    else if (tx.category === 'Coach Payout') labelCat = currentDict.txtCoachPayoutCat;
    else if (tx.category === 'Equipment Purchase') labelCat = currentDict.txtEquipmentPurchaseCat;
    else if (tx.category === 'Other Income') labelCat = currentDict.txtOtherIncomeCat;
    else if (tx.category === 'Other Expense') labelCat = currentDict.txtOtherExpenseCat;

    const dOpt = { day: 'numeric', month: 'short', year: 'numeric' };
    const formattedDate = new Date(tx.date).toLocaleDateString(state.language === 'th' ? 'th-TH' : 'en-US', dOpt);
    
    const amountVal = parseFloat(tx.amount) || 0;
    const amountColor = tx.type === 'income' ? 'text-green' : 'text-red';
    const amountPrefix = tx.type === 'income' ? '+' : '-';

    row.innerHTML = `
      <td>${formattedDate}</td>
      <td>${typeBadge}</td>
      <td style="font-weight: 500;">${labelCat}</td>
      <td class="${amountColor}" style="font-weight: 600;">${amountPrefix}${amountVal.toLocaleString()} ฿</td>
      <td style="font-size: 0.85rem; color: var(--text-secondary); max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${tx.description}</td>
      <td>
        <button class="btn-danger-sm" data-tx-id="${tx.id}"><i class="fa-solid fa-xmark"></i></button>
      </td>
    `;

    row.querySelector('.btn-danger-sm').addEventListener('click', () => {
      const confirmMsg = translations[state.language].confirmDeleteTxPrompt;
      if (confirm(confirmMsg)) {
        deleteTransaction(tx.id);
      }
    });

    tbody.appendChild(row);
  });
}

async function cancelBooking(bookingId) {
  if (supabaseClient) {
    try {
      // Update status to 'cancelled' in supabaseClient.
      // This will trigger 'trigger_after_booking_update' to delete associated transactions.
      const { error } = await supabaseClient
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', bookingId);

      if (error) throw error;
      
      state.bookings = state.bookings.filter(b => b.id !== bookingId);
      state.transactions = state.transactions.filter(tx => tx.bookingId !== bookingId);
      saveStateToStorage();
      
      showToast(translations[state.language].toastBookingCancelled, 'success');
    } catch (error) {
      console.error("Failed to cancel booking in Supabase:", error);
      showToast(state.language === 'th' ? "ยกเลิกการจองในเซิร์ฟเวอร์ล้มเหลว" : "Failed to cancel booking on server", 'error');
      return;
    }
  } else {
    state.bookings = state.bookings.filter(b => b.id !== bookingId);
    state.transactions = state.transactions.filter(tx => tx.id !== 'tx_b_' + bookingId);
    saveStateToStorage();
    showToast(translations[state.language].toastBookingCancelled, 'success');
  }

  renderCalendar();
  renderTimeSlots();
  renderAdminDashboard();
}

async function deleteTransaction(txId) {
  if (supabaseClient) {
    try {
      const { error } = await supabaseClient
        .from('transactions')
        .delete()
        .eq('id', txId);

      if (error) throw error;
      
      state.transactions = state.transactions.filter(tx => tx.id !== txId);
      saveStateToStorage();
      showToast(translations[state.language].toastTxDeleted, 'success');
    } catch (error) {
      console.error("Failed to delete transaction in Supabase:", error);
      showToast(state.language === 'th' ? "ลบธุรกรรมในเซิร์ฟเวอร์ล้มเหลว" : "Failed to delete transaction on server", 'error');
      return;
    }
  } else {
    state.transactions = state.transactions.filter(tx => tx.id !== txId);
    saveStateToStorage();
    showToast(translations[state.language].toastTxDeleted, 'success');
  }

  renderAdminDashboard();
}

// ----------------------------------------------------
// LIFF Initialization
// ----------------------------------------------------
async function initLiff() {
  if (state.config.liffId && typeof liff !== 'undefined') {
    try {
      await liff.init({ liffId: state.config.liffId });
      
      const btnLiffLogin = document.getElementById('btnLiffLogin');
      const liffProfileBox = document.getElementById('liffProfileBox');
      
      if (liff.isLoggedIn()) {
        const profile = await liff.getProfile();
        state.liffProfile = profile;
        
        if (btnLiffLogin) btnLiffLogin.style.display = 'none';
        if (liffProfileBox) {
          liffProfileBox.style.display = 'flex';
          const pic = document.getElementById('liffProfilePic');
          if (pic && profile.pictureUrl) pic.src = profile.pictureUrl;
          const name = document.getElementById('liffProfileName');
          if (name) name.textContent = profile.displayName;
        }
        
        const custNameInput = document.getElementById('custName');
        if (custNameInput && !custNameInput.value) {
          custNameInput.value = profile.displayName;
        }
      } else {
        if (liffProfileBox) liffProfileBox.style.display = 'none';
        if (btnLiffLogin) {
          btnLiffLogin.style.display = 'inline-flex';
          btnLiffLogin.onclick = () => {
            liff.login();
          };
        }
      }
    } catch (err) {
      console.error("LIFF Init Error:", err);
    }
  }
}

// ----------------------------------------------------
// Customer UI: Booking Search Logic
// ----------------------------------------------------
function initBookingSearch() {
  const btnSearch = document.getElementById('btnSearchBooking');
  const searchInput = document.getElementById('custSearchInput');
  if (btnSearch && searchInput) {
    btnSearch.addEventListener('click', () => performBookingSearch(searchInput.value));
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') performBookingSearch(searchInput.value);
    });
  }
}

function performBookingSearch(query, isSilent = false) {
  query = (query || '').trim().toLowerCase();
  state.lastSearchQuery = query;

  const tbody = document.getElementById('searchResultTableBody');
  const resultArea = document.getElementById('searchResultArea');
  const summaryTitle = document.getElementById('searchSummaryTitle');
  const summarySubtitle = document.getElementById('searchSummarySubtitle');
  if (!tbody || !resultArea || !summaryTitle || !summarySubtitle) return;

  if (!query) {
    if (!isSilent) {
      showToast(state.language === 'th' ? 'กรุณากรอกชื่อลูกค้าเพื่อค้นหา' : 'Please enter a customer name to search', 'error');
    }
    resultArea.style.display = 'none';
    return;
  }

  // Filter bookings matching name
  const results = state.bookings.filter(b => b.name.toLowerCase().includes(query));

  resultArea.style.display = 'block';
  tbody.innerHTML = '';

  if (results.length === 0) {
    summaryTitle.textContent = state.language === 'th' ? `ไม่พบรายการจองสำหรับ "${query}"` : `No bookings found for "${query}"`;
    summarySubtitle.textContent = state.language === 'th' ? 'กรุณาตรวจสอบชื่อ-นามสกุลแล้วลองอีกครั้ง' : 'Please check the name and try again.';
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><i class="fa-regular fa-calendar-xmark"></i>${state.language === 'th' ? 'ไม่พบข้อมูลการจอง' : 'No booking data found'}</td></tr>`;
    return;
  }

  // Sort results: newest bookings first
  results.sort((a, b) => new Date(b.date + 'T' + b.slot.split(' - ')[0]) - new Date(a.date + 'T' + a.slot.split(' - ')[0]));

  // Calculate stats for matching bookings
  const totalHours = results.length;
  const totalFee = results.reduce((sum, b) => sum + b.fee, 0);

  summaryTitle.textContent = state.language === 'th' ? 
    `พบรายการจองทั้งหมด ${totalHours} รายการ` : 
    `Found ${totalHours} bookings in total`;
  summarySubtitle.textContent = state.language === 'th' ? 
    `ยอดเงินรวมทั้งหมด: ${totalFee.toLocaleString()} ฿` : 
    `Total fee: ${totalFee.toLocaleString()} ฿`;

  results.forEach(booking => {
    const row = document.createElement('tr');
    
    const dOpt = { day: 'numeric', month: 'short', year: 'numeric' };
    const formattedDate = new Date(booking.date).toLocaleDateString(state.language === 'th' ? 'th-TH' : 'en-US', dOpt);

    const coachBadgeText = booking.requireCoach ? 
      translations[state.language].txtNeedCoach : translations[state.language].txtNoCoach;
    const coachBadgeClass = booking.requireCoach ? 'badge coach' : 'badge no-coach';

    row.innerHTML = `
      <td style="font-weight: 500;">${formattedDate}</td>
      <td class="text-accent" style="font-weight: 600;">${booking.slot}</td>
      <td><span class="${coachBadgeClass}">${coachBadgeText}</span></td>
      <td style="font-weight: 600;">${booking.fee.toLocaleString()} ฿</td>
      <td style="font-family: monospace; font-size: 0.85rem; color: var(--text-secondary);">${booking.invoiceNo || '-'}</td>
      <td style="font-family: monospace; font-size: 0.85rem; color: #00e676;">${booking.receiptNo || '-'}</td>
    `;
    tbody.appendChild(row);
  });
}

// Check and recover admin session if active
async function checkAdminSession() {
  if (supabaseClient) {
    try {
      const { data: { session }, error } = await supabaseClient.auth.getSession();
      if (error) throw error;
      if (session && session.user && session.user.email === 'admin@grandslam.com') {
        state.isAdminLoggedIn = true;
        await fetchTransactionsFromSupabase();
      }
    } catch (e) {
      console.warn("Session check failed:", e);
    }
  }
}

// Start app
async function init() {
  loadStateFromStorage();

  setupTabNavigation();

  await fetchBookingsFromSupabase();
  await checkAdminSession();
  
  // Re-render calendar after fetching remote data
  renderCalendar();
  renderTimeSlots();

  applyLanguage();
  initLiff();

  const prevBtn = document.getElementById('prevMonthBtn');
  const nextBtn = document.getElementById('nextMonthBtn');

  if (prevBtn && nextBtn) {
    prevBtn.addEventListener('click', () => {
      state.currentDate.setMonth(state.currentDate.getMonth() - 1);
      state.selectedSlots = [];
      hideSummaryPanel();
      renderCalendar();
      renderTimeSlots();
    });
    nextBtn.addEventListener('click', () => {
      state.currentDate.setMonth(state.currentDate.getMonth() + 1);
      state.selectedSlots = [];
      hideSummaryPanel();
      renderCalendar();
      renderTimeSlots();
    });
  }

  const langSelect = document.getElementById('langSwitch');
  if (langSelect) {
    langSelect.addEventListener('change', (e) => {
      state.language = e.target.value;
      saveStateToStorage();
      applyLanguage();
    });
  }

  initBookingWizard();
  initAdminAuth();
  initAdminForms();
  initBookingSearch();

  const txDateInput = document.getElementById('txDate');
  if (txDateInput) {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    txDateInput.value = `${y}-${m}-${d}`;
  }

  // Set up Admin Filters
  const monthFilter = document.getElementById('adminMonthFilter');
  const yearFilter = document.getElementById('adminYearFilter');
  const clearMonthFilterBtn = document.getElementById('btnClearMonthFilter');

  if (monthFilter) {
    monthFilter.addEventListener('change', () => {
      // Sync year filter if month is selected
      if (monthFilter.value) {
        const year = monthFilter.value.split('-')[0];
        if (yearFilter) {
          yearFilter.value = year;
        }
      }
      renderAdminDashboard();
    });
  }

  if (yearFilter) {
    yearFilter.addEventListener('change', () => {
      // Clear month filter if it doesn't match the selected year
      if (monthFilter && monthFilter.value) {
        const monthYear = monthFilter.value.split('-')[0];
        if (monthYear !== yearFilter.value) {
          monthFilter.value = '';
        }
      }
      renderAdminDashboard();
    });
  }

  if (clearMonthFilterBtn) {
    clearMonthFilterBtn.addEventListener('click', () => {
      if (monthFilter) monthFilter.value = '';
      if (yearFilter) yearFilter.value = '';
      renderAdminDashboard();
    });
  }

  // === Auto-refresh mechanism ===
  // Fetch latest bookings from Supabase every 10 seconds to keep timeslots updated
  if (state.autoRefreshTimer) clearInterval(state.autoRefreshTimer);
  state.autoRefreshTimer = setInterval(async () => {
    if (state.config.supabaseUrl && state.config.supabaseKey && !state.isFetchingBookings) {
      // Fetch data silently
      await fetchBookingsFromSupabase(true);
      
      // If admin is logged in, fetch transactions too
      if (state.isAdminLoggedIn) {
        await fetchTransactionsFromSupabase();
      }
      
      // If user is viewing the slots, re-render them smoothly
      if (document.getElementById('booking').classList.contains('active')) {
        renderTimeSlotsUI();
      }
      
      // If admin is viewing the admin dashboard, re-render dashboard
      if (state.isAdminLoggedIn && document.getElementById('admin').classList.contains('active')) {
        renderAdminDashboard();
      }
    }
  }, 10000);

  showView('booking');
}

window.addEventListener('DOMContentLoaded', init);

