// CSC Digital Seva Portal - Role-Based Panel & Dashboard Controller

let currentUser = null;
let currentServices = [];
let currentApplications = [];
let currentTransactions = [];
let currentTickets = [];
let currentVLEs = [];

document.addEventListener('DOMContentLoaded', async () => {
  const token = API.getToken();
  if (!token) {
    window.location.href = 'index.html?login_required=1';
    return;
  }

  try {
    const profileRes = await API.auth.getProfile();
    currentUser = profileRes.user;
    API.setCurrentUser(currentUser);
    setupUIForRole(currentUser);
    setupNavigation();
    setupModals();
    setupNotifications();
    setupOmnisearch();
    setupGlobalShortcuts();
    initMobileDrawer();
    initTablePaginators();
    // Detect and highlight current active page
    const pageAttr = document.body.getAttribute('data-page');
    const path = window.location.pathname.toLowerCase();
    const currentPage = pageAttr || (
      path.includes('applications') ? 'applications' :
      path.includes('services') ? 'services' :
      path.includes('wallet') ? 'wallet' :
      path.includes('recharge') ? 'recharge_requests' :
      path.includes('vles') ? 'vles' :
      path.includes('service_manager') ? 'service_manager' :
      path.includes('tickets') ? 'tickets' :
      path.includes('profile') ? 'profile' : 'dashboard'
    );

    document.querySelectorAll('.sidebar-nav .nav-link').forEach(link => {
      const v = link.getAttribute('data-view');
      link.classList.toggle('active', v === currentPage || (currentPage === 'recharge' && v === 'recharge_requests'));
    });

    // Execute relevant page data loader
    if (currentPage === 'dashboard') {
      await loadDashboardStats();
      await loadApplications();
      await loadWalletTransactions();
    } else if (currentPage === 'applications') {
      await loadApplications();
    } else if (currentPage === 'services') {
      await loadServicesCatalog();
    } else if (currentPage === 'wallet') {
      await loadWalletTransactions();
      if (currentUser.role !== 'admin') await loadMyRechargeRequests();
    } else if (currentPage === 'recharge' || currentPage === 'recharge_requests') {
      if (currentUser.role === 'admin') await loadRechargeRequests();
      else await loadMyRechargeRequests();
    } else if (currentPage === 'vles') {
      if (currentUser.role === 'admin') await loadVLEList();
    } else if (currentPage === 'service_manager') {
      if (currentUser.role === 'admin') await loadAdminServicesManager();
    } else if (currentPage === 'tickets') {
      await loadTickets();
    } else if (currentPage === 'profile') {
      loadProfileView();
    }

    // Pre-cache services for Apply Service modal dropdown across all pages
    if (!currentServices || currentServices.length === 0) {
      loadServicesCatalog().catch(() => {});
    }

    // Check if URL has ?apply=serviceId
    const urlParams = new URLSearchParams(window.location.search);
    const applyServiceId = urlParams.get('apply');
    if (applyServiceId) {
      setTimeout(() => openApplyModal(applyServiceId), 400);
    }
  } catch (err) {
    console.error('Session error:', err);
    API.clearAuth();
    window.location.href = 'index.html?session_invalid=1';
  }
});

// Toast Notification System
function showToast(title, message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const icons = {
    success: '<i class="fa-solid fa-circle-check" style="color:#16a34a;"></i>',
    error: '<i class="fa-solid fa-circle-xmark" style="color:#dc2626;"></i>',
    warning: '<i class="fa-solid fa-triangle-exclamation" style="color:#ea580c;"></i>',
    info: '<i class="fa-solid fa-circle-info" style="color:#0284c7;"></i>'
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <div class="toast-content">
      <div class="toast-title">${escapeHtml(title)}</div>
      <div class="toast-body">${escapeHtml(message)}</div>
    </div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 250);
  }, 4000);
}



// ==========================================================================
// Reusable Table Pagination Component
// ==========================================================================
class TablePagination {
  constructor(options) {
    this.tableId = options.tableId;
    this.pageSize = options.pageSize || 10;
    this.currentPage = 1;
    this.data = [];
    this.renderRow = options.renderRow;
    this.tbodyId = options.tbodyId;
    this.infoId = options.infoId;
    this.controlsId = options.controlsId;
    this.pageSizeId = options.pageSizeId;
    this.emptyMessage = options.emptyMessage || 'No records found.';
    this.colspan = options.colspan || 7;

    const pageSizeEl = document.getElementById(this.pageSizeId);
    if (pageSizeEl) {
      pageSizeEl.addEventListener('change', (e) => {
        this.pageSize = parseInt(e.target.value, 10) || 10;
        this.currentPage = 1;
        this.render();
      });
    }
  }

  setData(data) {
    this.data = data || [];
    this.currentPage = 1;
    this.render();
  }

  setPage(page) {
    const totalPages = Math.ceil(this.data.length / this.pageSize) || 1;
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    this.currentPage = page;
    this.render();
  }

  render() {
    const tbodyEl = document.getElementById(this.tbodyId);
    const infoEl = document.getElementById(this.infoId);
    const controlsEl = document.getElementById(this.controlsId);

    if (!tbodyEl) return;
    const total = this.data.length;
    const totalPages = Math.ceil(total / this.pageSize) || 1;

    if (this.currentPage > totalPages) this.currentPage = totalPages;

    const startIdx = (this.currentPage - 1) * this.pageSize;
    const endIdx = Math.min(startIdx + this.pageSize, total);
    const pageItems = this.data.slice(startIdx, endIdx);

    if (pageItems.length === 0) {
      tbodyEl.innerHTML = `<tr><td colspan="${this.colspan}" style="text-align: center; padding: 32px 16px; color: var(--text-muted);"><i class="fa-solid fa-inbox" style="font-size: 24px; display: block; margin-bottom: 8px; opacity: 0.5;"></i>${this.emptyMessage}</td></tr>`;
    } else {
      tbodyEl.innerHTML = pageItems.map((item, idx) => this.renderRow(item, startIdx + idx)).join('');
    }

    if (infoEl) {
      if (total === 0) {
        infoEl.innerHTML = 'Showing <strong>0</strong> to <strong>0</strong> of <strong>0</strong> entries';
      } else {
        infoEl.innerHTML = `Showing <strong>${startIdx + 1}</strong> to <strong>${endIdx}</strong> of <strong>${total}</strong> entries`;
      }
    }

    if (controlsEl) {
      if (totalPages <= 1) {
        controlsEl.innerHTML = '';
        return;
      }

      let html = '';
      html += `<button class="page-nav-btn ${this.currentPage === 1 ? 'disabled' : ''}" onclick="window.${this.tableId}Paginator.setPage(1)" title="First Page"><i class="fa-solid fa-angles-left"></i></button>`;
      html += `<button class="page-nav-btn ${this.currentPage === 1 ? 'disabled' : ''}" onclick="window.${this.tableId}Paginator.setPage(${this.currentPage - 1})" title="Previous Page"><i class="fa-solid fa-chevron-left"></i></button>`;

      let startP = Math.max(1, this.currentPage - 2);
      let endP = Math.min(totalPages, startP + 4);
      if (endP - startP < 4) startP = Math.max(1, endP - 4);

      for (let p = startP; p <= endP; p++) {
        html += `<button class="page-num-btn ${p === this.currentPage ? 'active' : ''}" onclick="window.${this.tableId}Paginator.setPage(${p})">${p}</button>`;
      }

      html += `<button class="page-nav-btn ${this.currentPage === totalPages ? 'disabled' : ''}" onclick="window.${this.tableId}Paginator.setPage(${this.currentPage + 1})" title="Next Page"><i class="fa-solid fa-chevron-right"></i></button>`;
      html += `<button class="page-nav-btn ${this.currentPage === totalPages ? 'disabled' : ''}" onclick="window.${this.tableId}Paginator.setPage(${totalPages})" title="Last Page"><i class="fa-solid fa-angles-right"></i></button>`;

      controlsEl.innerHTML = html;
    }
  }
}


function initTablePaginators() {
  window.appPaginator = new TablePagination({
    tableId: 'app',
    tbodyId: 'applicationsTableBody',
    infoId: 'appPaginationInfo',
    controlsId: 'appPaginationButtons',
    pageSizeId: 'appPageSize',
    pageSize: 10,
    colspan: 8,
    emptyMessage: 'No citizen applications found matching your search or filters.',
    renderRow: (item) => renderApplicationRowHtml(item, true)
  });

  window.vlePaginator = new TablePagination({
    tableId: 'vle',
    tbodyId: 'vleTableBody',
    infoId: 'vlePaginationInfo',
    controlsId: 'vlePaginationButtons',
    pageSizeId: 'vlePageSize',
    pageSize: 10,
    colspan: 7,
    emptyMessage: 'No VLE operators found matching your search or filters.',
    renderRow: (item) => renderVleRowHtml(item)
  });

  window.walletPaginator = new TablePagination({
    tableId: 'wallet',
    tbodyId: 'walletTableBody',
    infoId: 'walletPaginationInfo',
    controlsId: 'walletPaginationButtons',
    pageSizeId: 'walletPageSize',
    pageSize: 10,
    colspan: 6,
    emptyMessage: 'No wallet ledger transactions found matching your criteria.',
    renderRow: (item) => renderWalletTxnRowHtml(item)
  });

  window.myRechargePaginator = new TablePagination({
    tableId: 'myRecharge',
    tbodyId: 'myRechargeRequestsTbody',
    infoId: 'myRechargePaginationInfo',
    controlsId: 'myRechargePaginationButtons',
    pageSizeId: 'myRechargePageSize',
    pageSize: 10,
    colspan: 7,
    emptyMessage: 'No recharge requests submitted yet.',
    renderRow: (item) => renderMyRechargeRowHtml(item)
  });

  window.rechargeReqPaginator = new TablePagination({
    tableId: 'rechargeReq',
    tbodyId: 'rechargeRequestsTableBody',
    infoId: 'rechargeReqPaginationInfo',
    controlsId: 'rechargeReqPaginationButtons',
    pageSizeId: 'rechargeReqPageSize',
    pageSize: 10,
    colspan: 8,
    emptyMessage: 'No recharge requests found matching your criteria.',
    renderRow: (item) => renderAdminRechargeRowHtml(item)
  });
}

// Unified Confirmation Modal (Replacing native browser confirm())
function showConfirmationModal({
  title = 'Confirmation',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDestructive = false,
  icon = 'fa-circle-question'
} = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirmationModal');
    const titleEl = document.getElementById('confirmModalTitle');
    const msgEl = document.getElementById('confirmModalMessage');
    const okBtn = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');
    const closeBtn = document.getElementById('confirmCancelCloseBtn');
    const iconEl = document.getElementById('confirmModalIcon');
    const iconWrap = document.getElementById('confirmIconWrapper');

    if (!modal) {
      resolve(true);
      return;
    }

    titleEl.innerHTML = `<i class="fa-solid ${icon}" style="margin-right: 8px;"></i> ${escapeHtml(title)}`;
    msgEl.innerHTML = escapeHtml(message);
    okBtn.innerText = confirmText;
    cancelBtn.innerText = cancelText;

    if (isDestructive) {
      okBtn.className = 'btn btn-outline';
      okBtn.style.background = '#dc2626';
      okBtn.style.borderColor = '#dc2626';
      okBtn.style.color = '#ffffff';
      iconWrap.style.background = '#fee2e2';
      iconWrap.style.color = '#dc2626';
      iconEl.className = 'fa-solid fa-triangle-exclamation';
    } else {
      okBtn.className = 'btn btn-primary';
      okBtn.style.background = '#002b49';
      okBtn.style.borderColor = '#002b49';
      okBtn.style.color = '#ffffff';
      iconWrap.style.background = '#eff6ff';
      iconWrap.style.color = '#0284c7';
      iconEl.className = `fa-solid ${icon}`;
    }

    const cleanup = () => {
      modal.classList.remove('active');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      closeBtn.removeEventListener('click', onCancel);
    };

    const onOk = () => {
      cleanup();
      resolve(true);
    };

    const onCancel = () => {
      cleanup();
      resolve(false);
    };

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    closeBtn.addEventListener('click', onCancel);

    modal.classList.add('active');
  });
}

// Live IST Digital Clock
function updateLiveClock() {
  const clockEl = document.getElementById('liveIstClock');
  if (!clockEl) return;
  const now = new Date();
  const options = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' };
  clockEl.innerText = `Online • IST ${now.toLocaleTimeString('en-IN', options)}`;
}
setInterval(updateLiveClock, 1000);
updateLiveClock();

// Copy to Clipboard with Toast Notification
function copyToClipboard(text, label = 'Copied') {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Copied', `${label} (${text}) copied to clipboard.`, 'info');
    }).catch(() => {
      showToast('Copy Notice', text, 'info');
    });
  } else {
    showToast('Copy Notice', text, 'info');
  }
}

// Configure UI based on Role (Super Admin vs VLE Operator)
function setupUIForRole(user) {
  const isSuperAdmin = user.role === 'admin';

  // Personalized Welcome Banner
  const welcomeHeading = document.getElementById('welcomeBannerHeading');
  if (welcomeHeading) {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    welcomeHeading.innerHTML = `${greeting}, ${escapeHtml(user.name)}`;
  }

  // Role Badge
  const roleBadge = document.getElementById('userRoleBadge');
  if (roleBadge) {
    roleBadge.innerText = isSuperAdmin ? 'Super Admin HQ' : 'VLE Operator';
    roleBadge.className = `role-badge ${isSuperAdmin ? 'admin' : 'user'}`;
  }

  const bannerTag = document.getElementById('bannerRoleTag');
  if (bannerTag) {
    bannerTag.innerText = isSuperAdmin ? 'Super Admin Control Hub' : 'VLE Digital Seva Kendra';
  }

  // Header and Profile Dropdown info
  const initial = (user.name || 'U').charAt(0).toUpperCase();
  const headerAvatar = document.getElementById('headerUserAvatar');
  if (headerAvatar) headerAvatar.innerText = initial;

  const dropdownAvatar = document.getElementById('dropdownUserAvatar');
  if (dropdownAvatar) dropdownAvatar.innerText = initial;

  const dropdownName = document.getElementById('dropdownUserName');
  if (dropdownName) dropdownName.innerText = user.name || 'Operator';

  const dropdownCscId = document.getElementById('dropdownUserCscId');
  if (dropdownCscId) dropdownCscId.innerText = user.csc_id;

  const dropdownRole = document.getElementById('dropdownUserRole');
  if (dropdownRole) dropdownRole.innerText = isSuperAdmin ? 'SUPER ADMIN HQ' : 'VLE OPERATOR';

  const dropdownCenter = document.getElementById('dropdownUserCenter');
  if (dropdownCenter) dropdownCenter.innerText = user.center_name || (isSuperAdmin ? 'National Headquarters' : 'Common Services Center');

  const dropdownLoc = document.getElementById('dropdownUserLocation');
  if (dropdownLoc) {
    const locParts = [user.district, user.state].filter(Boolean);
    dropdownLoc.innerText = locParts.length ? locParts.join(', ') : (isSuperAdmin ? 'New Delhi, India' : 'India');
  }

  // Wallet Balance
  updateWalletDisplay(user.wallet_balance);

  // Admin-Only Sidebar Navigation
  document.querySelectorAll('.admin-only-nav').forEach(el => {
    el.style.display = isSuperAdmin ? 'flex' : 'none';
  });

  // Admin-Only Elements in views
  document.querySelectorAll('.admin-only-feature').forEach(el => {
    el.style.display = isSuperAdmin ? 'table-cell' : 'none';
  });

  // User-Only Elements in views
  document.querySelectorAll('.user-only-feature').forEach(el => {
    el.style.display = isSuperAdmin ? 'none' : 'block';
  });
}

