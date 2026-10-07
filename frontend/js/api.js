// CSC Digital Seva Portal - Centralized API Client

function resolveApiBase() {
  const hostname = (window.location.hostname || "").toLowerCase();
  const port = window.location.port || "";

  // Check if current page is opened in a local development environment
  const isLocalHost = hostname === "localhost" ||
                      hostname === "127.0.0.1" ||
                      hostname === "0.0.0.0" ||
                      hostname.endsWith(".local") ||
                      hostname === "";

  if (isLocalHost) {
    // If running directly on the Node backend port (5000)
    if (port === "5000") {
      return `${window.location.origin}/api`;
    }
    // If running via Live Server (5500, 5501), Vite, Python, or file://
    const localHost = hostname || "127.0.0.1";
    return `http://${localHost}:5000/api`;
  }

  // Production Environment (e.g. csesewakendra.in or any live domain)
  // Seamlessly route through the current origin /api
  return `${window.location.origin}/api`;
}

const API_BASE = resolveApiBase();
console.log('[CSC API] Connected to Backend at:', API_BASE);

const API = {
  // Token & Storage Management
  getToken() {
    return localStorage.getItem('csc_token');
  },

  setToken(token) {
    localStorage.setItem('csc_token', token);
  },

  getCurrentUser() {
    try {
      const user = localStorage.getItem('csc_user');
      return user ? JSON.parse(user) : null;
    } catch (e) {
      return null;
    }
  },

  setCurrentUser(user) {
    localStorage.setItem('csc_user', JSON.stringify(user));
  },

  clearAuth() {
    localStorage.removeItem('csc_token');
    localStorage.removeItem('csc_user');
  },

  // Resilient fetch wrapper with safe JSON parsing and JWT injection
  async request(endpoint, options = {}) {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {})
    };

    let response;
    try {
      response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
      });
    } catch (fetchErr) {
      console.error(`Network fetch failed for [${endpoint}]:`, fetchErr);
      throw new Error(`Cannot connect to CSC Backend at ${API_BASE}. Please ensure the Node.js backend is running on port 5000.`);
    }

    // Safely retrieve response as text first to prevent "Unexpected end of JSON input"
    let rawText = '';
    try {
      rawText = await response.text();
    } catch (textErr) {
      rawText = '';
    }

    let data = null;
    if (rawText && rawText.trim().length > 0) {
      try {
        data = JSON.parse(rawText);
      } catch (jsonErr) {
        // If the server returned HTML (e.g. 404/500 from static server or proxy)
        console.warn(`Non-JSON response received from ${endpoint}:`, rawText.substring(0, 200));
        const cleanMsg = rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        throw new Error(cleanMsg.length > 120 ? `Server returned HTTP ${response.status}` : cleanMsg);
      }
    } else {
      // Empty response body
      data = {
        success: response.ok,
        message: response.ok ? 'Success' : `Server returned empty response with status ${response.status}`
      };
    }

    // Handle token expiry or unauthorized
    if (response.status === 401 || (response.status === 403 && data && data.message && data.message.toLowerCase().includes('expired'))) {
      this.clearAuth();
      if (window.location.pathname.includes('panel') || window.location.pathname.includes('dashboard') || window.location.pathname.includes('applications')) {
        window.location.href = 'index.html?session_expired=1';
      }
    }

    if (!response.ok) {
      const errMsg = (data && (data.message || data.error)) || `Request failed with HTTP status ${response.status}`;
      throw new Error(errMsg);
    }

    return data;
  },

  // Auth Endpoints
  auth: {
    login(identifier, password) {
      return API.request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password })
      });
    },
    register(payload) {
      return API.request('/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    getProfile() {
      return API.request('/auth/profile');
    },
    updateProfile(payload) {
      return API.request('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    }
  },

  // Services Catalog
  services: {
    getAll(params = {}) {
      const query = new URLSearchParams(params).toString();
      return API.request(`/services${query ? `?${query}` : ''}`);
    },
    getById(id) {
      return API.request(`/services/${id}`);
    },
    create(data) {
      return API.request('/services', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    update(id, data) {
      return API.request(`/services/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    },
    delete(id) {
      return API.request(`/services/${id}`, {
        method: 'DELETE'
      });
    }
  },

  // Citizen Applications & Orders
  applications: {
    getAll(params = {}) {
      const query = new URLSearchParams(params).toString();
      return API.request(`/applications${query ? `?${query}` : ''}`);
    },
    create(data) {
      return API.request('/applications', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    updateStatus(id, statusData) {
      return API.request(`/applications/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify(statusData)
      });
    }
  },

  // Wallet, Passbook & Recharge Requests
  wallet: {
    getBalance() {
      return API.request('/wallet/balance');
    },
    getTransactions(params = {}) {
      const query = new URLSearchParams(params).toString();
      return API.request(`/wallet/transactions${query ? `?${query}` : ''}`);
    },
    previewBonus(amount) {
      return API.request(`/wallet/preview-bonus?amount=${amount}`);
    },
    requestRecharge(data) {
      return API.request('/wallet/request-recharge', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    getRechargeRequests(params = {}) {
      const query = new URLSearchParams(params).toString();
      return API.request(`/wallet/recharge-requests${query ? `?${query}` : ''}`);
    },
    updateRechargeRequestStatus(id, statusData) {
      return API.request(`/wallet/recharge-requests/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify(statusData)
      });
    },
    addMoney(amount, paymentMethod, userId) {
      return API.request('/wallet/add-money', {
        method: 'POST',
        body: JSON.stringify({ amount, payment_method: paymentMethod, user_id: userId })
      });
    }
  },

  // User Management (Admin Only)
  users: {
    getAll(params = {}) {
      const query = new URLSearchParams(params).toString();
      return API.request(`/users${query ? `?${query}` : ''}`);
    },
    create(userData) {
      return API.request('/users', {
        method: 'POST',
        body: JSON.stringify(userData)
      });
    },
    updateStatus(id, status) {
      return API.request(`/users/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status })
      });
    },
    adjustWallet(id, payload) {
      return API.request(`/users/${id}/adjust-wallet`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    delete(id) {
      return API.request(`/users/${id}`, {
        method: 'DELETE'
      });
    }
  },

  // Support Tickets
  tickets: {
    getAll(params = {}) {
      const query = new URLSearchParams(params).toString();
      return API.request(`/tickets${query ? `?${query}` : ''}`);
    },
    create(data) {
      return API.request('/tickets', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    update(id, data) {
      return API.request(`/tickets/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    }
  },

  // Stats
  stats: {
    getDashboard() {
      return API.request('/stats');
    }
  }
};
