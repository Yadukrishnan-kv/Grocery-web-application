// src/pages/Admin/PendingCustomerRequests.jsx
import React, { useState, useEffect } from 'react';
import Header from '../../../components/layout/Header/Header';
import Sidebar from '../../../components/layout/Sidebar/Sidebar';
import './PendingCustomerRequests.css'; // New CSS file (below)
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const PendingCustomerRequests = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);

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

        // Fetch pending requests
        const res = await axios.get(`${backendUrl}/api/customers/customer-requests/pending`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setRequests(res.data);

        // Fetch current user
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

 const handleAccept = async (id) => {
  if (!window.confirm('Accept this request? This will create the customer account.')) return;

  try {
    const response = await axios.post(
      `${backendUrl}/api/customers/customer-requests/accept/${id}`,
      {},
      {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      }
    );

    const { customer, note, defaultLoginInfo } = response.data;

    // Show consistent message (same as admin create)
    let alertMessage = `Customer created successfully!\n\n` +
                      `Name: ${customer.name}\n` +
                      `Email: ${customer.email}\n\n` +
                      `${note}\n\n` +
                      `The customer can now login with the default password 'customer123'.\n` +
                      `They MUST change it immediately after first login.`;

    if (defaultLoginInfo) {
      alertMessage += `\n\nDevelopment mode credentials:\n` +
                      `Email: ${defaultLoginInfo.email}\n` +
                      `Temporary Password: ${defaultLoginInfo.temporaryPassword}`;
    }

    alert(alertMessage);

    setRequests(prev => prev.filter(r => r._id !== id));
  } catch (error) {
    alert(error.response?.data?.message || 'Error accepting request');
  }
};
  const handleReject = async (id) => {
    const reason = prompt('Reason for rejection (optional):');
    try {
      await axios.post(`${backendUrl}/api/customers/customer-requests/reject/${id}`, { rejectionReason: reason || '' }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setRequests(prev => prev.filter(r => r._id !== id));
      alert('Request rejected');
    } catch (error) {
      alert(error.response?.data?.message || 'Error rejecting request');
    }
  };

  if (loading) {
    return <div className="requests-loading">Loading pending requests...</div>;
  }

  return (
    <div className="pending-requests-layout">
      <Header
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        user={user}
      />
      <Sidebar
        isOpen={sidebarOpen}
        activeItem="Pending Customer Requests"
        onSetActiveItem={() => {}}
        onClose={() => setSidebarOpen(false)}
        user={user}
      />
      <main className={`pending-requests-main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="pending-requests-container-wrapper">
          <div className="pending-requests-container">
            <div className="pending-requests-header-section">
              <h2 className="pending-requests-page-title">Pending Customer Creation Requests</h2>
            </div>

            {requests.length === 0 ? (
              <div className="pending-requests-no-data">
                No pending customer requests
              </div>
            ) : (
              <div className="pending-requests-table-wrapper">
                <table className="pending-requests-data-table">
                  <thead>
                    <tr>
                      <th scope="col">No</th>
                      <th scope="col">Name</th>
                      <th scope="col">Email</th>
                      <th scope="col">Phone</th>
                      <th scope="col">Credit Limit</th>
                      <th scope="col">Billing Type</th>
                      <th scope="col">Salesman</th>
                      <th scope="col">Created At</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((request, index) => (
                      <tr key={request._id}>
                        <td>{index + 1}</td>
                        <td>{request.name}</td>
                        <td>{request.email}</td>
                        <td>{request.phoneNumber}</td>
                        <td>AED{request.creditLimit.toFixed(2)}</td>
                        <td>{request.billingType}</td>
                        <td>{request.salesman?.username || 'Unknown'}</td>
                        <td>{new Date(request.createdAt).toLocaleDateString()}</td>
                        <td>
                          <div className="action-buttons">
                            <button
                              onClick={() => handleAccept(request._id)}
                              className="accept-button"
                            >
                              Accept
                            </button>
                            <button
                              onClick={() => handleReject(request._id)}
                              className="reject-button"
                            >
                              Reject
                            </button>
                          </div>
                        </td>
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

export default PendingCustomerRequests;