// Update Wallet Balance Display
function updateWalletDisplay(balance) {
  const num = parseFloat(balance || 0);
  const formatted = num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const walletElem = document.getElementById('headerWalletBalance');
  if (walletElem) walletElem.innerText = `₹${formatted}`;
  const myWalletElem = document.getElementById('myWalletBalanceLarge');
  if (myWalletElem) myWalletElem.innerText = `₹${formatted}`;
  const dropdownWallet = document.getElementById('dropdownUserWallet');
  if (dropdownWallet) dropdownWallet.innerText = `₹${formatted}`;
}

// Setup Tab Navigation
function setupNavigation() {
  document.querySelectorAll('.sidebar-nav .nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      const targetView = link.getAttribute('data-view');
      const targetHref = link.getAttribute('href');
      const targetViewEl = document.getElementById(`view-${targetView}`);

      if (targetViewEl) {
        e.preventDefault();
        switchView(targetView);
      } else if (targetHref && !targetHref.startsWith('#')) {
        // Native navigation to separate HTML page
      } else if (targetView) {
        e.preventDefault();
        switchView(targetView);
      }
    });
  });

  // Logout buttons (sidebar and header profile dropdown)
  const handleLogout = async () => {
    const confirmed = await showConfirmationModal({
      title: 'Sign Out from Portal',
      message: 'Are you sure you want to sign out from your CSC Digital Seva session?',
      confirmText: 'Sign Out',
      isDestructive: false,
      icon: 'fa-right-from-bracket'
    });
    if (confirmed) {
      API.clearAuth();
      window.location.href = 'index.html';
    }
  };
  document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
  document.getElementById('dropdownLogoutBtn')?.addEventListener('click', handleLogout);

  // Quick Apply Button
  document.getElementById('quickNewAppBtn')?.addEventListener('click', () => {
    openApplyModal();
  });

  // Topup / Recharge Wallet Button
  document.querySelectorAll('.open-topup-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (currentUser && currentUser.role === 'admin') {
        openDirectAdjustModal();
      } else {
        const modal = document.getElementById('topupModal');
        if (modal) {
          modal.classList.add('active');
          const amt = parseFloat(document.getElementById('rechargeAmountInput')?.value) || 5000;
          updateRechargeBonusCalc(amt);
        }
      }
    });
  });
}

// Switch between dashboard views
const PAGE_MAP = {
  'dashboard': 'dashboard.html',
  'applications': 'applications.html',
  'services': 'services.html',
  'wallet': 'wallet.html',
  'recharge_requests': 'recharge.html',
  'recharge_admin': 'recharge.html',
  'recharge_vle': 'recharge.html',
  'vles': 'vles.html',
  'service_manager': 'service_manager.html',
  'tickets': 'tickets.html',
  'profile': 'profile.html'
};

function switchView(viewName) {
  document.body.classList.remove('sidebar-open');
  const sidebar = document.getElementById('panelSidebar');
  if (sidebar) sidebar.classList.remove('mobile-active');

  const targetViewEl = document.getElementById(`view-${viewName}`);
  const targetPage = PAGE_MAP[viewName];

  if (targetViewEl) {
    document.querySelectorAll('.sidebar-nav .nav-link').forEach(link => {
      link.classList.toggle('active', link.getAttribute('data-view') === viewName);
    });

    document.querySelectorAll('.panel-view').forEach(view => {
      view.style.display = view.id === `view-${viewName}` ? 'block' : 'none';
    });

    if (viewName === 'dashboard') loadDashboardStats();
    if (viewName === 'applications') loadApplications();
    if (viewName === 'services') loadServicesCatalog();
    if (viewName === 'wallet') {
      loadWalletTransactions();
      if (currentUser && currentUser.role !== 'admin') loadMyRechargeRequests();
    }
    if (viewName === 'recharge_requests') {
      if (currentUser && currentUser.role === 'admin') loadRechargeRequests();
      else loadMyRechargeRequests();
    }
    if (viewName === 'vles' && currentUser && currentUser.role === 'admin') loadVLEList();
    if (viewName === 'service_manager' && currentUser && currentUser.role === 'admin') loadAdminServicesManager();
    if (viewName === 'tickets') loadTickets();
    if (viewName === 'profile') loadProfileView();
  } else if (targetPage) {
    window.location.href = targetPage;
  }
}

// Load Initial Data
async function loadInitialData() {
  const promises = [
    loadServicesCatalog(),
    loadApplications(),
    loadWalletTransactions()
  ];
  if (currentUser.role === 'admin') {
    promises.push(loadRechargeRequests());
  } else {
    promises.push(loadMyRechargeRequests());
  }
  await Promise.all(promises);
}

// Load Dashboard KPIs & Stats (Role-Tailored from MySQL)
async function loadDashboardStats() {
  try {
    const data = await API.stats.getDashboard();
    const stats = data.stats;
    const isSuperAdmin = currentUser.role === 'admin';

    const kpiContainer = document.getElementById('dashboardKpis');
    if (kpiContainer) {
      if (isSuperAdmin) {
        kpiContainer.innerHTML = `
          <div class="kpi-card">
            <div class="kpi-data">
              <span class="kpi-title">Total Registered VLEs</span>
              <span class="kpi-value">${stats.total_vles}</span>
              <span style="font-size: 11px; color: #16a34a; font-weight: 600;">${stats.active_vles} Active Centres</span>
            </div>
            <div class="kpi-icon-wrap icon-blue"><i class="fa-solid fa-users"></i></div>
          </div>

          <div class="kpi-card">
            <div class="kpi-data">
              <span class="kpi-title">Network Applications</span>
              <span class="kpi-value">${stats.total_applications}</span>
              <span style="font-size: 11px; color: #ea580c; font-weight: 600;">${stats.pending_applications} Pending Action</span>
            </div>
            <div class="kpi-icon-wrap icon-orange"><i class="fa-solid fa-file-invoice"></i></div>
          </div>

          <div class="kpi-card">
            <div class="kpi-data">
              <span class="kpi-title">Network Wallet Holding</span>
              <span class="kpi-value">₹${stats.total_network_wallet.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              <span style="font-size: 11px; color: #64748b;">VLE Deposited Capital</span>
            </div>
            <div class="kpi-icon-wrap icon-green"><i class="fa-solid fa-wallet"></i></div>
          </div>

          <div class="kpi-card">
            <div class="kpi-data">
              <span class="kpi-title">Total Commission Disbursed</span>
              <span class="kpi-value">₹${stats.total_commission_disbursed.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              <span style="font-size: 11px; color: #16a34a; font-weight: 600;">Paid to VLE Network</span>
            </div>
            <div class="kpi-icon-wrap icon-purple"><i class="fa-solid fa-chart-line"></i></div>
          </div>
        `;
      } else {
        kpiContainer.innerHTML = `
          <div class="kpi-card">
            <div class="kpi-data">
              <span class="kpi-title">My Wallet Balance</span>
              <span class="kpi-value">₹${stats.wallet_balance.toFixed(2)}</span>
              <span style="font-size: 11px; color: #16a34a; font-weight: 600;">Live Available Balance</span>
            </div>
            <div class="kpi-icon-wrap icon-green"><i class="fa-solid fa-wallet"></i></div>
          </div>

          <div class="kpi-card">
            <div class="kpi-data">
              <span class="kpi-title">My Citizen Applications</span>
              <span class="kpi-value">${stats.total_applications}</span>
              <span style="font-size: 11px; color: #ea580c; font-weight: 600;">${stats.pending_applications} Under Processing</span>
            </div>
            <div class="kpi-icon-wrap icon-blue"><i class="fa-solid fa-file-lines"></i></div>
          </div>

          <div class="kpi-card">
            <div class="kpi-data">
              <span class="kpi-title">Total Commission Earned</span>
              <span class="kpi-value">₹${stats.total_commission_earned.toFixed(2)}</span>
              <span style="font-size: 11px; color: #16a34a; font-weight: 600;">Credited to Wallet</span>
            </div>
            <div class="kpi-icon-wrap icon-purple"><i class="fa-solid fa-indian-rupee-sign"></i></div>
          </div>

          <div class="kpi-card">
            <div class="kpi-data">
              <span class="kpi-title">Completed Applications</span>
              <span class="kpi-value">${stats.completed_applications}</span>
              <span style="font-size: 11px; color: #0284c7; font-weight: 600;">Successfully Delivered</span>
            </div>
            <div class="kpi-icon-wrap icon-orange"><i class="fa-solid fa-circle-check"></i></div>
          </div>
        `;
      }
    }

    renderDashboardAnalytics(stats, data.category_breakdown || [], data.top_services || []);
    renderDashboardAuditStream();
  } catch (err) {
    console.error('Failed to load dashboard stats:', err);
  }
}

