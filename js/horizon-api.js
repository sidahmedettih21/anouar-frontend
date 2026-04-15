(function() {
(function() {
(function() {
(function() {
  'use strict';

  const API_BASE = 'http://localhost:3000'; // Change to https://api.horizon.com in prod
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
  baseUrl: 'http://localhost:3000', // for use in manual fetch calls

  // Content
  getContent: (type) => apiCall(`/api/content/${AGENCY_ID}/${type}`),
  
  // Bookings
  submitBooking: (data) => apiCall('/api/v1/bookings', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  getBookings: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiCall(`/api/v1/bookings${query ? '?' + query : ''}`);
  },
  getBooking: (uuid) => apiCall(`/api/v1/bookings/${uuid}`),
  updateBooking: (uuid, data) => apiCall(`/api/v1/bookings/${uuid}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  deleteBooking: (uuid) => apiCall(`/api/v1/bookings/${uuid}`, {
    method: 'DELETE'
  }),
getDashboardStats: () => apiCall('/api/v1/dashboard/stats'),
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

  // Clients
  getClients: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiCall(`/api/v1/clients${query ? '?' + query : ''}`);
  },
  getClient: (uuid) => apiCall(`/api/v1/clients/${uuid}`),
  createClient: (data) => apiCall('/api/v1/clients', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  updateClient: (uuid, data) => apiCall(`/api/v1/clients/${uuid}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  deleteClient: (uuid) => apiCall(`/api/v1/clients/${uuid}`, { method: 'DELETE' }),

  // Transactions
  getTransactions: () => apiCall('/api/v1/transactions'),
  createTransaction: (data) => apiCall('/api/v1/transactions', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  getStaff: () => apiCall('/api/v1/staff'),
createStaff: (data) => apiCall('/api/v1/staff', { method: 'POST', body: JSON.stringify(data) }),
updateStaff: (uuid, data) => apiCall(`/api/v1/staff/${uuid}`, { method: 'PUT', body: JSON.stringify(data) }),
deleteStaff: (uuid) => apiCall(`/api/v1/staff/${uuid}`, { method: 'DELETE' })

};
})();})();
})();
})();
