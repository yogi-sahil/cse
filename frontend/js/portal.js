// CSC Digital Seva Portal - Public Landing Script

let currentCaptcha = '';
let allServices = [];

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  initCaptcha();
  loadServices();
  setupEventListeners();
  checkExistingSession();
});

// Check if user is already logged in
function checkExistingSession() {
  const token = API.getToken();
  const user = API.getCurrentUser();
  if (token && user) {
    const authBtnGroup = document.getElementById('authButtonGroup');
    if (authBtnGroup) {
      authBtnGroup.innerHTML = `
        <a href="dashboard.html" class="btn btn-accent">
          Go to Digital Seva Panel (${user.role === 'admin' ? 'Admin' : 'VLE'})
        </a>
      `;
    }
  }
}

// Generate Captcha
function initCaptcha() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let str = '';
  for (let i = 0; i < 5; i++) {
    str += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  currentCaptcha = str;
  const captchaElem = document.getElementById('captchaDisplay');
  if (captchaElem) {
    captchaElem.innerText = currentCaptcha;
  }
}

// Setup Event Listeners
function setupEventListeners() {
  // Modal toggles
  const loginModal = document.getElementById('loginModal');

  document.querySelectorAll('.open-login-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      initCaptcha();
      loginModal.classList.add('active');
    });
  });

  document.querySelectorAll('.close-modal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (loginModal) loginModal.classList.remove('active');
    });
  });

  // Captcha refresh
  const refreshBtn = document.getElementById('refreshCaptchaBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => initCaptcha());
  }



  // Login Form Submission
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }

  // Registration Form Submission
  

  // Search input
  const searchInput = document.getElementById('serviceSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      filterServices(e.target.value, getActiveCategory());
    });
  }

  // Category Tabs
  document.querySelectorAll('.tab-btn').forEach(tab => {
    tab.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      const category = e.target.getAttribute('data-category');
      const searchVal = document.getElementById('serviceSearchInput')?.value || '';
      filterServices(searchVal, category);
    });
  });

  // Popular search chip clicks
  document.querySelectorAll('.popular-chips .chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      const text = e.target.innerText.replace('✓', '').trim();
      const input = document.getElementById('serviceSearchInput');
      if (input) {
        input.value = text;
        filterServices(text, getActiveCategory());
      }
    });
  });

  // Font accessibility buttons
  document.querySelectorAll('.font-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const mode = e.target.innerText.trim();
      if (mode === 'A+') {
        document.documentElement.style.fontSize = '17px';
      } else if (mode === 'A-') {
        document.documentElement.style.fontSize = '14px';
      } else {
        document.documentElement.style.fontSize = '15px';
      }
    });
  });
}

function getActiveCategory() {
  const activeTab = document.querySelector('.tab-btn.active');
  return activeTab ? activeTab.getAttribute('data-category') : 'All';
}