// Render Analytics Progress Bars & Pipeline
function renderDashboardAnalytics(stats, categoryBreakdown, topServices) {
  const chart1 = document.getElementById('categoryChartContainer');
  const chart2 = document.getElementById('statusPipelineContainer');
  const isSuperAdmin = currentUser.role === 'admin';

  if (chart1) {
    const list = isSuperAdmin ? categoryBreakdown : topServices;
    if (!list || list.length === 0) {
      chart1.innerHTML = '<div style="color: #94a3b8; font-size: 12.5px; padding: 12px 0;">No historical application activity recorded yet.</div>';
    } else {
      const maxVal = Math.max(...list.map(i => parseInt(i.app_count || i.count || 1)), 1);
      chart1.innerHTML = list.slice(0, 5).map(item => {
        const count = parseInt(item.app_count || item.count || 0);
        const name = item.category || item.name;
        const pct = Math.min(100, Math.round((count / maxVal) * 100));
        return `
          <div class="stat-bar-item" style="margin-bottom: 12px;">
            <div class="stat-bar-header" style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
              <span style="font-weight: 600; color: var(--text-heading);">${escapeHtml(name)}</span>
              <span style="color: var(--text-muted);"><strong>${count}</strong> apps (${pct}%)</span>
            </div>
            <div class="stat-progress-track" style="height: 6px; background: #e2e8f0; border-radius: 999px; overflow: hidden;">
              <div class="stat-progress-bar" style="height: 100%; width: ${pct}%; background: #0284c7; border-radius: 999px;"></div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  if (chart2) {
    const total = stats.total_applications || 1;
    const pending = stats.pending_applications || 0;
    const approvedOrCompleted = (stats.completed_applications || 0) + (stats.approved_applications || 0);
    const pendingPct = Math.round((pending / total) * 100) || 0;
    const completedPct = Math.round((approvedOrCompleted / total) * 100) || 0;

    chart2.innerHTML = `
      <div class="stat-bar-item" style="margin-bottom: 14px;">
        <div class="stat-bar-header" style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
          <span style="color:#ea580c; font-weight:700;">⏳ Pending Review</span>
          <span><strong>${pending}</strong> (${pendingPct}%)</span>
        </div>
        <div class="stat-progress-track" style="height: 6px; background: #e2e8f0; border-radius: 999px; overflow: hidden;">
          <div class="stat-progress-bar" style="height: 100%; width: ${pendingPct}%; background: #f59e0b; border-radius: 999px;"></div>
        </div>
      </div>

      <div class="stat-bar-item" style="margin-bottom: 14px;">
        <div class="stat-bar-header" style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
          <span style="color:#059669; font-weight:700;"><i class="fa-solid fa-circle-check" style="margin-right:4px;"></i> Approved & Delivered</span>
          <span><strong>${approvedOrCompleted}</strong> (${completedPct}%)</span>
        </div>
        <div class="stat-progress-track" style="height: 6px; background: #e2e8f0; border-radius: 999px; overflow: hidden;">
          <div class="stat-progress-bar" style="height: 100%; width: ${completedPct}%; background: #10b981; border-radius: 999px;"></div>
        </div>
      </div>
    `;
  }
}

// Render Real-time Audit & Event Stream on Dashboard
function renderDashboardAuditStream() {
  const container = document.getElementById('dashboardAuditStreamContainer');
  if (!container) return;

  const events = [];

  if (currentApplications.length > 0) {
    currentApplications.slice(0, 5).forEach(app => {
      let color = '#2563eb';
      if (app.status === 'Approved') color = '#10b981';
      else if (app.status === 'Completed') color = '#059669';
      else if (app.status === 'Rejected') color = '#ef4444';
      else if (app.status === 'In Progress') color = '#f59e0b';

      events.push({
        text: `App #${app.application_no} (${app.service_name}) marked ${app.status}`,
        time: new Date(app.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        color
      });
    });
  }

  if (currentTransactions.length > 0) {
    currentTransactions.slice(0, 4).forEach(txn => {
      events.push({
        text: `${txn.type === 'credit' ? 'Wallet Credit' : 'Fee Debit'} ₹${parseFloat(txn.amount).toFixed(2)} - ${txn.description}`,
        time: new Date(txn.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        color: txn.type === 'credit' ? '#10b981' : '#f97316'
      });
    });
  }

  if (events.length === 0) {
    events.push(
      { text: 'National CSC Digital Seva cluster synchronized', time: 'Live', color: '#10b981' },
      { text: 'MySQL transaction audit ledger verified 100%', time: 'Live', color: '#2563eb' }
    );
  }

  container.innerHTML = events.map(e => `
    <div class="audit-stream-item">
      <span class="audit-stream-dot" style="background: ${e.color};"></span>
      <div class="audit-stream-info">
        <div class="audit-stream-text">${escapeHtml(e.text)}</div>
        <div class="audit-stream-time">${e.time}</div>
      </div>
    </div>
  `).join('');
}

// Filter Recent Applications Feed on Dashboard
function filterRecentFeed(status, btn) {
  if (btn) {
    document.querySelectorAll('#recentFeedFilterPills .filter-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }

  const filtered = status === 'All'
    ? currentApplications
    : currentApplications.filter(a => a.status === status);

  const tbody = document.getElementById('recentApplicationsTbody');
  if (tbody) {
    tbody.innerHTML = filtered.length === 0
      ? `<tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--text-muted);">No ${status} applications found in recent feed.</td></tr>`
      : filtered.slice(0, 6).map(app => renderApplicationRowHtml(app, false)).join('');
  }
}

// Update App Tab Badges Counts
function updateAppTabCounts(apps) {
  const counts = { All: apps.length, Pending: 0, 'In Progress': 0, Approved: 0, Completed: 0, Rejected: 0 };
  apps.forEach(a => {
    if (counts[a.status] !== undefined) counts[a.status]++;
  });

  const setIfExists = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
  };

  setIfExists('tabCountAll', counts.All);
  setIfExists('tabCountPending', counts.Pending);
  setIfExists('tabCountInProgress', counts['In Progress']);
  setIfExists('tabCountApproved', counts.Approved);
  setIfExists('tabCountCompleted', counts.Completed);
  setIfExists('tabCountRejected', counts.Rejected);
}

// Quick Tab Switcher for Applications Table
function setAppStatusTab(status, btn) {
  document.querySelectorAll('#appStatusTabs .tab-pill').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const select = document.getElementById('appStatusFilter');
  if (select) {
    select.value = status;
    filterApplications();
  }
}

// Load Applications (Strictly Role-Filtered from MySQL)
async function loadApplications() {
  const tbody = document.getElementById('applicationsTableBody');
  const recentTbody = document.getElementById('recentApplicationsTbody');
  if (!tbody && !recentTbody) return;

  try {
    const data = await API.applications.getAll();
    currentApplications = data.applications || [];
    updateAppTabCounts(currentApplications);
    renderApplicationsTable(currentApplications);
    filterRecentFeed('All', null);
    renderDashboardAuditStream();
  } catch (err) {
    console.error('Error fetching applications:', err);
  }
}

function renderApplicationRowHtml(app, isFullTable = true) {
  const isSuperAdmin = currentUser.role === 'admin';
  return `
    <tr>
      <td>
        <div style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer;" onclick="copyToClipboard('${escapeHtml(app.application_no)}', 'Application No')" title="Click to copy Application Number">
          <span style="font-family: var(--font-mono); font-weight: 700; color: var(--csc-blue-600);">${escapeHtml(app.application_no)}</span>
          <i class="fa-regular fa-copy" style="font-size: 11px; opacity: 0.6;"></i>
        </div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
          ${new Date(app.created_at).toLocaleDateString()} • ${new Date(app.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
        </div>
      </td>
      ${isFullTable && isSuperAdmin ? `
        <td>
          <div style="font-weight: 700; color: var(--text-heading);">${escapeHtml(app.vle_name || 'VLE Operator')}</div>
          <div style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">${escapeHtml(app.vle_csc_id || '')} (${escapeHtml(app.vle_state || 'Delhi')})</div>
        </td>
      ` : ''}
      <td>
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 32px; height: 32px; border-radius: 50%; background: #0284c7; color: #ffffff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 12px; flex-shrink: 0; box-shadow: 0 2px 4px rgba(2, 132, 199, 0.25);">
            ${escapeHtml((app.citizen_name || 'C').charAt(0).toUpperCase())}
          </div>
          <div>
            <div style="font-weight: 700; color: var(--text-heading);">${escapeHtml(app.citizen_name)}</div>
            <div style="font-size: 11.5px; color: var(--text-muted);"><i class="fa-solid fa-phone" style="font-size:10px; opacity:0.7;"></i> ${escapeHtml(app.citizen_phone)}</div>
          </div>
        </div>
      </td>
      <td>
        <div style="font-weight: 700; color: var(--text-heading);">${escapeHtml(app.service_name)}</div>
        <div style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">${escapeHtml(app.service_code)}</div>
      </td>
      <td>
        <div style="font-weight: 700; font-family: var(--font-mono); color: var(--text-heading);">₹${parseFloat(app.service_fee).toFixed(2)}</div>
        <div style="font-size: 11px; color: #16a34a; font-weight: 700;">+₹${parseFloat(app.commission_earned).toFixed(2)} comm</div>
      </td>
      <td>
        <span class="badge badge-${app.status.toLowerCase().replace(' ', '')}">
          <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:currentColor;"></span>
          ${escapeHtml(app.status)}
        </span>
      </td>
      <td>
        <div style="max-width: 180px; font-size: 12px; color: var(--text-body); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(app.admin_notes || '')}">
          ${escapeHtml(app.admin_notes || '—')}
        </div>
      </td>
      <td>
        <div style="display: flex; gap: 6px;">
          <button class="btn-sm btn-receipt" onclick="viewReceipt('${app.application_no}')" title="Print Acknowledgement">
            <i class="fa-solid fa-receipt"></i> Slip
          </button>
          ${isSuperAdmin ? `
            <button class="btn-sm btn-action-primary" onclick="openAdminStatusModal(${app.id}, '${app.application_no}', '${app.status}')">
              <i class="fa-solid fa-pen-to-square"></i> Action
            </button>
          ` : ''}
        </div>
      </td>
    </tr>
  `;
}

function renderApplicationsTable(apps) {
  if (window.appPaginator) {
    window.appPaginator.setData(apps);
  } else {
    const tbody = document.getElementById('applicationsTableBody');
    const isSuperAdmin = currentUser.role === 'admin';
    if (tbody) {
      tbody.innerHTML = apps.length === 0
        ? `<tr><td colspan="${isSuperAdmin ? 8 : 7}" style="text-align: center; padding: 28px; color: var(--text-muted);">No applications found matching your criteria.</td></tr>`
        : apps.map(app => renderApplicationRowHtml(app, true)).join('');
    }
  }
}

function resetAppFilters() {
  const searchInput = document.getElementById('appSearchInput');
  const statusFilter = document.getElementById('appStatusFilter');
  if (searchInput) searchInput.value = '';
  if (statusFilter) statusFilter.value = 'All';
  document.querySelectorAll('#appStatusTabs .tab-pill').forEach(b => {
    b.classList.toggle('active', b.getAttribute('onclick')?.includes("'All'"));
  });
  filterApplications();
}

// Filter Applications
function filterApplications() {
  const query = (document.getElementById('appSearchInput')?.value || '').toLowerCase().trim();
  const status = document.getElementById('appStatusFilter')?.value || 'All';

  const filtered = currentApplications.filter(app => {
    const matchStatus = status === 'All' || app.status === status;
    const matchQuery = !query ||
      app.application_no.toLowerCase().includes(query) ||
      app.citizen_name.toLowerCase().includes(query) ||
      app.citizen_phone.toLowerCase().includes(query) ||
      app.service_name.toLowerCase().includes(query) ||
      (app.vle_name && app.vle_name.toLowerCase().includes(query));
    return matchStatus && matchQuery;
  });

  renderApplicationsTable(filtered);
}

// Export Applications to CSV
function exportApplicationsCsv() {
  if (currentApplications.length === 0) {
    showToast('Export Notice', 'No applications available to export.', 'warning');
    return;
  }

  const headers = ['Application No', 'Date', 'Citizen Name', 'Mobile', 'Service Name', 'Dept Fee', 'Commission', 'Status', 'Remarks'];
  const rows = currentApplications.map(a => [
    a.application_no,
    new Date(a.created_at).toLocaleString(),
    `"${a.citizen_name}"`,
    a.citizen_phone,
    `"${a.service_name}"`,
    a.service_fee,
    a.commission_earned,
    a.status,
    `"${(a.admin_notes || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `CSC_Applications_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  showToast('Export Complete', 'Applications successfully downloaded as CSV.', 'success');
}

// State for Services Catalog
let activeServiceCategory = 'all';

function getServiceIcon(iconKey, category) {
  const iconMap = {
    'agriculture': '<i class="fa-solid fa-wheat-awn"></i>',
    'health': '<i class="fa-solid fa-notes-medical"></i>',
    'credit-card': '<i class="fa-solid fa-credit-card"></i>',
    'hammer': '<i class="fa-solid fa-hammer"></i>',
    'briefcase': '<i class="fa-solid fa-briefcase"></i>',
    'fingerprint': '<i class="fa-solid fa-fingerprint"></i>',
    'zap': '<i class="fa-solid fa-bolt"></i>',
    'truck': '<i class="fa-solid fa-truck"></i>',
    'dollar-sign': '<i class="fa-solid fa-indian-rupee-sign"></i>',
    'globe': '<i class="fa-solid fa-globe"></i>',
    'feather': '<i class="fa-solid fa-pen-nib"></i>',
    'book-open': '<i class="fa-solid fa-book-open"></i>',
    'file-text': '<i class="fa-solid fa-file-lines"></i>'
  };

  if (iconKey && iconMap[iconKey]) return iconMap[iconKey];

  if (category) {
    const cat = category.toLowerCase();
    if (cat.includes('central') || cat.includes('g2c')) return '<i class="fa-solid fa-landmark"></i>';
    if (cat.includes('finan') || cat.includes('bank')) return '<i class="fa-solid fa-building-columns"></i>';
    if (cat.includes('health') || cat.includes('insur')) return '<i class="fa-solid fa-heart-pulse"></i>';
    if (cat.includes('bill') || cat.includes('bbps')) return '<i class="fa-solid fa-bolt"></i>';
    if (cat.includes('travel') || cat.includes('transport')) return '<i class="fa-solid fa-bus"></i>';
    if (cat.includes('edu') || cat.includes('skill')) return '<i class="fa-solid fa-graduation-cap"></i>';
    if (cat.includes('agri')) return '<i class="fa-solid fa-seedling"></i>';
  }
  return '<i class="fa-solid fa-building-columns"></i>';
}

function getCategoryColorClass(category) {
  if (!category) return 'cat-default';
  const cat = category.toLowerCase();
  if (cat.includes('central') || cat.includes('g2c')) return 'cat-g2c';
  if (cat.includes('finan') || cat.includes('bank')) return 'cat-finance';
  if (cat.includes('health') || cat.includes('insur')) return 'cat-health';
  if (cat.includes('bill') || cat.includes('bbps')) return 'cat-bbps';
  if (cat.includes('travel') || cat.includes('transport')) return 'cat-travel';
  if (cat.includes('edu') || cat.includes('skill')) return 'cat-edu';
  if (cat.includes('agri')) return 'cat-agri';
  return 'cat-default';
}

// Load Services Catalog
async function loadServicesCatalog() {
  const container = document.getElementById('panelServicesCatalog');
  const serviceSelect = document.getElementById('applyServiceSelect');
  if (!container && !serviceSelect) return;

  try {
    const data = await API.services.getAll();
    currentServices = data.services || [];

    // Populate Apply modal dropdown
    if (serviceSelect) {
      serviceSelect.innerHTML = '<option value="">-- Choose Service --</option>' +
        currentServices.map(s => `
          <option value="${s.id}" data-fee="${s.fee}" data-comm="${s.vle_commission}">
            ${escapeHtml(s.name)} (Govt Fee: ₹${parseFloat(s.fee).toFixed(2)} | Comm: ₹${parseFloat(s.vle_commission).toFixed(2)})
          </option>
        `).join('');
    }

    // Update KPI Stats Bar
    const totalCountEl = document.getElementById('catalogTotalCount');
    if (totalCountEl) totalCountEl.innerText = currentServices.length;

    const maxCommEl = document.getElementById('catalogMaxComm');
    if (maxCommEl && currentServices.length > 0) {
      const maxComm = Math.max(...currentServices.map(s => parseFloat(s.vle_commission || 0)));
      maxCommEl.innerText = `₹${maxComm.toFixed(2)}`;
    }

    // Update Category Pill Counts
    updateCategoryPillCounts();

    // Render cards using active filters
    filterServicesCatalog();
  } catch (err) {
    console.error('Error fetching services catalog:', err);
    if (container) {
      container.innerHTML = `
        <div class="services-empty-state">
          <div class="empty-icon">⚠️</div>
          <h4 class="empty-title">Unable to Load Services</h4>
          <p class="empty-desc">Could not connect to the CSC service registry. Please check your connection and retry.</p>
          <button class="btn btn-secondary" onclick="loadServicesCatalog()">Retry Again</button>
        </div>
      `;
    }
  }
}

function updateCategoryPillCounts() {
  const counts = { all: currentServices.length };
  currentServices.forEach(s => {
    const cat = s.category || 'Other';
    counts[cat] = (counts[cat] || 0) + 1;
  });

  const setCnt = (id, count) => {
    const el = document.getElementById(id);
    if (el) el.innerText = count || 0;
  };

  setCnt('pillCountAll', counts.all);
  setCnt('pillCountG2C', counts['G2C Central']);
  setCnt('pillCountFinance', counts['Financial & Banking']);
  setCnt('pillCountHealth', counts['Health & Insurance']);
  setCnt('pillCountBBPS', counts['Bill Payments & BBPS']);
  setCnt('pillCountTravel', counts['Travel & Transport']);
  setCnt('pillCountEdu', counts['Education & Skills']);
}

function setServiceCategoryFilter(category) {
  activeServiceCategory = category;
  document.querySelectorAll('#servicesCategoryPills .category-pill').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-category') === category);
  });
  filterServicesCatalog();
}

function clearServicesSearch() {
  const input = document.getElementById('servicesSearchInput');
  const clearBtn = document.getElementById('servicesSearchClearBtn');
  if (input) input.value = '';
  if (clearBtn) clearBtn.style.display = 'none';
  filterServicesCatalog();
}

function filterServicesCatalog() {
  const container = document.getElementById('panelServicesCatalog');
  if (!container) return;

  const searchInput = document.getElementById('servicesSearchInput');
  const clearBtn = document.getElementById('servicesSearchClearBtn');
  const query = (searchInput?.value || '').trim().toLowerCase();

  if (clearBtn) {
    clearBtn.style.display = query ? 'block' : 'none';
  }

  const sortVal = document.getElementById('servicesSortSelect')?.value || 'featured';

  // 1. Filter by category
  let filtered = currentServices.filter(s => {
    if (activeServiceCategory === 'all') return true;
    return s.category === activeServiceCategory;
  });

  // 2. Filter by search query
  if (query) {
    filtered = filtered.filter(s => {
      const name = (s.name || '').toLowerCase();
      const code = (s.service_code || '').toLowerCase();
      const dept = (s.department || '').toLowerCase();
      const cat = (s.category || '').toLowerCase();
      const desc = (s.description || '').toLowerCase();
      return name.includes(query) || code.includes(query) || dept.includes(query) || cat.includes(query) || desc.includes(query);
    });
  }

  // 3. Sort
  filtered.sort((a, b) => {
    if (sortVal === 'name-asc') {
      return (a.name || '').localeCompare(b.name || '');
    } else if (sortVal === 'comm-desc') {
      return parseFloat(b.vle_commission || 0) - parseFloat(a.vle_commission || 0);
    } else if (sortVal === 'fee-asc') {
      return parseFloat(a.fee || 0) - parseFloat(b.fee || 0);
    }
    return 0; // default order
  });

  renderServicesCatalog(filtered);
}

function getPanelServicePartnerBadge(service) {
  if (!service) return '';
  const code = service.service_code || '';
  if (code === 'CSC-FIN-001') {
    return `<div class="service-partner-hint" style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:6px; padding:6px 8px; font-size:11px; color:#0369a1; margin:8px 0; display:flex; align-items:flex-start; gap:6px;">
      <i class="fa-solid fa-building-columns" style="margin-top:2px;"></i>
      <span><strong>Partner Banks:</strong> State Bank of India, BoB, PNB, HDFC, ICICI, Canara, Union</span>
    </div>`;
  }
  if (code === 'CSC-FIN-002') {
    return `<div class="service-partner-hint" style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:6px 8px; font-size:11px; color:#15803d; margin:8px 0; display:flex; align-items:flex-start; gap:6px;">
      <i class="fa-solid fa-shield-halved" style="margin-top:2px;"></i>
      <span><strong>Supported Banks:</strong> SBI Kiosk, PNB, Bank of Baroda, HDFC, ICICI, Axis, Airtel Bank</span>
    </div>`;
  }
  if (code === 'CSC-UTL-001') {
    return `<div class="service-partner-hint" style="background:#fff7ed; border:1px solid #fed7aa; border-radius:6px; padding:6px 8px; font-size:11px; color:#c2410c; margin:8px 0; display:flex; align-items:flex-start; gap:6px;">
      <i class="fa-solid fa-signal" style="margin-top:2px;"></i>
      <span><strong>Telecom Networks:</strong> Reliance Jio, Bharti Airtel, Vodafone Idea (Vi), BSNL</span>
    </div>`;
  }
  if (code === 'CSC-UTL-002') {
    return `<div class="service-partner-hint" style="background:#faf5ff; border:1px solid #e9d5ff; border-radius:6px; padding:6px 8px; font-size:11px; color:#7e22ce; margin:8px 0; display:flex; align-items:flex-start; gap:6px;">
      <i class="fa-solid fa-tv" style="margin-top:2px;"></i>
      <span><strong>Satellite DTH:</strong> Tata Play, Airtel Digital TV, Dish TV, Sun Direct, D2H</span>
    </div>`;
  }
  if (code === 'CSC-BBPS-001') {
    return `<div class="service-partner-hint" style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:6px; padding:6px 8px; font-size:11px; color:#0369a1; margin:8px 0; display:flex; align-items:flex-start; gap:6px;">
      <i class="fa-solid fa-bolt" style="margin-top:2px;"></i>
      <span><strong>BBPS Network:</strong> All State Electricity Discoms, Piped Gas, Water Boards</span>
    </div>`;
  }
  if (code === 'CSC-UID-001') {
    return `<div class="service-partner-hint" style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:6px; padding:6px 8px; font-size:11px; color:#047857; margin:8px 0; display:flex; align-items:flex-start; gap:6px;">
      <i class="fa-solid fa-fingerprint" style="margin-top:2px;"></i>
      <span><strong>UIDAI:</strong> Demographic e-KYC, Address Correction & PVC Card</span>
    </div>`;
  }
  return '';
}

function renderServicesCatalog(services) {
  const container = document.getElementById('panelServicesCatalog');
  if (!container) return;

  if (services.length === 0) {
    container.innerHTML = `
      <div class="services-empty-state">
        <div class="empty-icon"><i class="fa-solid fa-magnifying-glass"></i></div>
        <h4 class="empty-title">No Matching Services Found</h4>
        <p class="empty-desc">We couldn't find any scheme matching your search criteria. Try a different keyword or category.</p>
        <button class="btn btn-secondary" onclick="clearServicesSearch(); setServiceCategoryFilter('all');">
          Reset All Filters
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = services.map(s => {
    const iconEmoji = getServiceIcon(s.icon, s.category);
    const colorClass = getCategoryColorClass(s.category);
    const feeNum = parseFloat(s.fee || 0);
    const commNum = parseFloat(s.vle_commission || 0);

    return `
      <div class="service-card" data-category="${escapeHtml(s.category)}">
        <div class="service-card-top">
          <div class="service-icon-box ${colorClass}">
            ${iconEmoji}
          </div>
          <div class="service-badges-group">
            <span class="category-badge ${colorClass}">${escapeHtml(s.category)}</span>
            <span class="status-pill-live">● Active Scheme</span>
          </div>
        </div>

        <div class="service-card-content">
          <div class="service-code-row">
            <span class="service-code-chip">${escapeHtml(s.service_code || 'CSC-SRV')}</span>
            <span class="sla-chip">⚡ Instant SLA</span>
          </div>

          <h3 class="service-title" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</h3>
          
          <div class="service-dept" title="${escapeHtml(s.department || 'CSC Government Division')}">
            <span><i class="fa-solid fa-landmark"></i></span>
            <span>${escapeHtml(s.department || 'Ministry / Department of India')}</span>
          </div>

          <p class="service-desc">${escapeHtml(s.description || 'Authorized Government to Citizen (G2C) scheme enrollment and verification.')}</p>
          ${getPanelServicePartnerBadge(s)}

          ${s.required_docs ? `
            <div class="service-docs-hint" title="Required: ${escapeHtml(s.required_docs)}">
              <span><i class="fa-solid fa-file-lines"></i></span>
              <span class="docs-text">Req: ${escapeHtml(s.required_docs)}</span>
            </div>
          ` : ''}
        </div>

        <div class="service-card-footer">
          <div class="service-pricing-box">
            <div class="price-col">
              <span class="price-lbl">Govt Fee</span>
              <span class="price-val ${feeNum === 0 ? 'free' : ''}">
                ${feeNum === 0 ? 'FREE' : '₹' + feeNum.toFixed(2)}
              </span>
            </div>
            <div class="price-divider"></div>
            <div class="price-col">
              <span class="price-lbl">VLE Commission</span>
              <span class="comm-val">+₹${commNum.toFixed(2)}</span>
            </div>
          </div>

          <button class="btn-service-apply" onclick="openApplyModal(${s.id})">
            <span>Apply for Citizen</span>
            <span class="btn-arrow">→</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Expose functions globally for inline onclick/oninput handlers
window.setServiceCategoryFilter = setServiceCategoryFilter;
window.clearServicesSearch = clearServicesSearch;
window.filterServicesCatalog = filterServicesCatalog;

// Load Wallet Ledger Transactions (Role-filtered)
function renderWalletTxnRowHtml(t) {
  const isSuperAdmin = currentUser.role === 'admin';
  const isCredit = t.type === 'credit';
  return `
    <tr>
      <td>
        <div style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer;" onclick="copyToClipboard('${escapeHtml(t.txn_id)}', 'Txn ID')" title="Click to copy Transaction ID">
          <span style="font-family: var(--font-mono); font-size: 12px; font-weight: 700; color: #475569;">${escapeHtml(t.txn_id)}</span>
          <i class="fa-regular fa-copy" style="font-size: 10px; opacity: 0.6;"></i>
        </div>
        <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">${new Date(t.created_at).toLocaleString()}</div>
      </td>
      ${isSuperAdmin ? `
        <td>
          <div style="font-weight: 600; color: var(--text-heading);">${escapeHtml(t.user_name || 'Operator')}</div>
          <div style="font-size: 11px; color: #64748b; font-family: var(--font-mono);">${escapeHtml(t.csc_id || '')}</div>
        </td>
      ` : ''}
      <td>
        <span class="badge ${isCredit ? 'badge-approved' : 'badge-rejected'}">
          <i class="fa-solid ${isCredit ? 'fa-arrow-down' : 'fa-arrow-up'}" style="font-size:9px;"></i>
          ${isCredit ? 'CREDIT' : 'DEBIT'}
        </span>
      </td>
      <td>
        <span style="font-weight: 700; font-family: var(--font-mono); font-size: 13.5px; color: ${isCredit ? '#15803d' : '#b91c1c'};">
          ${isCredit ? '+' : '-'}₹${parseFloat(t.amount).toFixed(2)}
        </span>
      </td>
      <td>
        <span style="font-family: var(--font-mono); font-weight: 600;">₹${parseFloat(t.balance_after).toFixed(2)}</span>
      </td>
      <td>
        <div style="font-size: 12.5px; font-weight: 600; color: var(--text-heading);">${escapeHtml(t.description)}</div>
        <div style="font-size: 11px; color: #64748b;">Ref: <code style="font-family:var(--font-mono); font-size:11px;">${escapeHtml(t.reference_id || 'N/A')}</code></div>
      </td>
    </tr>
  `;
}

async function loadWalletTransactions() {
  const tbody = document.getElementById('walletTableBody');
  const recentTbody = document.getElementById('recentWalletTbody');
  if (!tbody && !recentTbody) return;

  try {
    const data = await API.wallet.getTransactions();
    currentTransactions = data.transactions || [];

    if (window.walletPaginator) {
      window.walletPaginator.setData(currentTransactions);
    }

    if (recentTbody) {
      recentTbody.innerHTML = currentTransactions.slice(0, 5).map(t => {
        const isCredit = t.type === 'credit';
        return `
          <tr>
            <td>
              <div style="font-weight: 600; font-size: 12px;">${escapeHtml(t.description)}</div>
              <div style="font-size: 11px; color: #94a3b8;">${new Date(t.created_at).toLocaleDateString()}</div>
            </td>
            <td>
              <span style="font-weight: 700; color: ${isCredit ? '#15803d' : '#b91c1c'};">
                ${isCredit ? '+' : '-'}₹${parseFloat(t.amount).toFixed(2)}
              </span>
            </td>
            <td>₹${parseFloat(t.balance_after).toFixed(2)}</td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Error fetching wallet ledger:', err);
  }
}

function filterWalletTransactions() {
  const query = (document.getElementById('walletSearchInput')?.value || '').toLowerCase().trim();
  const type = document.getElementById('walletTypeFilter')?.value || 'all';
  const category = document.getElementById('walletCategoryFilter')?.value || 'all';

  const filtered = currentTransactions.filter(t => {
    const matchType = type === 'all' || t.type === type;
    const matchCategory = category === 'all' || t.category === category;
    const matchQuery = !query ||
      (t.txn_id && t.txn_id.toLowerCase().includes(query)) ||
      (t.description && t.description.toLowerCase().includes(query)) ||
      (t.reference_id && t.reference_id.toLowerCase().includes(query)) ||
      (t.user_name && t.user_name.toLowerCase().includes(query)) ||
      (t.csc_id && t.csc_id.toLowerCase().includes(query));
    return matchType && matchCategory && matchQuery;
  });

  if (window.walletPaginator) {
    window.walletPaginator.setData(filtered);
  }
}

function resetWalletFilters() {
  const s = document.getElementById('walletSearchInput');
  const t = document.getElementById('walletTypeFilter');
  const c = document.getElementById('walletCategoryFilter');
  if (s) s.value = '';
  if (t) t.value = 'all';
  if (c) c.value = 'all';
  filterWalletTransactions();
}

// Export Wallet Ledger CSV
function exportWalletCsv() {
  if (currentTransactions.length === 0) {
    showToast('Export Notice', 'No transactions found to export.', 'warning');
    return;
  }

  const headers = ['Txn ID', 'Date', 'Type', 'Amount', 'Balance After', 'Description', 'Reference'];
  const rows = currentTransactions.map(t => [
    t.txn_id,
    new Date(t.created_at).toLocaleString(),
    t.type.toUpperCase(),
    t.amount,
    t.balance_after,
    `"${t.description.replace(/"/g, '""')}"`,
    t.reference_id || ''
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `CSC_Wallet_Ledger_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  showToast('Export Complete', 'Wallet ledger downloaded as CSV.', 'success');
}

// Update VLE Telemetry Cards & Tab Counts
function updateVleTelemetry(vles) {
  const total = vles.length;
  const active = vles.filter(v => v.status === 'active').length;
  const suspended = vles.filter(v => v.status === 'suspended').length;
  const admins = vles.filter(v => v.role === 'admin').length;
  const totalWallet = vles.reduce((sum, v) => sum + parseFloat(v.wallet_balance || 0), 0);

  const setIfExists = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
  };

  setIfExists('vleStatTotal', total);
  setIfExists('vleStatActive', active);
  setIfExists('vleStatWallet', `₹${totalWallet.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
  setIfExists('vleStatSuspended', suspended);

  setIfExists('vleTabCountAll', total);
  setIfExists('vleTabCountActive', active);
  setIfExists('vleTabCountSuspended', suspended);
  setIfExists('vleTabCountAdmin', admins);
}

// Quick Tab Switcher for VLE Directory Table
function setVleStatusTab(status, btn) {
  document.querySelectorAll('#vleStatusTabs .tab-pill').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const select = document.getElementById('vleStatusFilter');
  if (select) {
    select.value = status;
    filterVleTable();
  }
}

// Load VLE Network Directory (Admin Only)
async function loadVLEList() {
  const tbody = document.getElementById('vleTableBody');
  if (!tbody) return;

  try {
    const data = await API.users.getAll();
    currentVLEs = data.users || [];
    updateVleTelemetry(currentVLEs);
    renderVleTable(currentVLEs);
  } catch (err) {
    console.error('Error fetching VLEs:', err);
  }
}

function renderVleRowHtml(u) {
  return `
    <tr>
      <td>
        <div style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer;" onclick="copyToClipboard('${escapeHtml(u.csc_id)}', 'CSC ID')" title="Click to copy CSC ID">
          <span style="font-family: var(--font-mono); font-weight: 700; color: var(--csc-blue-600);">${escapeHtml(u.csc_id)}</span>
          <i class="fa-regular fa-copy" style="font-size: 11px; opacity: 0.6;"></i>
        </div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
          Joined ${new Date(u.created_at).toLocaleDateString()}
        </div>
      </td>
      <td>
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 34px; height: 34px; border-radius: 50%; background: ${u.role === 'admin' ? '#dc2626' : '#0284c7'}; color: #ffffff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 12px; flex-shrink: 0; box-shadow: 0 2px 4px rgba(0,0,0,0.12);">
            ${escapeHtml((u.name || 'U').charAt(0).toUpperCase())}
          </div>
          <div>
            <div style="font-weight: 700; color: var(--text-heading); display: flex; align-items: center; gap: 6px;">
              ${escapeHtml(u.name)}
              <span class="badge ${u.role === 'admin' ? 'badge-rejected' : 'badge-approved'}" style="font-size: 9.5px; padding: 1px 6px;">
                ${u.role.toUpperCase()}
              </span>
            </div>
            <div style="font-size: 11.5px; color: var(--text-muted);">
              ${escapeHtml(u.email)} ${u.phone ? `• <i class="fa-solid fa-phone" style="font-size:10px;"></i> ${escapeHtml(u.phone)}` : ''}
            </div>
          </div>
        </div>
      </td>
      <td>
        <div style="font-weight: 600; color: var(--text-heading);">${escapeHtml(u.center_name || 'CSC Centre')}</div>
        <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(u.district || '')}, ${escapeHtml(u.state || '')}</div>
      </td>
      <td>
        <div style="font-weight: 700; font-family: var(--font-mono); color: var(--text-heading); font-size: 14px;">
          ₹${parseFloat(u.wallet_balance).toFixed(2)}
        </div>
      </td>
      <td>
        <span style="font-weight: 700; color: var(--csc-blue-600); font-size: 13.5px;">${u.total_applications || 0}</span>
      </td>
      <td>
        <span class="badge badge-${u.status}">
          <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:currentColor;"></span>
          ${escapeHtml(u.status.toUpperCase())}
        </span>
      </td>
      <td>
        <div style="display: flex; gap: 6px; flex-wrap: nowrap;">
          <button class="btn-sm btn-outline" onclick="openVleDetailModal(${u.id})" title="Inspect complete VLE details">
            <i class="fa-solid fa-eye"></i> View
          </button>
          <button class="btn-sm btn-receipt" onclick="openWalletAdjustModal(${u.id}, '${escapeHtml(u.name)}', ${u.wallet_balance})" title="Adjust Balance">
            <i class="fa-solid fa-wallet"></i> Wallet
          </button>
          <button class="btn-sm btn-action-primary" onclick="toggleVleStatus(${u.id}, '${u.status}')" title="Suspend or activate VLE login">
            <i class="fa-solid ${u.status === 'active' ? 'fa-ban' : 'fa-check'}"></i> ${u.status === 'active' ? 'Suspend' : 'Activate'}
          </button>
          ${u.id !== currentUser.id ? `
            <button class="btn-sm btn-outline" style="color:#dc2626; border-color:#fca5a5;" onclick="deleteUserConfirm(${u.id}, '${escapeHtml(u.name)}', '${escapeHtml(u.csc_id)}')" title="Delete User">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          ` : ''}
        </div>
      </td>
    </tr>
  `;
}

function renderVleTable(users) {
  if (window.vlePaginator) {
    window.vlePaginator.setData(users);
  } else {
    const tbody = document.getElementById('vleTableBody');
    if (!tbody) return;
    tbody.innerHTML = users.length === 0
      ? '<tr><td colspan="7" style="text-align: center; padding: 28px; color: var(--text-muted);">No VLEs match your search/filter criteria.</td></tr>'
      : users.map(u => renderVleRowHtml(u)).join('');
  }
}

function resetVleFilters() {
  const searchInput = document.getElementById('vleSearchInput');
  const statusFilter = document.getElementById('vleStatusFilter');
  const stateFilter = document.getElementById('vleStateFilter');
  if (searchInput) searchInput.value = '';
  if (statusFilter) statusFilter.value = 'all';
  if (stateFilter) stateFilter.value = 'all';
  document.querySelectorAll('#vleStatusTabs .tab-pill').forEach(b => {
    b.classList.toggle('active', b.getAttribute('onclick')?.includes("'all'"));
  });
  filterVleTable();
}

// Filter VLE Directory
function filterVleTable() {
  const query = (document.getElementById('vleSearchInput')?.value || '').toLowerCase().trim();
  const status = document.getElementById('vleStatusFilter')?.value || 'all';
  const state = document.getElementById('vleStateFilter')?.value || 'all';

  const filtered = currentVLEs.filter(u => {
    const matchStatus = status === 'all' || u.status === status;
    const matchState = state === 'all' || u.state === state;
    const matchQuery = !query ||
      u.csc_id.toLowerCase().includes(query) ||
      u.name.toLowerCase().includes(query) ||
      u.email.toLowerCase().includes(query) ||
      (u.phone && u.phone.toLowerCase().includes(query)) ||
      (u.center_name && u.center_name.toLowerCase().includes(query));
    return matchStatus && matchState && matchQuery;
  });

  renderVleTable(filtered);
}

// Export VLE Directory CSV
function exportVleDirectoryCsv() {
  if (currentVLEs.length === 0) {
    showToast('Export Notice', 'No VLE records found.', 'warning');
    return;
  }

  const headers = ['CSC ID', 'Full Name', 'Role', 'Email', 'Phone', 'Kendra Name', 'State', 'District', 'Wallet Balance', 'Total Apps', 'Status'];
  const rows = currentVLEs.map(u => [
    u.csc_id,
    `"${u.name}"`,
    u.role,
    u.email,
    u.phone || '',
    `"${(u.center_name || '').replace(/"/g, '""')}"`,
    u.state,
    u.district,
    u.wallet_balance,
    u.total_applications,
    u.status
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `CSC_VLE_Directory_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  showToast('Export Complete', 'VLE Directory exported to CSV.', 'success');
}

// Toggle VLE Status (Admin)
async function toggleVleStatus(vleId, currentStatus) {
  const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
  const confirmed = await showConfirmationModal({
    title: 'Change VLE Status',
    message: `Are you sure you want to change this VLE operator status to "${newStatus.toUpperCase()}"?`,
    confirmText: newStatus === 'suspended' ? 'Suspend Operator' : 'Activate Operator',
    isDestructive: newStatus === 'suspended',
    icon: newStatus === 'suspended' ? 'fa-ban' : 'fa-circle-check'
  });
  if (!confirmed) return;

  try {
    await API.users.updateStatus(vleId, newStatus);
    showToast('Status Updated', `User status changed to ${newStatus}.`, 'success');
    loadVLEList();
  } catch (err) {
    showToast('Error', err.message, 'error');
  }
}

// Delete User Confirm (Admin)
async function deleteUserConfirm(userId, userName, cscId) {
  const confirmed = await showConfirmationModal({
    title: 'Delete Operator Account',
    message: `WARNING: Are you sure you want to permanently delete user account '${userName}' (${cscId})? All their citizen applications and records will be affected.`,
    confirmText: 'Permanently Delete',
    isDestructive: true,
    icon: 'fa-trash-can'
  });
  if (!confirmed) return;

  try {
    const res = await API.users.delete(userId);
    showToast('Deleted', res.message, 'success');
    loadVLEList();
    loadDashboardStats();
  } catch (err) {
    showToast('Delete Failed', err.message, 'error');
  }
}

// Open Create User Modal (Super Admin Feature)
function openCreateUserModal() {
  document.getElementById('createUserForm').reset();
  generateNewRandomCscId();
  generateRandomPassword();
  document.getElementById('createUserModal').classList.add('active');
}

// Helper to generate unique CSC ID preview
function generateNewRandomCscId() {
  const num = Math.floor(1000000 + Math.random() * 9000000);
  const input = document.getElementById('newUserCscId');
  if (input) input.value = `CSC${num}`;
}

// Helper to generate secure random password
function generateRandomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#$';
  let pass = '';
  for (let i = 0; i < 10; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const input = document.getElementById('newUserPassword');
  if (input) input.value = pass;
}

// Handle User Creation Submit
async function handleCreateUserSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('newUserName').value.trim();
  const email = document.getElementById('newUserEmail').value.trim();
  const csc_id = document.getElementById('newUserCscId').value.trim();
  const role = document.getElementById('newUserRole').value;
  const phone = document.getElementById('newUserPhone').value.trim();
  const center_name = document.getElementById('newUserCenter').value.trim();
  const state = document.getElementById('newUserState').value;
  const district = document.getElementById('newUserDistrict').value.trim();
  const initial_wallet_balance = parseFloat(document.getElementById('newUserWallet').value) || 0;
  const password = document.getElementById('newUserPassword').value;

  const btn = document.getElementById('createUserSubmitBtn');
  btn.disabled = true;
  btn.innerText = 'Creating User in MySQL...';

  try {
    const res = await API.users.create({
      csc_id, name, email, phone, role, center_name, state, district,
      initial_wallet_balance, password
    });

    showToast('User Created', `Successfully onboarded ${res.user.name} with ID ${res.user.csc_id}`, 'success');
    document.getElementById('createUserModal').classList.remove('active');
    document.getElementById('createUserForm').reset();

    await Promise.all([
      loadVLEList(),
      loadDashboardStats()
    ]);
  } catch (err) {
    showToast('Creation Error', err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerText = 'Create User Account with Unique ID';
  }
}

// Open VLE Details Modal (Super Admin Feature)
function openVleDetailModal(vleId) {
  const vle = currentVLEs.find(u => u.id === vleId);
  if (!vle) return;

  const modal = document.getElementById('vleDetailModal');
  if (!modal) return;

  document.getElementById('modalVleName').innerText = vle.name;
  document.getElementById('modalVleAvatar').innerText = vle.name.charAt(0).toUpperCase();
  document.getElementById('modalVleRoleBadge').innerText = vle.role.toUpperCase();
  document.getElementById('modalVleRoleBadge').className = `badge ${vle.role === 'admin' ? 'badge-rejected' : 'badge-approved'}`;

  document.getElementById('modalVleCscId').innerText = vle.csc_id;
  document.getElementById('modalVleStatus').innerHTML = `
    <span class="badge badge-${vle.status}">
      <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:currentColor;"></span>
      ${vle.status.toUpperCase()}
    </span>
  `;
  document.getElementById('modalVleEmail').innerText = vle.email;
  document.getElementById('modalVlePhone').innerText = vle.phone || 'Not Registered';
  document.getElementById('modalVleCenter').innerText = vle.center_name || 'CSC Digital Seva Kendra';
  document.getElementById('modalVleLocation').innerText = `${vle.district || 'N/A'}, ${vle.state || 'N/A'}`;
  document.getElementById('modalVleWallet').innerText = `₹${parseFloat(vle.wallet_balance).toFixed(2)}`;
  document.getElementById('modalVleApps').innerText = `${vle.total_applications} Orders`;
  document.getElementById('modalVleDate').innerText = `${new Date(vle.created_at).toLocaleDateString()} (${new Date(vle.created_at).toLocaleTimeString()})`;

  // Action button bindings
  const adjustBtn = document.getElementById('modalVleAdjustWalletBtn');
  if (adjustBtn) {
    adjustBtn.onclick = () => {
      modal.classList.remove('active');
      openWalletAdjustModal(vle.id, vle.name, vle.wallet_balance);
    };
  }

  const toggleBtn = document.getElementById('modalVleToggleStatusBtn');
  if (toggleBtn) {
    toggleBtn.innerText = vle.status === 'active' ? '⚡ Suspend Login' : '⚡ Activate Login';
    toggleBtn.onclick = async () => {
      await toggleVleStatus(vle.id, vle.status);
      modal.classList.remove('active');
    };
  }

  modal.classList.add('active');
}

// Open Wallet Adjustment Modal (Admin)
function openDirectAdjustModal(vleId, vleName, currentBal) {
  openWalletAdjustModal(vleId, vleName, currentBal);
}

async function openWalletAdjustModal(vleId, vleName, currentBal) {
  const modal = document.getElementById('adjustWalletModal');
  const selectGroup = document.getElementById('adjustVleSelectGroup');
  const headerInfo = document.getElementById('adjustVleHeaderInfo');
  const vleSelect = document.getElementById('adjustVleSelect');
  const typeSelect = document.getElementById('adjustType');
  const amountInput = document.getElementById('adjustAmount');
  const reasonInput = document.getElementById('adjustReason');

  if (!modal) return;

  // Make sure currentVLEs are loaded if empty
  if (currentVLEs.length === 0) {
    try {
      const data = await API.users.getAll();
      currentVLEs = data.users || [];
    } catch (e) {
      console.warn('Failed to pre-fetch VLEs:', e);
    }
  }

  if (vleId) {
    // Specific VLE targeted from directory row
    document.getElementById('adjustVleId').value = vleId;
    document.getElementById('adjustVleName').innerText = vleName || 'Operator';
    document.getElementById('adjustVleCurrentBalBadge').innerText = `₹${parseFloat(currentBal || 0).toFixed(2)}`;
    if (selectGroup) selectGroup.style.display = 'none';
    if (headerInfo) headerInfo.style.display = 'flex';
  } else {
    // General trigger (header / view toolbar) - populate dropdown
    document.getElementById('adjustVleId').value = '';
    if (selectGroup) {
      selectGroup.style.display = 'block';
      vleSelect.innerHTML = '<option value="">-- Choose VLE Operator --</option>' +
        currentVLEs.filter(u => u.role !== 'admin').map(u => 
          `<option value="${u.id}" data-name="${escapeHtml(u.name)}" data-bal="${u.wallet_balance}">
            ${escapeHtml(u.name)} (${escapeHtml(u.csc_id)}) - Current Bal: ₹${parseFloat(u.wallet_balance).toFixed(2)}
          </option>`
        ).join('');
    }
    if (headerInfo) headerInfo.style.display = 'none';
  }

  typeSelect.value = 'credit';
  amountInput.value = '';
  reasonInput.value = '';
  updateAdjustPreview();
  modal.classList.add('active');
}

function handleAdjustVleSelectChange(val) {
  const vleSelect = document.getElementById('adjustVleSelect');
  const selectedOpt = vleSelect.options[vleSelect.selectedIndex];
  if (val && selectedOpt) {
    document.getElementById('adjustVleId').value = val;
    document.getElementById('adjustVleName').innerText = selectedOpt.getAttribute('data-name');
    document.getElementById('adjustVleCurrentBalBadge').innerText = `₹${parseFloat(selectedOpt.getAttribute('data-bal') || 0).toFixed(2)}`;
    document.getElementById('adjustVleHeaderInfo').style.display = 'flex';
  } else {
    document.getElementById('adjustVleId').value = '';
    document.getElementById('adjustVleHeaderInfo').style.display = 'none';
  }
  updateAdjustPreview();
}

function setAdjustQuickAmount(amt) {
  const amountInput = document.getElementById('adjustAmount');
  const type = document.getElementById('adjustType').value;
  if (type === 'set') {
    amountInput.value = amt;
  } else {
    const curVal = parseFloat(amountInput.value) || 0;
    amountInput.value = curVal + amt;
  }
  updateAdjustPreview();
}

function updateAdjustPreview() {
  const vleId = document.getElementById('adjustVleId').value;
  let curBal = 0;
  if (vleId) {
    const target = currentVLEs.find(u => String(u.id) === String(vleId));
    if (target) curBal = parseFloat(target.wallet_balance);
  }

  const type = document.getElementById('adjustType').value;
  const amt = parseFloat(document.getElementById('adjustAmount').value) || 0;
  let newBal = curBal;

  if (type === 'credit') {
    newBal = curBal + amt;
    document.getElementById('adjustAmountLabel').innerText = 'Credit Amount (₹) *';
  } else if (type === 'debit') {
    newBal = Math.max(0, curBal - amt);
    document.getElementById('adjustAmountLabel').innerText = 'Debit Amount (₹) *';
  } else if (type === 'set') {
    newBal = Math.max(0, amt);
    document.getElementById('adjustAmountLabel').innerText = 'Set New Exact Balance (₹) *';
  }

  document.getElementById('previewCurrentBal').innerText = `₹${curBal.toFixed(2)}`;
  document.getElementById('previewNewBal').innerText = `₹${newBal.toFixed(2)}`;
}

// Handle Admin Wallet Adjustment
async function handleWalletAdjustment(e) {
  e.preventDefault();
  const vleId = document.getElementById('adjustVleId').value;
  const type = document.getElementById('adjustType').value;
  const amount = parseFloat(document.getElementById('adjustAmount').value);
  const reason = document.getElementById('adjustReason').value.trim();

  if (!vleId) {
    showToast('Select Operator', 'Please choose a target VLE operator to adjust.', 'warning');
    return;
  }

  if (isNaN(amount) || (type !== 'set' && amount <= 0) || (type === 'set' && amount < 0)) {
    showToast('Invalid Amount', 'Please specify a valid numeric amount (≥ 0).', 'warning');
    return;
  }

  const submitBtn = document.getElementById('adjustSubmitBtn');
  submitBtn.disabled = true;
  submitBtn.innerText = 'Updating Wallet...';

  try {
    const res = await API.users.adjustWallet(vleId, { type, amount, reason });
    showToast('Wallet Adjusted', res.message, 'success');
    document.getElementById('adjustWalletModal').classList.remove('active');
    await Promise.all([
      loadVLEList(),
      loadDashboardStats(),
      loadWalletTransactions()
    ]);
  } catch (err) {
    showToast('Adjustment Failed', err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = 'Confirm Wallet Adjustment';
  }
}

// Admin Services Manager
async function loadAdminServicesManager() {
  const tbody = document.getElementById('adminServicesTableBody');
  if (!tbody) return;

  try {
    const data = await API.services.getAll();
    tbody.innerHTML = data.services.map(s => `
      <tr>
        <td><code>${escapeHtml(s.service_code)}</code></td>
        <td><strong>${escapeHtml(s.name)}</strong><div style="font-size: 11px; color:#64748b;">${escapeHtml(s.department || '')}</div></td>
        <td>${escapeHtml(s.category)}</td>
        <td>₹${parseFloat(s.fee).toFixed(2)}</td>
        <td><strong style="color: #16a34a;">₹${parseFloat(s.vle_commission).toFixed(2)}</strong></td>
        <td><span class="badge ${s.is_active ? 'badge-approved' : 'badge-rejected'}">${s.is_active ? 'ACTIVE' : 'INACTIVE'}</span></td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn-sm ${s.is_active ? 'btn-warning' : 'btn-success'}" onclick="toggleServiceActive(${s.id}, ${s.is_active})">
              ${s.is_active ? 'Deactivate' : 'Activate'}
            </button>
            <button class="btn-sm btn-danger" onclick="deleteServiceConfirm(${s.id}, '${escapeHtml(s.name)}')">
              Delete
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error fetching admin services:', err);
  }
}

// Toggle Service Active (Admin)
async function toggleServiceActive(serviceId, currentStatus) {
  try {
    await API.services.update(serviceId, { is_active: currentStatus ? 0 : 1 });
    showToast('Service Updated', `Service ${currentStatus ? 'deactivated' : 'activated'}.`, 'success');
    loadAdminServicesManager();
    loadServicesCatalog();
  } catch (err) {
    showToast('Update Failed', err.message, 'error');
  }
}

// Delete Service Confirm (Admin)
async function deleteServiceConfirm(serviceId, serviceName) {
  const confirmed = await showConfirmationModal({
    title: 'Deactivate Scheme',
    message: `Are you sure you want to remove or deactivate scheme '${serviceName}' from the live catalog?`,
    confirmText: 'Deactivate Scheme',
    isDestructive: true,
    icon: 'fa-trash-can'
  });
  if (!confirmed) return;
  try {
    const res = await API.services.delete(serviceId);
    showToast('Service Removed', res.message, 'success');
    loadAdminServicesManager();
    loadServicesCatalog();
  } catch (err) {
    showToast('Delete Failed', err.message, 'error');
  }
}

// Open Add Service Modal
function openAddServiceModal() {
  document.getElementById('addServiceForm').reset();
  const num = Math.floor(100 + Math.random() * 900);
  document.getElementById('srvCode').value = `CSC-SRV-${num}`;
  document.getElementById('addServiceModal').classList.add('active');
}

// Handle Add Service Submit
async function handleAddServiceSubmit(e) {
  e.preventDefault();
  const service_code = document.getElementById('srvCode').value.trim();
  const category = document.getElementById('srvCategory').value;
  const name = document.getElementById('srvName').value.trim();
  const department = document.getElementById('srvDept').value.trim();
  const fee = parseFloat(document.getElementById('srvFee').value) || 0;
  const vle_commission = parseFloat(document.getElementById('srvComm').value) || 0;
  const required_docs = document.getElementById('srvDocs').value.trim();
  const description = document.getElementById('srvDesc').value.trim();

  const btn = document.getElementById('addServiceSubmitBtn');
  btn.disabled = true;

  try {
    const res = await API.services.create({
      service_code, category, name, department, fee, vle_commission, required_docs, description
    });
    showToast('Service Published', res.message, 'success');
    document.getElementById('addServiceModal').classList.remove('active');
    loadAdminServicesManager();
    loadServicesCatalog();
  } catch (err) {
    showToast('Publish Failed', err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// Load Support Tickets
async function loadTickets() {
  const tbody = document.getElementById('ticketsTableBody');
  if (!tbody) return;

  try {
    const data = await API.tickets.getAll();
    currentTickets = data.tickets || [];
    const isSuperAdmin = currentUser.role === 'admin';

    tbody.innerHTML = currentTickets.length === 0
      ? '<tr><td colspan="6" style="text-align: center; padding: 20px;">No support tickets logged.</td></tr>'
      : currentTickets.map(t => `
        <tr>
          <td><code>${escapeHtml(t.ticket_no)}</code></td>
          ${isSuperAdmin ? `<td>${escapeHtml(t.user_name)} (${escapeHtml(t.csc_id)})</td>` : ''}
          <td><strong>${escapeHtml(t.subject)}</strong><div style="font-size: 11px; color: #64748b;">${escapeHtml(t.category)}</div></td>
          <td><span class="badge badge-${t.status}">${escapeHtml(t.status)}</span></td>
          <td><div style="font-size: 12px; color: #334155;">${escapeHtml(t.admin_response || 'Pending investigation')}</div></td>
          <td>
            ${isSuperAdmin ? `
              <button class="btn-sm btn-action-primary" onclick="openTicketResponseModal(${t.id}, '${escapeHtml(t.ticket_no)}', '${escapeHtml(t.subject)}')">
                <i class="fa-solid fa-reply"></i> Reply
              </button>
            ` : ''}
          </td>
        </tr>
      `).join('');
  } catch (err) {
    console.error('Error loading tickets:', err);
  }
}

// Open Ticket Response Modal (Admin)
function openTicketResponseModal(ticketId, ticketNo, subject) {
  document.getElementById('replyTicketId').value = ticketId;
  document.getElementById('replyTicketNo').innerText = ticketNo;
  document.getElementById('replyTicketSubject').innerText = subject;
  document.getElementById('adminTicketReplyModal').classList.add('active');
}

// Handle Admin Ticket Reply Submit
async function handleTicketReplySubmit(e) {
  e.preventDefault();
  const ticketId = document.getElementById('replyTicketId').value;
  const status = document.getElementById('replyTicketStatus').value;
  const admin_response = document.getElementById('replyTicketMessage').value.trim();

  try {
    await API.tickets.update(ticketId, { status, admin_response });
    showToast('Ticket Updated', 'Official response submitted successfully.', 'success');
    document.getElementById('adminTicketReplyModal').classList.remove('active');
    loadTickets();
  } catch (err) {
    showToast('Reply Failed', err.message, 'error');
  }
}

// Profile View
function loadProfileView() {
  document.getElementById('profName').innerText = currentUser.name;
  document.getElementById('profCscId').innerText = currentUser.csc_id;
  document.getElementById('profEmail').innerText = currentUser.email;
  document.getElementById('profPhone').innerText = currentUser.phone || 'Not Registered';
  document.getElementById('profCenter').innerText = currentUser.center_name || 'CSC Digital Seva Kendra';
  document.getElementById('profState').innerText = currentUser.state || 'Delhi';
  document.getElementById('profDistrict').innerText = currentUser.district || 'Central Delhi';
  document.getElementById('profRole').innerText = currentUser.role === 'admin' ? 'National Super Administrator' : 'Authorized VLE Operator';
}

// Modal Setup & Event Bindings
function setupModals() {
  // Close buttons
  document.querySelectorAll('.close-panel-modal').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    });
  });

  // Service select change in Apply Modal
  const serviceSelect = document.getElementById('applyServiceSelect');
  if (serviceSelect) {
    serviceSelect.addEventListener('change', (e) => {
      const selectedOption = e.target.selectedOptions[0];
      if (selectedOption && selectedOption.value) {
        const fee = parseFloat(selectedOption.getAttribute('data-fee') || 0);
        const comm = parseFloat(selectedOption.getAttribute('data-comm') || 0);
        const net = fee - comm;
        document.getElementById('applyFeeDisplay').innerText = `₹${fee.toFixed(2)}`;
        document.getElementById('applyCommDisplay').innerText = `+₹${comm.toFixed(2)}`;
        document.getElementById('applyNetDebitDisplay').innerText = `₹${Math.max(0, net).toFixed(2)}`;
      } else {
        document.getElementById('applyFeeDisplay').innerText = '₹0.00';
        document.getElementById('applyCommDisplay').innerText = '₹0.00';
        document.getElementById('applyNetDebitDisplay').innerText = '₹0.00';
      }
    });
  }

  // Forms
  document.getElementById('createUserForm')?.addEventListener('submit', handleCreateUserSubmit);
  document.getElementById('addServiceForm')?.addEventListener('submit', handleAddServiceSubmit);
  document.getElementById('adminTicketReplyForm')?.addEventListener('submit', handleTicketReplySubmit);
  document.getElementById('newApplicationForm')?.addEventListener('submit', handleNewApplicationSubmit);
  document.getElementById('walletRechargeRequestForm')?.addEventListener('submit', handleWalletRechargeRequestSubmit);
  document.getElementById('reviewRechargeForm')?.addEventListener('submit', handleReviewRechargeSubmit);
  document.getElementById('adjustWalletForm')?.addEventListener('submit', handleWalletAdjustment);
  document.getElementById('adminStatusForm')?.addEventListener('submit', handleAdminStatusSubmit);
  document.getElementById('newTicketForm')?.addEventListener('submit', handleNewTicketSubmit);
}

// Open Apply Service Modal
function openApplyModal(preselectedServiceId) {
  const modal = document.getElementById('applyServiceModal');
  const serviceSelect = document.getElementById('applyServiceSelect');

  if (preselectedServiceId && serviceSelect) {
    serviceSelect.value = preselectedServiceId;
    serviceSelect.dispatchEvent(new Event('change'));
  }

  modal.classList.add('active');
}

// Handle New Application Submission (Real-Time MySQL Debit & Validation)
async function handleNewApplicationSubmit(e) {
  e.preventDefault();
  const serviceId = document.getElementById('applyServiceSelect').value;
  const citizenName = document.getElementById('citizenNameInput').value.trim();
  const citizenPhone = document.getElementById('citizenPhoneInput').value.trim();
  const citizenIdNumber = document.getElementById('citizenIdDocInput').value.trim();

  if (!serviceId || !citizenName || !citizenPhone) {
    showToast('Incomplete Form', 'Please fill all mandatory fields (Service, Citizen Name, Mobile).', 'warning');
    return;
  }

  const submitBtn = document.getElementById('submitAppBtn');
  submitBtn.disabled = true;
  submitBtn.innerText = 'Processing with CSC Wallet...';

  try {
    const res = await API.applications.create({
      service_id: serviceId,
      citizen_name: citizenName,
      citizen_phone: citizenPhone,
      citizen_id_number: citizenIdNumber
    });

    currentUser.wallet_balance = res.newWalletBalance;
    updateWalletDisplay(res.newWalletBalance);

    showToast('Application Submitted', `Application ${res.applicationNo} created. Fee debited from wallet.`, 'success');
    document.getElementById('applyServiceModal').classList.remove('active');
    document.getElementById('newApplicationForm').reset();

    await Promise.all([
      loadDashboardStats(),
      loadApplications(),
      loadWalletTransactions()
    ]);

    // Show Printable Acknowledgement
    viewReceipt(res.applicationNo);
  } catch (err) {
    showToast('Application Failed', err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = 'Confirm & Pay from Wallet';
  }
}

// Handle Wallet Top-up
async function handleWalletTopupSubmit(e) {
  e.preventDefault();
  const amount = parseFloat(document.getElementById('topupAmountInput').value);
  const paymentMethod = document.getElementById('topupPaymentMethod').value;

  if (isNaN(amount) || amount < 100) {
    showToast('Invalid Amount', 'Please enter an amount of at least ₹100.', 'warning');
    return;
  }

  const btn = document.getElementById('topupSubmitBtn');
  btn.disabled = true;
  btn.innerText = 'Processing payment...';

  try {
    const res = await API.wallet.addMoney(amount, paymentMethod);
    currentUser.wallet_balance = res.newBalance;
    updateWalletDisplay(res.newBalance);

    showToast('Wallet Credited', `₹${amount.toFixed(2)} added to your CSC wallet!`, 'success');
    document.getElementById('topupModal').classList.remove('active');
    document.getElementById('walletTopupForm').reset();

    await Promise.all([
      loadDashboardStats(),
      loadWalletTransactions()
    ]);
  } catch (err) {
    showToast('Recharge Failed', err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerText = 'Proceed to Add Funds';
  }
}

// Open Admin Status Modal
function openAdminStatusModal(appId, appNo, currentStatus) {
  document.getElementById('adminAppId').value = appId;
  document.getElementById('adminAppNoDisplay').innerText = appNo;
  document.getElementById('adminStatusSelect').value = currentStatus;
  document.getElementById('adminStatusModal').classList.add('active');
}

// Handle Admin Status Submit
async function handleAdminStatusSubmit(e) {
  e.preventDefault();
  const appId = document.getElementById('adminAppId').value;
  const status = document.getElementById('adminStatusSelect').value;
  const admin_notes = document.getElementById('adminStatusNotes').value;
  const refund = document.getElementById('adminRefundCheckbox')?.checked;

  try {
    const res = await API.applications.updateStatus(appId, { status, admin_notes, refund });
    showToast('Status Updated', res.message, 'success');
    document.getElementById('adminStatusModal').classList.remove('active');
    await Promise.all([
      loadDashboardStats(),
      loadApplications(),
      loadWalletTransactions()
    ]);
  } catch (err) {
    showToast('Update Failed', err.message, 'error');
  }
}

// View / Print Acknowledgement Receipt
function viewReceipt(appNo) {
  const app = currentApplications.find(a => a.application_no === appNo);
  if (!app) {
    showToast('Receipt Notice', 'Application details not found.', 'warning');
    return;
  }

  const modal = document.getElementById('receiptModal');
  document.getElementById('receiptAppNo').innerText = app.application_no;
  document.getElementById('receiptDate').innerText = new Date(app.created_at).toLocaleString();
  document.getElementById('receiptCitizenName').innerText = app.citizen_name;
  document.getElementById('receiptCitizenPhone').innerText = app.citizen_phone;
  document.getElementById('receiptCitizenDoc').innerText = app.citizen_id_number || 'Aadhaar / Form Verified';
  document.getElementById('receiptService').innerText = app.service_name;
  document.getElementById('receiptDept').innerText = app.service_category || 'CSC e-Governance';
  document.getElementById('receiptFee').innerText = `₹${parseFloat(app.service_fee).toFixed(2)}`;
  document.getElementById('receiptStatus').innerText = app.status;
  document.getElementById('receiptVleCscId').innerText = app.vle_csc_id || currentUser.csc_id;
  document.getElementById('receiptVleCenter').innerText = app.center_name || currentUser.center_name || 'CSC Digital Seva Kendra';

  modal.classList.add('active');
}

// Handle New Ticket Submit
async function handleNewTicketSubmit(e) {
  e.preventDefault();
  const subject = document.getElementById('ticketSubject').value.trim();
  const category = document.getElementById('ticketCategory').value;
  const priority = document.getElementById('ticketPriority').value;
  const message = document.getElementById('ticketMessage').value.trim();

  try {
    const res = await API.tickets.create({ subject, category, priority, message });
    showToast('Ticket Logged', res.message, 'success');
    document.getElementById('newTicketModal').classList.remove('active');
    document.getElementById('newTicketForm').reset();
    loadTickets();
  } catch (err) {
    showToast('Ticket Error', err.message, 'error');
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// Setup Real-Time Portal Notifications Bell
function setupNotifications() {
  const bellBtn = document.getElementById('notificationBellBtn');
  const dropdown = document.getElementById('notificationDropdown');
  if (!bellBtn || !dropdown) return;

  bellBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('active');
  });

  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && e.target !== bellBtn) {
      dropdown.classList.remove('active');
    }
  });

  renderNotificationItems();
}

function renderNotificationItems() {
  const list = document.getElementById('notifDropdownList');
  const countBadge = document.getElementById('notifBadge');
  if (!list) return;

  if (!currentApplications || currentApplications.length === 0) {
    list.innerHTML = `
      <div style="text-align: center; padding: 28px 16px; color: var(--text-muted); font-size: 13px;">
        <i class="fa-solid fa-bell-slash" style="font-size: 20px; display: block; margin-bottom: 8px; color: #94a3b8;"></i>
        No unread notifications
      </div>
    `;
    if (countBadge) countBadge.style.display = 'none';
    return;
  }

  const recent = currentApplications.slice(0, 5);
  if (countBadge) {
    countBadge.innerText = recent.length;
    countBadge.style.display = 'inline-block';
  }

  list.innerHTML = recent.map(a => `
    <div class="notif-item">
      <span class="notif-item-icon"><i class="fa-solid fa-file-invoice" style="color: #0284c7;"></i></span>
      <div class="notif-item-content">
        <h5>Application #${escapeHtml(a.application_no)}</h5>
        <p>${escapeHtml(a.service_name || 'Scheme')} • ${escapeHtml(a.citizen_name)} (${escapeHtml(a.status)})</p>
        <div class="notif-item-time">${formatDate(a.created_at)}</div>
      </div>
    </div>
  `).join('');
}

// Setup Omnisearch Spotlight System
let omnisearchActiveTab = 'all';

function setupOmnisearch() {
  const input = document.getElementById('omnisearchInput');
  if (input) {
    input.addEventListener('input', (e) => {
      renderOmnisearchResults(e.target.value);
    });
  }
}

function openOmnisearch() {
  const modal = document.getElementById('omnisearchModal');
  const input = document.getElementById('omnisearchInput');
  if (!modal) return;
  modal.classList.add('active');
  if (input) {
    input.value = '';
    setTimeout(() => input.focus(), 80);
    renderOmnisearchResults('');
  }
}

function setOmnisearchTab(tab, btn) {
  omnisearchActiveTab = tab;
  document.querySelectorAll('.omnisearch-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const query = document.getElementById('omnisearchInput')?.value || '';
  renderOmnisearchResults(query);
}

function renderOmnisearchResults(query) {
  const container = document.getElementById('omnisearchResults');
  if (!container) return;

  const q = query.toLowerCase().trim();
  if (!q) {
    container.innerHTML = `
      <div class="omnisearch-hint">
        <p>Type keywords to search across central database records.</p>
        <div class="omnisearch-quick-keys">
          <span><kbd>↑</kbd> <kbd>↓</kbd> Navigate</span>
          <span><kbd>↵</kbd> Select</span>
          <span><kbd>ESC</kbd> Close</span>
        </div>
      </div>
    `;
    return;
  }

  let matches = [];

  // 1. Search VLE Operators
  if (omnisearchActiveTab === 'all' || omnisearchActiveTab === 'vles') {
    currentVLEs.forEach(v => {
      if (v.csc_id.toLowerCase().includes(q) || v.name.toLowerCase().includes(q) || (v.center_name && v.center_name.toLowerCase().includes(q)) || (v.email && v.email.toLowerCase().includes(q))) {
        matches.push({
          type: 'vle',
          icon: '<i class="fa-solid fa-user-tie"></i>',
          title: `${v.name} (${v.csc_id})`,
          desc: `${v.center_name || 'CSC Center'} • ${v.state || ''} • Wallet ₹${parseFloat(v.wallet_balance).toFixed(2)}`,
          tag: 'VLE Operator',
          action: () => {
            document.getElementById('omnisearchModal').classList.remove('active');
            switchView('vles');
            openVleDetailModal(v.id);
          }
        });
      }
    });
  }

  // 2. Search Applications
  if (omnisearchActiveTab === 'all' || omnisearchActiveTab === 'apps') {
    currentApplications.forEach(a => {
      if (a.application_no.toLowerCase().includes(q) || a.citizen_name.toLowerCase().includes(q) || a.citizen_phone.includes(q) || a.service_name.toLowerCase().includes(q)) {
        matches.push({
          type: 'app',
          icon: '<i class="fa-solid fa-file-invoice"></i>',
          title: `${a.application_no} — ${a.citizen_name}`,
          desc: `${a.service_name} • ${a.status} • Fee ₹${parseFloat(a.service_fee).toFixed(2)}`,
          tag: a.status,
          action: () => {
            document.getElementById('omnisearchModal').classList.remove('active');
            switchView('applications');
            viewReceipt(a.application_no);
          }
        });
      }
    });
  }

  // 3. Search Services
  if (omnisearchActiveTab === 'all' || omnisearchActiveTab === 'services') {
    currentServices.forEach(s => {
      if (s.name.toLowerCase().includes(q) || s.service_code.toLowerCase().includes(q) || s.category.toLowerCase().includes(q)) {
        matches.push({
          type: 'service',
          icon: '<i class="fa-solid fa-gears"></i>',
          title: `${s.name} (${s.service_code})`,
          desc: `${s.category} • Govt Fee ₹${parseFloat(s.fee).toFixed(2)} • Comm ₹${parseFloat(s.vle_commission).toFixed(2)}`,
          tag: 'Scheme',
          action: () => {
            document.getElementById('omnisearchModal').classList.remove('active');
            openApplyModal(s.id);
          }
        });
      }
    });
  }

  if (matches.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 32px 16px; color: var(--text-muted); font-size: 13.5px;">No records match "<strong>${escapeHtml(query)}</strong>"</div>`;
    return;
  }

  container.innerHTML = matches.slice(0, 15).map((m, idx) => `
    <div class="omnisearch-item" data-idx="${idx}">
      <div class="omnisearch-item-left">
        <span class="omnisearch-item-icon">${m.icon}</span>
        <div>
          <div class="omnisearch-item-title">${escapeHtml(m.title)}</div>
          <div class="omnisearch-item-desc">${escapeHtml(m.desc)}</div>
        </div>
      </div>
      <span class="omnisearch-tag">${escapeHtml(m.tag)}</span>
    </div>
  `).join('');

  container.querySelectorAll('.omnisearch-item').forEach((item, i) => {
    item.addEventListener('click', () => {
      matches[i].action();
    });
  });
}

// Global Keyboard Shortcuts
function setupGlobalShortcuts() {
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openOmnisearch();
    } else if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      openOmnisearch();
    } else if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
      document.getElementById('notificationDropdown')?.classList.remove('active');
      closeProfileDropdown();
      closeHeaderSearch();
    }
  });

  // Global click outside to dismiss profile card & expandable search
  document.addEventListener('click', (e) => {
    const profileWrap = document.getElementById('profileDropdownWrap');
    if (profileWrap && !profileWrap.contains(e.target)) {
      closeProfileDropdown();
    }

    const searchWrap = document.getElementById('headerSearchWrap');
    if (searchWrap && !searchWrap.contains(e.target)) {
      const input = document.getElementById('headerOmniInput');
      if (input && !input.value.trim()) {
        closeHeaderSearch();
      }
    }
  });

  // Expandable Search Input listener
  const headerOmni = document.getElementById('headerOmniInput');
  if (headerOmni) {
    headerOmni.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const query = e.target.value.trim();
        openOmnisearch();
        const omniInput = document.getElementById('omnisearchInput');
        if (omniInput) {
          omniInput.value = query;
          renderOmnisearchResults(query);
          omniInput.focus();
        }
        closeHeaderSearch();
      } else if (e.key === 'Escape') {
        closeHeaderSearch();
      }
    });
  }
}

