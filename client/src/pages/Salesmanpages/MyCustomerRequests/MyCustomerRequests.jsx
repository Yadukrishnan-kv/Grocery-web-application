// src/pages/Sales/MyCustomerRequests.jsx
import React, { useState, useEffect, useMemo } from 'react';
import Header from '../../../components/layout/Header/Header';
import Sidebar from '../../../components/layout/Sidebar/Sidebar';
import './MyCustomerRequests.css'; // New CSS file (below)
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const MyCustomerRequests = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const backendUrl = process.env.REACT_APP_BACKEND_IP;
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          navigate('/login');
          return;
        }

        // Fetch requests
        const res = await axios.get(`${backendUrl}/api/customers/customer-requests/my-requests`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setRequests(res.data);

        // Fetch user
        const userRes = await axios.get(`${backendUrl}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setUser(userRes.data.user || userRes.data);
      } catch (error) {
        console.error("Error fetching data:", error);
        navigate('/login');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [backendUrl, navigate]);

  // Combined search + status filter using useMemo for performance
  const filteredRequests = useMemo(() => {
    return requests.filter(request => {
      // Search by name or email
      const matchesSearch = !searchTerm.trim() ||
        request.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        request.email?.toLowerCase().includes(searchTerm.toLowerCase());

      // Status filter
      const matchesStatus = statusFilter === 'all' ||
        request.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [requests, searchTerm, statusFilter]);

  const clearSearch = () => {
    setSearchTerm('');
  };

  if (loading) {
    return <div className="requests-loading">Loading requests...</div>;
  }

  return (
    <div className="requests-layout">
      <Header
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        user={user}
      />
      <Sidebar
        isOpen={sidebarOpen}
        activeItem="My Customer Requests"
        onSetActiveItem={() => {}}
        onClose={() => setSidebarOpen(false)}
        user={user}
      />
      <main className={`requests-main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="requests-container-wrapper">
          <div className="requests-container">
            <div className="requests-header-section">
              <h2 className="requests-page-title">My Customer Requests</h2>

              {/* Search & Filter Controls */}
              <div className="requests-controls-group">
                {/* Status Filter */}
                <div className="requests-filter-group">
                  <label htmlFor="statusFilter" className="requests-filter-label">
                    Filter by Status:
                  </label>
                  <select
                    id="statusFilter"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="requests-status-filter"
                  >
                    <option value="all">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="accepted">Accepted</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>

                {/* Search Bar */}
                <div className="requests-search-container">
                  <input
                    type="text"
                    className="requests-search-input"
                    placeholder="Search by name or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  {searchTerm && (
                    <button
                      className="requests-search-clear"
                      onClick={clearSearch}
                      aria-label="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            </div>

            {filteredRequests.length === 0 ? (
              <div className="requests-no-data">
                {requests.length === 0
                  ? "No customer requests found"
                  : "No requests match your search/filter"}
              </div>
            ) : (
              <div className="requests-table-wrapper">
                <table className="requests-data-table">
                  <thead>
                    <tr>
                      <th scope="col">No</th>
                      <th scope="col">Name</th>
                      <th scope="col">Email</th>
                      <th scope="col">Phone</th>
                      <th scope="col">Credit Limit</th>
                      <th scope="col">Billing Type</th>
                      <th scope="col">Status</th>
                      <th scope="col">Created</th>
                      {requests.some(r => r.status === 'rejected') && <th scope="col">Reason</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRequests.map((request, index) => (
                      <tr key={request._id}>
                        <td>{index + 1}</td>
                        <td>{request.name}</td>
                        <td>{request.email}</td>
                        <td>{request.phoneNumber}</td>
                        <td>AED{request.creditLimit.toFixed(2)}</td>
                        <td>{request.billingType}</td>
                        <td>
                          <span className={`requests-status-badge requests-status-${request.status}`}>
                            {request.status === 'pending' ? 'Pending' :
                             request.status === 'accepted' ? 'Accepted' : 'Rejected'}
                          </span>
                        </td>
                        <td>{new Date(request.createdAt).toLocaleDateString()}</td>
                        {request.status === 'rejected' && (
                          <td>{request.rejectionReason || 'No reason provided'}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default MyCustomerRequests;