// charts.js - Handles Chart.js initialization and updates for the Admin Dashboard

// Keep chart references to update them dynamically
let trendChartInstance = null;
let incomeChartInstance = null;
let expenseChartInstance = null;

// Helper: Format YYYY-MM string to locale-aware month and year
function formatYearMonth(ymStr, lang = 'th') {
  if (!ymStr || ymStr === 'No Data') return ymStr;
  const parts = ymStr.split('-');
  if (parts.length !== 2) return ymStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const date = new Date(year, month, 1);
  const monthName = date.toLocaleString(lang === 'th' ? 'th-TH' : 'en-US', { month: 'short' });
  const displayYear = lang === 'th' ? year + 543 : year;
  return `${monthName} ${displayYear}`;
}

/**
 * Helper to get grouped data for charts
 * @param {Array} transactions 
 */
function processTransactionData(transactions) {
  const categories = {
    income: {
      'Court Rental': 0,
      'Coach Fee': 0,
      'Equipment Shop': 0,
      'Cafe / Snacks': 0,
      'Other Income': 0
    },
    expense: {
      'Utilities (Electricity/Water)': 0,
      'Maintenance': 0,
      'Staff Salaries': 0,
      'Coach Payout': 0,
      'Equipment Purchase': 0,
      'Other Expense': 0
    }
  };

  // Group by month (YYYY-MM)
  const monthlySummary = {};

  transactions.forEach(tx => {
    if (!tx.date) return;
    const yyyymm = tx.date.substring(0, 7); // e.g. "2026-05"
    
    if (!monthlySummary[yyyymm]) {
      monthlySummary[yyyymm] = { income: 0, expense: 0 };
    }

    const amount = parseFloat(tx.amount) || 0;
    
    if (tx.type === 'income') {
      monthlySummary[yyyymm].income += amount;
      
      // Categorize
      if (categories.income.hasOwnProperty(tx.category)) {
        categories.income[tx.category] += amount;
      } else {
        categories.income['Other Income'] += amount;
      }
    } else if (tx.type === 'expense') {
      monthlySummary[yyyymm].expense += amount;
      
      // Categorize
      if (categories.expense.hasOwnProperty(tx.category)) {
        categories.expense[tx.category] += amount;
      } else {
        categories.expense['Other Expense'] += amount;
      }
    }
  });

  return {
    categories,
    monthlySummary
  };
}

/**
 * Initialize charts with transactions data
 * @param {Array} trendTransactions
 * @param {Array} categoryTransactions
 * @param {string} lang
 */