// Expandable Header Search Controls
function toggleHeaderSearch() {
  const wrap = document.getElementById('headerSearchWrap');
  const input = document.getElementById('headerOmniInput');
  if (!wrap) return;
  const isOpening = !wrap.classList.contains('active');
  wrap.classList.toggle('active');
  if (isOpening) {
    closeProfileDropdown();
    document.getElementById('notificationDropdown')?.classList.remove('active');
    if (input) setTimeout(() => input.focus(), 120);
  }
}

function closeHeaderSearch() {
  const wrap = document.getElementById('headerSearchWrap');
  if (wrap) wrap.classList.remove('active');
}

// Profile Dropdown Controls
function toggleProfileDropdown() {
  const card = document.getElementById('profileDropdownCard');
  const wrap = document.getElementById('profileDropdownWrap');
  if (!card) return;
  const isOpening = !card.classList.contains('active');
  card.classList.toggle('active');
  if (wrap) wrap.classList.toggle('active', isOpening);
  if (isOpening) {
    document.getElementById('notificationDropdown')?.classList.remove('active');
    closeHeaderSearch();
  }
}

function closeProfileDropdown() {
  const card = document.getElementById('profileDropdownCard');
  const wrap = document.getElementById('profileDropdownWrap');
  if (card) card.classList.remove('active');
  if (wrap) wrap.classList.remove('active');
}

