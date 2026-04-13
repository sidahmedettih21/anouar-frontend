(function() {
(function() {
(function() {
  'use strict';

  const API_BASE = 'http://localhost:3001'; // Change to https://api.horizon.com in prod
  const AGENCY_ID = 1; // Anouar = demo agency

  async function apiCall(endpoint, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    const res = await fetch(`${API_BASE}${endpoint}`, {
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
    // Content
    getContent: (type) => apiCall(`/api/content/${AGENCY_ID}/${type}`),
    
    // Bookings
    submitBooking: (data) => apiCall('/api/v1/bookings', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

    // Auth
    login: (email, password) => apiCall('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    }),
    logout: () => apiCall('/api/v1/auth/logout', { method: 'POST' }),
    getMe: () => apiCall('/api/v1/auth/me'),

    // Admin Content
    adminGetContent: (type) => apiCall(`/api/content/admin/${type}`),
    adminCreateContent: (type, data) => apiCall(`/api/content/admin/${type}`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    adminUpdateContent: (type, uuid, data) => apiCall(`/api/content/admin/${type}/${uuid}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
    adminDeleteContent: (type, uuid) => apiCall(`/api/content/admin/${type}/${uuid}`, {
      method: 'DELETE'
    }),

    // Clients & Payments
    getClients: () => apiCall('/api/v1/clients'),
    createClient: (data) => apiCall('/api/v1/clients', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    getTransactions: () => apiCall('/api/v1/transactions'),
    createTransaction: (data) => apiCall('/api/v1/transactions', {
      method: 'POST',
      body: JSON.stringify(data)
    })
  };
})();})();
})();
