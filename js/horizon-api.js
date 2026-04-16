(function () {
  'use strict';

  const API_BASE = window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://api.horizon.com';

  const AGENCY_ID = 1;

  async function apiCall(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = { 'Content-Type': 'application/json', ...options.headers };

    const res = await fetch(url, {
      credentials: 'include',
      headers,
      ...options
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `API error ${res.status}`);
    }
    return res.json();
  }

  window.HorizonAPI = {
    // ─────────────────────────────────────────────────────────────
    // PUBLIC CONTENT
    // ─────────────────────────────────────────────────────────────
    getContent: (type) => apiCall(`/api/content/${AGENCY_ID}/${type}`),

    // ─────────────────────────────────────────────────────────────
    // BOOKINGS
    // ─────────────────────────────────────────────────────────────
    submitBooking: (data) => apiCall('/api/v1/bookings', { method: 'POST', body: JSON.stringify(data) }),
    getBookings: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return apiCall(`/api/v1/bookings${query ? '?' + query : ''}`);
    },
    getBooking: (uuid) => apiCall(`/api/v1/bookings/${uuid}`),
    updateBooking: (uuid, data) => apiCall(`/api/v1/bookings/${uuid}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteBooking: (uuid) => apiCall(`/api/v1/bookings/${uuid}`, { method: 'DELETE' }),

    // ─────────────────────────────────────────────────────────────
    // CLIENTS
    // ─────────────────────────────────────────────────────────────
    getClients: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return apiCall(`/api/v1/clients${query ? '?' + query : ''}`);
    },
    getClient: (uuid) => apiCall(`/api/v1/clients/${uuid}`),
    createClient: (data) => apiCall('/api/v1/clients', { method: 'POST', body: JSON.stringify(data) }),
    updateClient: (uuid, data) => apiCall(`/api/v1/clients/${uuid}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteClient: (uuid) => apiCall(`/api/v1/clients/${uuid}`, { method: 'DELETE' }),

    // ─────────────────────────────────────────────────────────────
    // STAFF
    // ─────────────────────────────────────────────────────────────
    getStaff: () => apiCall('/api/v1/staff'),
    createStaff: (data) => apiCall('/api/v1/staff', { method: 'POST', body: JSON.stringify(data) }),
    updateStaff: (uuid, data) => apiCall(`/api/v1/staff/${uuid}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteStaff: (uuid) => apiCall(`/api/v1/staff/${uuid}`, { method: 'DELETE' }),

    // ─────────────────────────────────────────────────────────────
    // LEADS
    // ─────────────────────────────────────────────────────────────
    getLeads: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return apiCall(`/api/v1/leads${query ? '?' + query : ''}`);
    },
    convertLead: (id) => apiCall(`/api/v1/leads/${id}/convert`, { method: 'POST' }),

    // ─────────────────────────────────────────────────────────────
    // DASHBOARD
    // ─────────────────────────────────────────────────────────────
    getDashboardStats: () => apiCall('/api/v1/dashboard/stats'),

    // ─────────────────────────────────────────────────────────────
    // TRANSACTIONS (JOURNAL)
    // ─────────────────────────────────────────────────────────────
    getTransactions: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return apiCall(`/api/v1/transactions${query ? '?' + query : ''}`);
    },
    createTransaction: (data) => apiCall('/api/v1/transactions', { method: 'POST', body: JSON.stringify(data) }),

    // ─────────────────────────────────────────────────────────────
    // ATTENDANCE
    // ─────────────────────────────────────────────────────────────
    getAttendance: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return apiCall(`/api/v1/attendance${query ? '?' + query : ''}`);
    },

    // ─────────────────────────────────────────────────────────────
    // REMINDERS
    // ─────────────────────────────────────────────────────────────
    getReminders: () => apiCall('/api/v1/reminders'),
    createReminder: (data) => apiCall('/api/v1/reminders', { method: 'POST', body: JSON.stringify(data) }),
    markReminderDone: (id) => apiCall(`/api/v1/reminders/${id}/done`, { method: 'PUT' }),

    // ─────────────────────────────────────────────────────────────
    // AGENCY BRANDING
    // ─────────────────────────────────────────────────────────────
    updateAgency: (data) => apiCall('/api/v1/agency', { method: 'PUT', body: JSON.stringify(data) }),

    // ─────────────────────────────────────────────────────────────
    // CONTENT MANAGEMENT (OFFERS/GALLERY/VIDEOS)
    // ─────────────────────────────────────────────────────────────
    adminGetContent: (type) => apiCall(`/api/content/admin/${type}`),
    adminCreateContent: (type, data) => apiCall(`/api/content/admin/${type}`, { method: 'POST', body: JSON.stringify(data) }),
    adminUpdateContent: (type, uuid, data) => apiCall(`/api/content/admin/${type}/${uuid}`, { method: 'PUT', body: JSON.stringify(data) }),
    adminDeleteContent: (type, uuid) => apiCall(`/api/content/admin/${type}/${uuid}`, { method: 'DELETE' }),

    // ─────────────────────────────────────────────────────────────
    // AUTH
    // ─────────────────────────────────────────────────────────────
    login: (email, password) => apiCall('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    logout: () => apiCall('/api/v1/auth/logout', { method: 'POST' }),
    getMe: () => apiCall('/api/v1/auth/me'),

    // ─────────────────────────────────────────────────────────────
    // UPLOAD
    // ─────────────────────────────────────────────────────────────
    upload: (formData) => fetch(`${API_BASE}/api/v1/upload`, {
      method: 'POST',
      credentials: 'include',
      body: formData
    }).then(r => r.json())
  };

  console.log('%c✅ HorizonAPI v2 loaded', 'color:#00ff00;font-weight:bold');
})();