// Fetch Services from backend MySQL database
async function loadServices() {
  const grid = document.getElementById('servicesGrid');
  try {
    const data = await API.services.getAll();
    allServices = data.services || [];
    renderServices(allServices);
  } catch (err) {
    console.error('Failed to load services from backend:', err);
    if (grid) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #dc2626;">
          <p><strong>Unable to load services from database.</strong></p>
          <p style="font-size: 13px; color: #64748b; margin-top: 8px;">Ensure backend Node server is running with MySQL connected.</p>
        </div>
      `;
    }
  }
}

function getPortalServiceIcon(code, category) {
  if (code === 'CSC-FIN-001') return '<i class="fa-solid fa-fingerprint"></i>';
  if (code === 'CSC-FIN-002') return '<i class="fa-solid fa-building-columns"></i>';
  if (code === 'CSC-UTL-001') return '<i class="fa-solid fa-mobile-screen-button"></i>';
  if (code === 'CSC-UTL-002') return '<i class="fa-solid fa-satellite-dish"></i>';
  if (code === 'CSC-BBPS-001') return '<i class="fa-solid fa-bolt"></i>';
  if (code === 'CSC-UID-001') return '<i class="fa-solid fa-id-card"></i>';
  if (code === 'CSC-G2C-003') return '<i class="fa-solid fa-address-card"></i>';
  if (code === 'CSC-FIN-003') return '<i class="fa-solid fa-money-bill-transfer"></i>';
  if (code === 'CSC-BBPS-002') return '<i class="fa-solid fa-truck-fast"></i>';
  if (code === 'CSC-FIN-004') return '<i class="fa-solid fa-credit-card"></i>';
  if (code === 'CSC-G2C-001') return '<i class="fa-solid fa-wheat-awn"></i>';
  if (code === 'CSC-G2C-002') return '<i class="fa-solid fa-heart-pulse"></i>';
  if (code === 'CSC-G2C-004') return '<i class="fa-solid fa-hammer"></i>';
  if (code === 'CSC-G2C-005') return '<i class="fa-solid fa-briefcase"></i>';
  if (code === 'CSC-G2C-008') return '<i class="fa-solid fa-globe"></i>';
  return '<i class="fa-solid fa-file-invoice"></i>';
}

function getServicePartnerTag(service) {
  const code = service.service_code || '';
  if (code === 'CSC-FIN-001') {
    return '<div class="service-partner-box"><i class="fa-solid fa-building-columns" style="color:#0284c7;"></i><span><strong>Banks:</strong> SBI, BoB, PNB, HDFC, ICICI, Canara, Union</span></div>';
  }
  if (code === 'CSC-FIN-002') {
    return '<div class="service-partner-box"><i class="fa-solid fa-shield-halved" style="color:#16a34a;"></i><span><strong>Partner Banks:</strong> SBI, PNB, BoB, HDFC, ICICI, Axis, Airtel</span></div>';
  }
  if (code === 'CSC-UTL-001') {
    return '<div class="service-partner-box"><i class="fa-solid fa-signal" style="color:#ea580c;"></i><span><strong>Operators:</strong> Jio, Airtel, Vi, BSNL (Prepaid/Postpaid)</span></div>';
  }
  if (code === 'CSC-UTL-002') {
    return '<div class="service-partner-box"><i class="fa-solid fa-tv" style="color:#7c3aed;"></i><span><strong>DTH:</strong> Tata Play, Airtel DTH, Dish TV, Sun Direct, D2H</span></div>';
  }
  if (code === 'CSC-BBPS-001') {
    return '<div class="service-partner-box"><i class="fa-solid fa-bolt" style="color:#0284c7;"></i><span><strong>BBPS:</strong> All State Electricity Discoms, Gas & Water Boards</span></div>';
  }
  if (code === 'CSC-UID-001') {
    return '<div class="service-partner-box"><i class="fa-solid fa-id-badge" style="color:#059669;"></i><span><strong>UIDAI:</strong> Demographic e-KYC, Address Correction & PVC Card</span></div>';
  }
  if (code === 'CSC-G2C-003') {
    return '<div class="service-partner-box"><i class="fa-solid fa-stamp" style="color:#0284c7;"></i><span><strong>Portals:</strong> Protean NSDL & UTIITSL Instant 2-Hr e-PAN</span></div>';
  }
  if (code === 'CSC-FIN-003') {
    return '<div class="service-partner-box"><i class="fa-solid fa-paper-plane" style="color:#16a34a;"></i><span><strong>IMPS 24x7:</strong> Instant Transfer to All 120+ Indian Banks</span></div>';
  }
  return '';
}

// Render service cards
function renderServices(services) {
  const grid = document.getElementById('servicesGrid');
  if (!grid) return;

  if (services.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #64748b;">
        No services found matching your criteria.
      </div>
    `;
    return;
  }

  grid.innerHTML = services.map(s => `
    <div class="service-card">
      <div class="service-card-top-row">
        <span class="service-badge">${escapeHtml(s.category)}</span>
        <div class="service-card-icon-box">
          ${getPortalServiceIcon(s.service_code, s.category)}
        </div>
      </div>
      <h3 class="service-title">${escapeHtml(s.name)}</h3>
      <div class="service-dept">${escapeHtml(s.department || 'Government of India')}</div>
      <p class="service-desc">${escapeHtml(s.description || 'Access official citizen service via CSC portal.')}</p>
      
      ${getServicePartnerTag(s)}

      <div class="service-pricing">
        <div>
          <span class="fee-label">Govt Fee:</span>
          <span class="fee-val">${parseFloat(s.fee) === 0 ? 'FREE' : '₹' + parseFloat(s.fee).toFixed(2)}</span>
        </div>
        <div>
          <span class="fee-label">VLE Commission:</span>
          <span class="comm-val">+₹${parseFloat(s.vle_commission).toFixed(2)}</span>
        </div>
      </div>

      <button class="btn btn-primary" onclick="handleServiceApplyClick('${s.id}', '${escapeHtml(s.name)}')">
        <i class="fa-solid fa-arrow-right-to-bracket" style="margin-right:6px;"></i> Apply / Service Access
      </button>
    </div>
  `).join('');
}