// Outside click handling to cleanly close all header popups
document.addEventListener('click', (e) => {
  const profileWrap = document.getElementById('profileDropdownWrap');
  if (profileWrap && !profileWrap.contains(e.target)) {
    closeProfileDropdown();
  }

  const searchWrap = document.getElementById('headerSearchWrap');
  if (searchWrap && !searchWrap.contains(e.target)) {
    closeHeaderSearch();
  }
});

// Global Keyboard Shortcut: Escape to close open header overlays
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeProfileDropdown();
    closeHeaderSearch();
    document.getElementById('notificationDropdown')?.classList.remove('active');
  }
});

// Expose globally for inline onclick handlers
window.toggleHeaderSearch = toggleHeaderSearch;
window.closeHeaderSearch = closeHeaderSearch;
window.toggleProfileDropdown = toggleProfileDropdown;
window.closeProfileDropdown = closeProfileDropdown;



// ==========================================================================
// Mobile Responsive Drawer & Navigation Controls
// ==========================================================================
function initMobileDrawer() {
  const menuBtn = document.getElementById('mobileMenuBtn');
  const backdrop = document.getElementById('sidebarBackdrop');
  const closeBtn = document.getElementById('sidebarCloseBtn');
  const sidebar = document.getElementById('panelSidebar');

  function openSidebar() {
    document.body.classList.add('sidebar-open');
    if (sidebar) sidebar.classList.add('mobile-active');
  }

  function closeSidebar() {
    document.body.classList.remove('sidebar-open');
    if (sidebar) sidebar.classList.remove('mobile-active');
  }

  if (menuBtn) {
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (document.body.classList.contains('sidebar-open')) {
        closeSidebar();
      } else {
        openSidebar();
      }
    });
  }

  if (backdrop) backdrop.addEventListener('click', closeSidebar);
  if (closeBtn) closeBtn.addEventListener('click', closeSidebar);

  // Close sidebar on link clicks on mobile screens
  document.querySelectorAll('.panel-sidebar .nav-link').forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 900) {
        closeSidebar();
      }
    });
  });
}