function initDashboardCharts(trendTransactions, categoryTransactions, lang = 'th') {
  const trendData = processTransactionData(trendTransactions);
  const catData = processTransactionData(categoryTransactions);
  
  // Destructure HTML canvas elements
  const trendCtx = document.getElementById('trendChart');
  const incomeCtx = document.getElementById('incomeChart');
  const expenseCtx = document.getElementById('expenseChart');
  
  if (!trendCtx || !incomeCtx || !expenseCtx) return;

  // Chart Global Default Settings for Dark Mode
  Chart.defaults.color = '#94a3b8';
  Chart.defaults.font.family = "'Inter', 'Sarabun', sans-serif";
  Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.05)';

  const getTranslation = (key, fallback) => {
    if (typeof translations !== 'undefined' && translations[lang] && translations[lang][key]) {
      return translations[lang][key];
    }
    return fallback;
  };

  const translateCategory = (cat) => {
    if (cat === 'Court Rental') return getTranslation('txtCourtRentalCat', 'Court Rental');
    if (cat === 'Coach Fee') return getTranslation('txtCoachFeeCat', 'Coach Fee');
    if (cat === 'Equipment Shop') return getTranslation('txtEquipmentShopCat', 'Equipment Shop');
    if (cat === 'Cafe / Snacks') return getTranslation('txtCafeCat', 'Cafe / Snacks');
    if (cat === 'Utilities (Electricity/Water)') return getTranslation('txtUtilitiesCat', 'Utilities');
    if (cat === 'Maintenance') return getTranslation('txtMaintenanceCat', 'Maintenance');
    if (cat === 'Staff Salaries') return getTranslation('txtSalariesCat', 'Staff Salaries');
    if (cat === 'Coach Payout') return getTranslation('txtCoachPayoutCat', 'Coach Payout');
    if (cat === 'Equipment Purchase') return getTranslation('txtEquipmentPurchaseCat', 'Equipment Purchase');
    if (cat === 'Other Income') return getTranslation('txtOtherIncomeCat', 'Other Income');
    if (cat === 'Other Expense') return getTranslation('txtOtherExpenseCat', 'Other Expense');
    return cat;
  };

  // 1. Trend Chart (Bar Chart: Income vs Expense)
  const months = Object.keys(trendData.monthlySummary).sort();
  const incomeValues = months.map(m => trendData.monthlySummary[m].income);
  const expenseValues = months.map(m => trendData.monthlySummary[m].expense);
  const monthLabels = months.map(m => formatYearMonth(m, lang));

  trendChartInstance = new Chart(trendCtx, {
    type: 'bar',
    data: {
      labels: months.length > 0 ? monthLabels : [lang === 'th' ? 'ไม่มีข้อมูล' : 'No Data'],
      datasets: [
        {
          label: lang === 'th' ? 'รายรับ (Income)' : 'Income',
          data: months.length > 0 ? incomeValues : [0],
          backgroundColor: 'rgba(16, 185, 129, 0.75)',
          borderColor: '#10b981',
          borderWidth: 1,
          borderRadius: 6
        },
        {
          label: lang === 'th' ? 'รายจ่าย (Expense)' : 'Expense',
          data: months.length > 0 ? expenseValues : [0],
          backgroundColor: 'rgba(239, 68, 68, 0.75)',
          borderColor: '#ef4444',
          borderWidth: 1,
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { padding: 15, boxWidth: 12, boxHeight: 12, usePointStyle: true, pointStyle: 'rectRounded' }
        },
        tooltip: {
          padding: 10,
          backgroundColor: '#1e293b',
          titleColor: '#f8fafc',
          bodyColor: '#cbd5e1',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return value.toLocaleString() + ' ฿';
            }
          }
        }
      }
    }
  });

  // 2. Income Category Chart (Doughnut)
  const incLabels = Object.keys(catData.categories.income).map(translateCategory);
  const incValues = Object.values(catData.categories.income);
  
  incomeChartInstance = new Chart(incomeCtx, {
    type: 'doughnut',
    data: {
      labels: incLabels,
      datasets: [{
        data: incValues,
        backgroundColor: [
          'rgba(214, 245, 83, 0.75)', // Accent tennis lime
          'rgba(59, 130, 246, 0.75)',  // Blue
          'rgba(16, 185, 129, 0.75)',  // Emerald
          'rgba(167, 139, 250, 0.75)', // Purple
          'rgba(148, 163, 184, 0.75)'  // Slate
        ],
        borderColor: '#0f172a',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { boxWidth: 10, padding: 10, usePointStyle: true }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const value = context.raw || 0;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
              return `${context.label}: ${value.toLocaleString()} ฿ (${percentage}%)`;
            }
          }
        }
      },
      cutout: '65%'
    }
  });

  // 3. Expense Category Chart (Doughnut)
  const expLabels = Object.keys(catData.categories.expense).map(translateCategory);
  const expValues = Object.values(catData.categories.expense);

  expenseChartInstance = new Chart(expenseCtx, {
    type: 'doughnut',
    data: {
      labels: expLabels,
      datasets: [{
        data: expValues,
        backgroundColor: [
          'rgba(239, 68, 68, 0.75)',   // Red
          'rgba(249, 115, 22, 0.75)',  // Orange
          'rgba(234, 179, 8, 0.75)',   // Yellow
          'rgba(236, 72, 153, 0.75)',  // Pink
          'rgba(45, 212, 191, 0.75)',  // Teal
          'rgba(148, 163, 184, 0.75)'  // Slate
        ],
        borderColor: '#0f172a',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { boxWidth: 10, padding: 10, usePointStyle: true }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const value = context.raw || 0;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
              return `${context.label}: ${value.toLocaleString()} ฿ (${percentage}%)`;
            }
          }
        }
      },
      cutout: '65%'
    }
  });
}

