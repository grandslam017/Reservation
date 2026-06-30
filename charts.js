// charts.js - Handles Chart.js initialization and updates for the Admin Dashboard

// Keep chart references to update them dynamically
let trendChartInstance = null;
let incomeChartInstance = null;
let expenseChartInstance = null;

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
    const date = new Date(tx.date);
    const monthYear = date.toLocaleString('default', { month: 'short', year: 'numeric' }); // e.g. "Jun 2026"
    
    if (!monthlySummary[monthYear]) {
      monthlySummary[monthYear] = { income: 0, expense: 0 };
    }

    const amount = parseFloat(tx.amount) || 0;
    
    if (tx.type === 'income') {
      monthlySummary[monthYear].income += amount;
      
      // Categorize
      if (categories.income.hasOwnProperty(tx.category)) {
        categories.income[tx.category] += amount;
      } else {
        categories.income['Other Income'] += amount;
      }
    } else if (tx.type === 'expense') {
      monthlySummary[monthYear].expense += amount;
      
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
 * @param {Array} transactions 
 */
function initDashboardCharts(transactions) {
  const data = processTransactionData(transactions);
  
  // Destructure HTML canvas elements
  const trendCtx = document.getElementById('trendChart');
  const incomeCtx = document.getElementById('incomeChart');
  const expenseCtx = document.getElementById('expenseChart');
  
  if (!trendCtx || !incomeCtx || !expenseCtx) return;

  // Chart Global Default Settings for Dark Mode
  Chart.defaults.color = '#94a3b8';
  Chart.defaults.font.family = "'Inter', 'Sarabun', sans-serif";
  Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.05)';

  // 1. Trend Chart (Bar Chart: Income vs Expense)
  const months = Object.keys(data.monthlySummary);
  const incomeValues = months.map(m => data.monthlySummary[m].income);
  const expenseValues = months.map(m => data.monthlySummary[m].expense);

  trendChartInstance = new Chart(trendCtx, {
    type: 'bar',
    data: {
      labels: months.length > 0 ? months : ['No Data'],
      datasets: [
        {
          label: 'รายรับ (Income)',
          data: months.length > 0 ? incomeValues : [0],
          backgroundColor: 'rgba(16, 185, 129, 0.75)',
          borderColor: '#10b981',
          borderWidth: 1,
          borderRadius: 6
        },
        {
          label: 'รายจ่าย (Expense)',
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
  const incLabels = Object.keys(data.categories.income);
  const incValues = Object.values(data.categories.income);
  
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
  const expLabels = Object.keys(data.categories.expense);
  const expValues = Object.values(data.categories.expense);

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
 * @param {Array} transactions 
 */
function updateDashboardCharts(transactions) {
  if (!trendChartInstance || !incomeChartInstance || !expenseChartInstance) {
    // If charts are not initialized, do it now
    initDashboardCharts(transactions);
    return;
  }

  const data = processTransactionData(transactions);

  // Update Trend Chart
  const months = Object.keys(data.monthlySummary);
  const incomeValues = months.map(m => data.monthlySummary[m].income);
  const expenseValues = months.map(m => data.monthlySummary[m].expense);

  trendChartInstance.data.labels = months.length > 0 ? months : ['No Data'];
  trendChartInstance.data.datasets[0].data = months.length > 0 ? incomeValues : [0];
  trendChartInstance.data.datasets[1].data = months.length > 0 ? expenseValues : [0];
  trendChartInstance.update();

  // Update Income Chart
  incomeChartInstance.data.datasets[0].data = Object.values(data.categories.income);
  incomeChartInstance.update();

  // Update Expense Chart
  expenseChartInstance.data.datasets[0].data = Object.values(data.categories.expense);
  expenseChartInstance.update();
}