// Quick filter service from chips
window.quickFilterService = function(keyword) {
  const input = document.getElementById('serviceSearchInput');
  if (input) {
    input.value = keyword;
    filterServices(keyword, getActiveCategory());
    document.getElementById('services-catalog')?.scrollIntoView({ behavior: 'smooth' });
  }
};

// Filter services
function filterServices(search, category) {
  const query = (search || '').toLowerCase().trim();
  const filtered = allServices.filter(s => {
    const matchCategory = !category || category === 'All' || s.category === category;
    const matchSearch = !query ||
      s.name.toLowerCase().includes(query) ||
      (s.department && s.department.toLowerCase().includes(query)) ||
      (s.service_code && s.service_code.toLowerCase().includes(query));
    return matchCategory && matchSearch;
  });
  renderServices(filtered);
}

// Prompt login if clicking apply on public landing
function handleServiceApplyClick(serviceId, serviceName) {
  const token = API.getToken();
  if (token) {
    window.location.href = `/panel.html?apply=${serviceId}`;
  } else {
    initCaptcha();
    const loginModal = document.getElementById('loginModal');
    if (loginModal) {
      loginModal.classList.add('active');
      const errBox = document.getElementById('loginErrorBox');
      if (errBox) {
        errBox.innerText = `Please login to access "${serviceName}".`;
        errBox.style.display = 'block';
      }
    }
  }
}

// Handle Login
async function handleLogin(e) {
  e.preventDefault();
  const identifier = document.getElementById('loginIdentifier').value.trim();
  const password = document.getElementById('loginPassword').value;
  const captcha = document.getElementById('loginCaptcha').value.trim();
  const errBox = document.getElementById('loginErrorBox');

  errBox.style.display = 'none';

  if (!identifier || !password) {
    errBox.innerText = 'Please enter CSC ID / Email and Password.';
    errBox.style.display = 'block';
    return;
  }

  if (captcha.toUpperCase() !== currentCaptcha.toUpperCase()) {
    errBox.innerText = 'Invalid Captcha code. Please try again.';
    errBox.style.display = 'block';
    initCaptcha();
    return;
  }

  const submitBtn = document.getElementById('loginSubmitBtn');
  submitBtn.disabled = true;
  submitBtn.innerText = 'Verifying credentials...';

  try {
    const response = await API.auth.login(identifier, password);
    API.setToken(response.token);
    API.setCurrentUser(response.user);
    window.location.href = 'dashboard.html';
  } catch (err) {
    errBox.innerText = err.message || 'Login failed. Check credentials.';
    errBox.style.display = 'block';
    initCaptcha();
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = 'Sign In to Portal';
  }
}



function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