// ==========================================================================
// VLE Recharge Request with Tiered Bonus Incentives (Min ₹5,000)
// ==========================================================================
function selectRechargePreset(amount, cardElem) {
  document.querySelectorAll('#rechargePresetsGrid .recharge-preset-card').forEach(c => c.classList.remove('active'));
  if (cardElem) cardElem.classList.add('active');
  const input = document.getElementById('rechargeAmountInput');
  if (input) input.value = amount;
  updateRechargeBonusCalc(amount);
}

function handleRechargeAmountChange() {
  const input = document.getElementById('rechargeAmountInput');
  const amt = parseFloat(input.value) || 0;
  document.querySelectorAll('#rechargePresetsGrid .recharge-preset-card').forEach(c => {
    c.classList.toggle('active', parseFloat(c.getAttribute('data-amount')) === amt);
  });
  updateRechargeBonusCalc(amt);
}

function calculateBonusData(amount) {
  const amt = parseFloat(amount) || 0;
  if (amt < 5000) {
    return { percentage: 0, bonus: 0, total: amt };
  }
  let pct = 3;
  if (amt >= 50000) pct = 8;
  else if (amt >= 25000) pct = 7;
  else if (amt >= 20000) pct = 6;
  else if (amt >= 15000) pct = 5;
  else if (amt >= 10000) pct = 4;
  else pct = 3;

  const bonus = (amt * pct) / 100;
  const total = amt + bonus;
  return { percentage: pct, bonus, total };
}