/**
 * Update existing charts with new transactions data
 * @param {Array} trendTransactions
 * @param {Array} categoryTransactions
 * @param {string} lang
 */
function updateDashboardCharts(trendTransactions, categoryTransactions, lang = 'th') {
  if (!trendChartInstance || !incomeChartInstance || !expenseChartInstance) {
    initDashboardCharts(trendTransactions, categoryTransactions, lang);
    return;
  }

  const trendData = processTransactionData(trendTransactions);
  const catData = processTransactionData(categoryTransactions);

  const getTranslation = (key, fallback) => {
    if (typeof translations !== 'undefined' && translations[lang] && translations[lang][key]) {
      return translations[lang][key];
    }
    return fallback;
  };

  const translateCategory = (cat) => {
    if (cat === 'Court Rental') return getTranslation('txtCourtRentalCat', 'Court Rental');
    if (cat === 'Coach Fee') return getTranslation('txtCoachFeeCat', 'Coach Fee');
    if (cat === 'Equipment Shop') return getTranslation('txtEquipmentShopCat', 'Equipment Shop');
    if (cat === 'Cafe / Snacks') return getTranslation('txtCafeCat', 'Cafe / Snacks');
    if (cat === 'Utilities (Electricity/Water)') return getTranslation('txtUtilitiesCat', 'Utilities');
    if (cat === 'Maintenance') return getTranslation('txtMaintenanceCat', 'Maintenance');
    if (cat === 'Staff Salaries') return getTranslation('txtSalariesCat', 'Staff Salaries');
    if (cat === 'Coach Payout') return getTranslation('txtCoachPayoutCat', 'Coach Payout');
    if (cat === 'Equipment Purchase') return getTranslation('txtEquipmentPurchaseCat', 'Equipment Purchase');
    if (cat === 'Other Income') return getTranslation('txtOtherIncomeCat', 'Other Income');
    if (cat === 'Other Expense') return getTranslation('txtOtherExpenseCat', 'Other Expense');
    return cat;
  };

  // Update Trend Chart
  const months = Object.keys(trendData.monthlySummary).sort();
  const incomeValues = months.map(m => trendData.monthlySummary[m].income);
  const expenseValues = months.map(m => trendData.monthlySummary[m].expense);
  const monthLabels = months.map(m => formatYearMonth(m, lang));

  trendChartInstance.data.labels = months.length > 0 ? monthLabels : [lang === 'th' ? 'ไม่มีข้อมูล' : 'No Data'];
  trendChartInstance.data.datasets[0].label = lang === 'th' ? 'รายรับ (Income)' : 'Income';
  trendChartInstance.data.datasets[0].data = months.length > 0 ? incomeValues : [0];
  trendChartInstance.data.datasets[1].label = lang === 'th' ? 'รายจ่าย (Expense)' : 'Expense';
  trendChartInstance.data.datasets[1].data = months.length > 0 ? expenseValues : [0];
  trendChartInstance.update();

  // Update Income Chart
  incomeChartInstance.data.labels = Object.keys(catData.categories.income).map(translateCategory);
  incomeChartInstance.data.datasets[0].data = Object.values(catData.categories.income);
  incomeChartInstance.update();

  // Update Expense Chart
  expenseChartInstance.data.labels = Object.keys(catData.categories.expense).map(translateCategory);
  expenseChartInstance.data.datasets[0].data = Object.values(catData.categories.expense);
  expenseChartInstance.update();
}

