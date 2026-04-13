// src/pages/Admin/PendingCustomerRequests.jsx
import React, { useState, useEffect } from 'react';
import Header from '../../../components/layout/Header/Header';
import Sidebar from '../../../components/layout/Sidebar/Sidebar';
import './PendingCustomerRequests.css';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

const PendingCustomerRequests = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);

  // NEW: Rejection modal states
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [requestToReject, setRequestToReject] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');

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
        toast.error("Failed to load data");
        navigate('/login');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [backendUrl, navigate]);

  const handleSuggestionAction = async (id, action) => {
    try {
      await axios.post(
        `${backendUrl}/api/customers/customer-requests/update-suggestion/${id}`,
        { action },
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }
      );

      toast.success(`Credit suggestion ${action} successfully`);

      // Update the request in state (don't remove it, customer is still pending)
      setRequests(prev => prev.map(r =>
        r._id === id ? { ...r, suggestedCreditLimitStatus: action } : r
      ));
    } catch (error) {
      const msg = error.response?.data?.message || 'Error updating suggestion';
      toast.error(msg);
    }
  };

  const handleAccept = async (id) => {
    try {
      const response = await axios.post(
        `${backendUrl}/api/customers/customer-requests/accept/${id}`,
        {},
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }
      );

      const { customer, note, defaultLoginInfo } = response.data;

      let message = `Customer accepted and created successfully!\n\n` +
                    `Name: ${customer.name}\n` +
                    `Email: ${customer.email}\n\n`;

      if (note) {
        message += `${note}\n\n`;
      }

      message += `Default password: 'customer123'\n` +
                 `Customer must change it on first login.`;

      if (defaultLoginInfo?.temporaryPassword) {
        message += `\n\nTemporary password: ${defaultLoginInfo.temporaryPassword}`;
      }

      toast.success(message, {
        duration: 8000,
        style: { whiteSpace: 'pre-line' }
      });

      setRequests(prev => prev.filter(r => r._id !== id));
    } catch (error) {
      const msg = error.response?.data?.message || 'Error accepting request';
      toast.error(msg);
    }
  };

  // Open rejection modal
  const handleReject = (id) => {
    setRequestToReject(id);
    setRejectionReason('');
    setShowRejectModal(true);
  };

  // Confirm rejection
  const confirmReject = async () => {
    if (!requestToReject) return;

    setShowRejectModal(false);

    try {
      const token = localStorage.getItem('token');
      await axios.post(`${backendUrl}/api/customers/customer-requests/reject/${requestToReject}`, 
        { rejectionReason: rejectionReason.trim() || '' }, 
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      toast.success('Request rejected successfully');
      setRequests(prev => prev.filter(r => r._id !== requestToReject));
    } catch (error) {
      const msg = error.response?.data?.message || 'Error rejecting request';
      toast.error(msg);
    } finally {
      setRequestToReject(null);
      setRejectionReason('');
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
                      <th scope="col">Suggested Credit</th>
                      <th scope="col">Suggestion</th>
                      <th scope="col">Billing Type</th>
                      <th scope="col">Statement Type</th>
                      <th scope="col">Due Days</th>
                      <th scope="col">Opening Balance</th>
                      <th scope="col">Opening Due Days</th>
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
                        <td>
                          {request.suggestedCreditLimit != null
                            ? `AED ${request.suggestedCreditLimit.toFixed(2)}`
                            : '-'}
                          {request.suggestedBy?.username && request.suggestedCreditLimit != null && (
                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                              by {request.suggestedBy.username}
                            </div>
                          )}
                        </td>
                        <td>
                          {request.suggestedCreditLimitStatus === 'pending' ? (
                            <div className="action-buttons">
                              <button
                                className="suggestion-approve-btn"
                                title="Accept suggested credit limit"
                                onClick={() => handleSuggestionAction(request._id, 'accepted')}
                              >
                                ✔
                              </button>
                              <button
                                className="suggestion-reject-btn"
                                title="Reject suggested credit limit (use salesman's credit limit)"
                                onClick={() => handleSuggestionAction(request._id, 'rejected')}
                              >
                                ✘
                              </button>
                            </div>
                          ) : request.suggestedCreditLimitStatus === 'accepted' ? (
                            <span style={{ color: '#16a34a', fontWeight: 600 }}>✅ Accepted</span>
                          ) : request.suggestedCreditLimitStatus === 'rejected' ? (
                            <span style={{ color: '#dc2626', fontWeight: 600 }}>❌ Rejected</span>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>—</span>
                          )}
                        </td>
                        <td>{request.billingType}</td>
                        <td>
                          {request.statementType
                            ? request.statementType.charAt(0).toUpperCase() +
                              request.statementType.slice(1)
                            : "-"}
                        </td>
                        <td>{request.dueDays || "-"}</td>
                        <td>
                          {request.openingBalance > 0
                            ? `AED${request.openingBalance.toFixed(2)}`
                            : "-"}
                        </td>
                        <td>
                          {request.openingBalanceDueDays
                            ? `${request.openingBalanceDueDays} days`
                            : "-"}
                        </td>
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

      {/* Responsive Rejection Confirmation Modal */}
      {showRejectModal && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal">
            <h3 className="confirm-title">Reject Request</h3>
            

            <div className="reject-reason-group">
              <label htmlFor="rejectionReason">Reason for Rejection (optional)</label>
              <textarea
                id="rejectionReason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter reason (optional)"
                rows="3"
                className="reject-reason-input"
              />
            </div>

            <div className="confirm-actions">
              <button
                className="confirm-cancel"
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectionReason('');
                }}
              >
                Cancel
              </button>
              <button
                className="confirm-reject"
                onClick={confirmReject}
              >
                Reject Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PendingCustomerRequests;