function updateRechargeBonusCalc(amount) {
  const data = calculateBonusData(amount);
  const amt = parseFloat(amount) || 0;
  const baseEl = document.getElementById('calcBaseAmount');
  const rateEl = document.getElementById('calcBonusRate');
  const bonusEl = document.getElementById('calcBonusAmount');
  const totalEl = document.getElementById('calcTotalCredit');

  if (baseEl) baseEl.innerText = `₹${amt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  if (rateEl) rateEl.innerText = `${data.percentage}%`;
  if (bonusEl) bonusEl.innerText = `+₹${data.bonus.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  if (totalEl) totalEl.innerText = `₹${data.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
}

// Handle VLE Recharge Request Form Submission
async function handleWalletRechargeRequestSubmit(e) {
  e.preventDefault();
  const amount = parseFloat(document.getElementById('rechargeAmountInput').value);
  const payment_mode = document.getElementById('rechargePaymentMode').value;
  const utr_number = document.getElementById('rechargeUtrInput').value.trim();
  const remarks = document.getElementById('rechargeRemarksInput').value.trim();

  if (isNaN(amount) || amount < 5000) {
    showToast('Minimum Recharge', 'Minimum wallet recharge request is ₹5,000 (5K).', 'warning');
    return;
  }

  if (!utr_number) {
    showToast('UTR Number Required', 'Please provide the transaction reference or UTR number.', 'warning');
    return;
  }

  const btn = document.getElementById('rechargeSubmitBtn');
  btn.disabled = true;
  btn.innerText = 'Submitting Request to Admin...';

  try {
    const res = await API.wallet.requestRecharge({
      amount,
      payment_mode,
      utr_number,
      remarks
    });

    showToast('Request Submitted', res.message, 'success');
    document.getElementById('topupModal').classList.remove('active');
    document.getElementById('walletRechargeRequestForm').reset();
    selectRechargePreset(5000, document.querySelector('#rechargePresetsGrid .recharge-preset-card'));

    await loadMyRechargeRequests();
  } catch (err) {
    showToast('Request Failed', err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Recharge Request to Admin';
  }
}

// Load VLE Operator Own Recharge Requests
let currentMyRechargeRequests = [];
function renderMyRechargeRowHtml(r) {
  return `
    <tr>
      <td>
        <div style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer;" onclick="copyToClipboard('${escapeHtml(r.request_no)}', 'Request No')" title="Click to copy Request No">
          <span style="font-family: var(--font-mono); font-weight: 700; color: var(--csc-blue-600);">${escapeHtml(r.request_no)}</span>
          <i class="fa-regular fa-copy" style="font-size: 10px; opacity: 0.6;"></i>
        </div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${new Date(r.created_at).toLocaleString()}</div>
      </td>
      <td>
        <span style="font-family: var(--font-mono); font-weight: 700;">₹${parseFloat(r.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
      </td>
      <td>
        <span class="badge" style="background:#dcfce7; color:#15803d; font-family:var(--font-mono); font-weight:700;">+₹${parseFloat(r.bonus_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
      </td>
      <td>
        <strong style="font-family: var(--font-mono); color: var(--csc-blue-600); font-size: 13.5px;">₹${parseFloat(r.total_credit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
      </td>
      <td>
        <div style="font-weight: 600; font-size: 12px;">${escapeHtml(r.payment_mode)}</div>
        <code style="font-size: 11px; font-family: var(--font-mono); color: #475569;" class="copyable" onclick="copyToClipboard('${escapeHtml(r.utr_number)}', 'UTR')">${escapeHtml(r.utr_number)} <i class="fa-regular fa-copy"></i></code>
      </td>
      <td>
        <span class="badge badge-${r.status}">
          <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:currentColor;"></span>
          ${r.status.toUpperCase()}
        </span>
      </td>
      <td>
        <div style="font-size: 12px; color: ${r.status === 'rejected' ? '#dc2626' : '#334155'};">
          ${escapeHtml(r.admin_notes || (r.status === 'pending' ? 'Awaiting Super Admin review' : 'Processed by Admin'))}
        </div>
      </td>
    </tr>
  `;
}

async function loadMyRechargeRequests() {
  try {
    const res = await API.wallet.getRechargeRequests();
    currentMyRechargeRequests = res.requests || [];
    if (window.myRechargePaginator) {
      window.myRechargePaginator.setData(currentMyRechargeRequests);
    } else {
      const tbody = document.getElementById('myRechargeRequestsTbody');
      if (tbody) {
        tbody.innerHTML = currentMyRechargeRequests.length === 0
          ? '<tr><td colspan="7" style="text-align: center; padding: 22px; color: var(--text-muted);">No recharge requests submitted yet. Click "+ New Recharge Request" to submit.</td></tr>'
          : currentMyRechargeRequests.map(r => renderMyRechargeRowHtml(r)).join('');
      }
    }
  } catch (err) {
    console.error('Error loading my recharge requests:', err);
  }
}

// ==========================================================================
// Super Admin Recharge Requests Management
// ==========================================================================
let currentAdminRechargeRequests = [];
let currentRechargeTab = 'all';

async function loadRechargeRequests() {
  const tbody = document.getElementById('rechargeRequestsTableBody');
  if (!tbody) return;

  try {
    const res = await API.wallet.getRechargeRequests();
    currentAdminRechargeRequests = res.requests || [];
    const summary = res.summary || {};

    // Update telemetry metrics
    const pEl = document.getElementById('reqStatPending');
    const aEl = document.getElementById('reqStatApproved');
    const rEl = document.getElementById('reqStatRejected');
    const dEl = document.getElementById('reqStatDisbursed');

    if (pEl) pEl.innerText = summary.pending || 0;
    if (aEl) aEl.innerText = summary.approved || 0;
    if (rEl) rEl.innerText = summary.rejected || 0;
    if (dEl) dEl.innerText = `₹${parseFloat(summary.total_disbursed || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    // Update tab badges
    const tabAll = document.getElementById('reqTabAll');
    const tabPen = document.getElementById('reqTabPending');
    const tabApp = document.getElementById('reqTabApproved');
    const tabRej = document.getElementById('reqTabRejected');

    if (tabAll) tabAll.innerText = summary.total || 0;
    if (tabPen) tabPen.innerText = summary.pending || 0;
    if (tabApp) tabApp.innerText = summary.approved || 0;
    if (tabRej) tabRej.innerText = summary.rejected || 0;

    // Update sidebar counter badge
    const sidebarBadge = document.getElementById('sidebarPendingRechargeBadge');
    if (sidebarBadge) {
      sidebarBadge.innerText = summary.pending || 0;
      sidebarBadge.style.display = (summary.pending > 0) ? 'inline-block' : 'none';
    }

    renderAdminRechargeRequestsTable(currentAdminRechargeRequests);
  } catch (err) {
    console.error('Error loading admin recharge requests:', err);
  }
}

function setRechargeTab(status, btn) {
  currentRechargeTab = status;
  document.querySelectorAll('#rechargeFilterTabs .tab-pill').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const sel = document.getElementById('rechargeStatusSelect');
  if (sel) sel.value = status;
  filterRechargeTable();
}

function filterRechargeTable() {
  const query = (document.getElementById('rechargeSearchInput')?.value || '').toLowerCase().trim();
  const status = document.getElementById('rechargeStatusSelect')?.value || currentRechargeTab || 'all';

  let filtered = currentAdminRechargeRequests.filter(r => {
    const matchesStatus = status === 'all' || r.status === status;
    const matchesQuery = !query || 
      (r.request_no && r.request_no.toLowerCase().includes(query)) ||
      (r.user_name && r.user_name.toLowerCase().includes(query)) ||
      (r.csc_id && r.csc_id.toLowerCase().includes(query)) ||
      (r.utr_number && r.utr_number.toLowerCase().includes(query));
    return matchesStatus && matchesQuery;
  });

  renderAdminRechargeRequestsTable(filtered);
}

function renderAdminRechargeRowHtml(r) {
  return `
    <tr>
      <td>
        <div style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer;" onclick="copyToClipboard('${escapeHtml(r.request_no)}', 'Request No')" title="Click to copy Request No">
          <span style="font-family: var(--font-mono); font-weight: 700; color: var(--csc-blue-600);">${escapeHtml(r.request_no)}</span>
          <i class="fa-regular fa-copy" style="font-size: 10px; opacity: 0.6;"></i>
        </div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${new Date(r.created_at).toLocaleString()}</div>
      </td>
      <td>
        <div style="font-weight: 700; color: var(--text-heading);">${escapeHtml(r.user_name || 'Operator')}</div>
        <div style="font-size: 11.5px; color: var(--text-muted); font-family: var(--font-mono);">
          ${escapeHtml(r.csc_id || '')} • <i class="fa-solid fa-phone" style="font-size:10px;"></i> ${escapeHtml(r.user_phone || '—')}
        </div>
      </td>
      <td>
        <span style="font-family: var(--font-mono); font-weight: 700;">₹${parseFloat(r.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
      </td>
      <td>
        <span class="badge" style="background:#dcfce7; color:#15803d; font-family:var(--font-mono); font-weight:700;">+₹${parseFloat(r.bonus_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
      </td>
      <td>
        <strong style="font-family: var(--font-mono); color: var(--csc-blue-600); font-size: 14px;">₹${parseFloat(r.total_credit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
      </td>
      <td>
        <div style="font-weight: 600; font-size: 12px;">${escapeHtml(r.payment_mode)}</div>
        <code style="font-size: 11.5px; font-family: var(--font-mono); color: #0284c7; font-weight: 700;" class="copyable" onclick="copyToClipboard('${escapeHtml(r.utr_number)}', 'UTR')">${escapeHtml(r.utr_number)} <i class="fa-regular fa-copy"></i></code>
      </td>
      <td>
        <span class="badge badge-${r.status}">
          <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:currentColor;"></span>
          ${r.status.toUpperCase()}
        </span>
      </td>
      <td>
        ${r.status === 'pending' ? `
          <div style="display:flex; gap:6px;">
            <button class="btn-sm btn-action-primary" onclick="openReviewRechargeModal(${r.id}, 'approved')" title="Approve & Credit Wallet">
              <i class="fa-solid fa-circle-check"></i> Approve
            </button>
            <button class="btn-sm btn-outline" style="color:#dc2626; border-color:#fca5a5;" onclick="openReviewRechargeModal(${r.id}, 'rejected')" title="Reject Request">
              <i class="fa-solid fa-circle-xmark"></i> Reject
            </button>
          </div>
        ` : `
          <div style="font-size:11.5px; color:#64748b;">
            <strong>${r.status === 'approved' ? '<i class="fa-solid fa-circle-check" style="color:#16a34a;"></i> Approved' : '<i class="fa-solid fa-circle-xmark" style="color:#dc2626;"></i> Rejected'}</strong><br>
            <small style="opacity:0.8;">${escapeHtml(r.admin_notes || '')}</small>
          </div>
        `}
      </td>
    </tr>
  `;
}

function renderAdminRechargeRequestsTable(list) {
  if (window.rechargeReqPaginator) {
    window.rechargeReqPaginator.setData(list);
  } else {
    const tbody = document.getElementById('rechargeRequestsTableBody');
    if (!tbody) return;
    tbody.innerHTML = list.length === 0
      ? '<tr><td colspan="8" style="text-align: center; padding: 28px; color: var(--text-muted);">No recharge requests match the selected criteria.</td></tr>'
      : list.map(r => renderAdminRechargeRowHtml(r)).join('');
  }
}

function resetRechargeFilters() {
  const searchInput = document.getElementById('rechargeSearchInput');
  const statusSelect = document.getElementById('rechargeStatusSelect');
  if (searchInput) searchInput.value = '';
  if (statusSelect) statusSelect.value = 'all';
  document.querySelectorAll('#rechargeFilterTabs .tab-pill').forEach(b => {
    b.classList.toggle('active', b.getAttribute('onclick')?.includes("'all'"));
  });
  filterRechargeTable();
}

function openReviewRechargeModal(reqId, preselectedDecision) {
  const req = currentAdminRechargeRequests.find(r => r.id === reqId);
  if (!req) return;

  document.getElementById('reviewReqId').value = req.id;
  document.getElementById('reviewReqSubtitle').innerText = `Request #${req.request_no} • Operator: ${req.user_name} (${req.csc_id})`;
  document.getElementById('reviewReqOperator').innerText = `${req.user_name} (${req.csc_id})`;
  document.getElementById('reviewReqBaseAmt').innerText = `₹${parseFloat(req.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  document.getElementById('reviewReqBonusAmt').innerText = `+₹${parseFloat(req.bonus_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  document.getElementById('reviewReqTotalCredit').innerText = `₹${parseFloat(req.total_credit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  document.getElementById('reviewReqMode').innerText = req.payment_mode;
  document.getElementById('reviewReqUtr').innerText = req.utr_number;

  const remarksRow = document.getElementById('reviewReqRemarksRow');
  if (req.remarks) {
    remarksRow.style.display = 'flex';
    document.getElementById('reviewReqRemarks').innerText = req.remarks;
  } else {
    remarksRow.style.display = 'none';
  }

  // Radio button selection
  const radios = document.getElementsByName('reviewDecision');
  radios.forEach(radio => {
    radio.checked = radio.value === preselectedDecision;
  });

  const notesInput = document.getElementById('reviewAdminNotes');
  notesInput.value = preselectedDecision === 'approved' 
    ? 'Bank credit and UTR verified. Approved by Super Admin.' 
    : 'Unable to verify bank credit for this UTR number.';

  document.getElementById('reviewRechargeModal').classList.add('active');
}

async function handleReviewRechargeSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('reviewReqId').value;
  let status = 'approved';
  document.getElementsByName('reviewDecision').forEach(r => {
    if (r.checked) status = r.value;
  });
  const admin_notes = document.getElementById('reviewAdminNotes').value.trim();

  const submitBtn = document.getElementById('reviewSubmitBtn');
  submitBtn.disabled = true;
  submitBtn.innerText = 'Processing Decision...';

  try {
    const res = await API.wallet.updateRechargeRequestStatus(id, { status, admin_notes });
    showToast('Decision Recorded', res.message, status === 'approved' ? 'success' : 'info');
    document.getElementById('reviewRechargeModal').classList.remove('active');

    await Promise.all([
      loadRechargeRequests(),
      loadVLEList(),
      loadDashboardStats(),
      loadWalletTransactions()
    ]);
  } catch (err) {
    showToast('Action Failed', err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = 'Confirm Action';
  }
}
