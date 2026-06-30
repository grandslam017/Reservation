// app_supabase.js - Reference code for migrating app.js from Google Apps Script to Supabase.
// Copy and adapt these patterns into your main app.js file.

// 1. IMPORT & INITIALIZE SUPABASE CLIENT
// Add this tag to your index.html: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
// Initialize the Supabase client:
const supabaseUrl = 'https://YOUR_SUPABASE_PROJECT_REF.supabase.co';
const supabaseKey = 'YOUR_SUPABASE_ANON_KEY'; // Use the public anon key
const supabase = supabase.createClient(supabaseUrl, supabaseKey);

// 2. FETCH BOOKINGS (Source of Truth)
// Replaces: fetchBookingsFromGoogle
async function fetchBookingsFromSupabase() {
  state.isFetchingBookings = true;
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .neq('status', 'cancelled'); // Get only active bookings

    if (error) throw error;

    // Map DB fields to state.bookings structure
    state.bookings = (data || []).map(b => ({
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
      fee: parseFloat(b.fee)
    }));

    saveStateToStorage();
  } catch (error) {
    console.error("Failed to fetch bookings from Supabase:", error);
    showToast("ไม่สามารถดึงข้อมูลการจองได้", "error");
  } finally {
    state.isFetchingBookings = false;
  }
}

// 3. UPLOAD PAYMENT SLIP TO STORAGE
// Replaces: base64 generation and upload to Google Drive
async function uploadSlipToSupabase(fileInputEl, invoiceNumber) {
  if (!fileInputEl.files || fileInputEl.files.length === 0) return null;
  const file = fileInputEl.files[0];
  const fileExt = file.name.split('.').pop();
  const fileName = `${invoiceNumber}_${Date.now()}.${fileExt}`;
  
  // Upload file to the 'slips' bucket we created in the migration
  const { data, error } = await supabase.storage
    .from('slips')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false
    });

  if (error) throw error;

  // Get the public URL of the uploaded slip
  const { data: { publicUrl } } = supabase.storage
    .from('slips')
    .getPublicUrl(fileName);

  return publicUrl;
}

// 4. SUBMIT BOOKING
// Replaces: syncBookingWithGoogle
async function submitBookingToSupabase(booking) {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .insert([{
        booking_date: booking.date,
        time_slot: booking.slot,
        customer_name: booking.name,
        phone: booking.phone,
        email: booking.email,
        line_id_input: booking.lineIdInput,
        line_user_id: booking.lineUserId,
        slip_url: booking.slipUrl,
        invoice_no: booking.invoiceNo,
        receipt_no: booking.receiptNo,
        court: booking.court,
        require_coach: booking.requireCoach,
        fee: booking.fee,
        status: 'confirmed'
      }])
      .select();

    if (error) {
      // Postgres unique constraint violation error code is '23505'
      if (error.code === '23505') {
        return { status: "collision" };
      }
      throw error;
    }

    return { status: "success", data: data[0] };
  } catch (error) {
    console.error("Booking Submission Error:", error);
    return { status: "error", message: error.message };
  }
}

// 5. FETCH & SAVE LEDGER TRANSACTIONS (Replaces LocalStorage Only)
async function fetchTransactionsFromSupabase() {
  try {
    const { data, error } = await supabase
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
    console.error("Failed to fetch transactions:", error);
  }
}

async function addTransactionToSupabase(tx) {
  try {
    const { data, error } = await supabase
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
    return data[0];
  } catch (error) {
    console.error("Failed to add transaction:", error);
    throw error;
  }
}

// 6. CANCEL / DELETE BOOKING (Admin Panel)
async function cancelBookingInSupabase(bookingId) {
  try {
    // We update the status to 'cancelled' so the unique slot constraint frees up the time slot.
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', bookingId);

    if (error) throw error;
    
    // Also delete any associated court rental transactions if desired:
    const { error: txError } = await supabase
      .from('transactions')
      .delete()
      .eq('booking_id', bookingId);

    if (txError) console.warn("Associated transaction deletion failed:", txError);
    
    return true;
  } catch (error) {
    console.error("Failed to cancel booking:", error);
    showToast("ไม่สามารถยกเลิกการจองได้", "error");
    return false;
  }
}

// 7. USER AUTHENTICATION FOR ADMIN LOGINS
// Replaces the simple string password validation with secure Supabase Auth!
async function loginAdmin(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (error) throw error;
    
    state.isAdminLoggedIn = true;
    showToast(translations[state.language].toastLoginSuccess, 'success');
    return true;
  } catch (error) {
    console.error("Login failed:", error);
    showToast(translations[state.language].toastLoginFail, 'error');
    return false;
  }
}

async function logoutAdmin() {
  await supabase.auth.signOut();
  state.isAdminLoggedIn = false;
  showView('booking');
}
