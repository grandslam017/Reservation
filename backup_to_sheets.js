function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const bookings = data.bookings || [];
    const transactions = data.transactions || [];
    
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    
    // Process Bookings
    let bookingSheet = spreadsheet.getSheetByName("Bookings");
    if (!bookingSheet) {
      bookingSheet = spreadsheet.insertSheet("Bookings");
      bookingSheet.appendRow(["ID", "Date", "Time Slot", "Customer", "Phone", "Email", "Court", "Require Coach", "Fee", "Invoice No", "Receipt No", "Slip URL"]);
    }
    
    // Clear existing data to replace with new backup
    const lastRowB = bookingSheet.getLastRow();
    if (lastRowB > 1) {
      bookingSheet.getRange(2, 1, lastRowB - 1, bookingSheet.getLastColumn()).clearContent();
    }
    
    const bookingRows = bookings.map(b => [
      b.id,
      b.date,
      b.slot,
      b.name,
      b.phone,
      b.email || "",
      b.court,
      b.requireCoach ? "Yes" : "No",
      b.fee,
      b.invoiceNo || "",
      b.receiptNo || "",
      b.slipUrl || ""
    ]);
    
    if (bookingRows.length > 0) {
      bookingSheet.getRange(2, 1, bookingRows.length, bookingRows[0].length).setValues(bookingRows);
    }
    
    // Process Transactions
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
      t.id,
      t.date,
      t.type,
      t.category,
      t.amount,
      t.description
    ]);
    
    if (txRows.length > 0) {
      txSheet.getRange(2, 1, txRows.length, txRows[0].length).setValues(txRows);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Backup completed successfully" }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Support HTTP GET for pre-flight testing and confirmation
function doGet(e) {
  return ContentService.createTextOutput("Backup Web App is active.")
    .setMimeType(ContentService.MimeType.TEXT);
}
