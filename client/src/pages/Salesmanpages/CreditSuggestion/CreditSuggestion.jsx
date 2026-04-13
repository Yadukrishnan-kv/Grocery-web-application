import React, { useState, useEffect, useCallback } from 'react';
import Header from '../../../components/layout/Header/Header';
import Sidebar from '../../../components/layout/Sidebar/Sidebar';
import './CreditSuggestion.css';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

const CreditSuggestion = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [suggestInputs, setSuggestInputs] = useState({});
  const [submitting, setSubmitting] = useState({});

  const backendUrl = process.env.REACT_APP_BACKEND_IP;
  const navigate = useNavigate();

  const fetchCurrentUser = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) { navigate('/login'); return; }
      const res = await axios.get(`${backendUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUser(res.data.user || res.data);
    } catch {
      navigate('/login');
    }
  }, [backendUrl, navigate]);

  const fetchRequests = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${backendUrl}/api/customers/customer-requests/manager-pending`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRequests(res.data);
    } catch (error) {
      console.error("Error fetching requests:", error);
      toast.error("Failed to load pending requests");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchRequests();
  }, [fetchCurrentUser, fetchRequests]);

  const handleSuggest = async (requestId) => {
    const value = suggestInputs[requestId];
    if (!value || isNaN(value) || parseFloat(value) < 0) {
      toast.error("Enter a valid credit limit");
      return;
    }

    setSubmitting(prev => ({ ...prev, [requestId]: true }));
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${backendUrl}/api/customers/customer-requests/suggest-credit/${requestId}`,
        { suggestedCreditLimit: parseFloat(value) },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Credit limit suggestion submitted");
      setSuggestInputs(prev => ({ ...prev, [requestId]: '' }));
      fetchRequests();
    } catch (error) {
      const msg = error.response?.data?.message || "Failed to submit suggestion";
      toast.error(msg);
    } finally {
      setSubmitting(prev => ({ ...prev, [requestId]: false }));
    }
  };

  if (loading) {
    return <div className="credit-suggestion-loading">Loading pending requests...</div>;
  }

  return (
    <div className="credit-suggestion-layout">
      <Header
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        user={user}
      />
      <Sidebar
        isOpen={sidebarOpen}
        activeItem="CreditSuggestion"
        onSetActiveItem={() => {}}
        onClose={() => setSidebarOpen(false)}
        user={user}
      />
      <main className={`credit-suggestion-main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="credit-suggestion-container-wrapper">
          <div className="credit-suggestion-container">
            <div className="credit-suggestion-header-section">
              <h2 className="credit-suggestion-page-title">Credit Suggestion</h2>
            </div>

            {requests.length === 0 ? (
              <div className="credit-suggestion-no-data">
                No pending customer requests
              </div>
            ) : (
              <div className="credit-suggestion-table-wrapper">
                <table className="credit-suggestion-data-table">
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>Customer Name</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Salesman Credit Limit</th>
                      <th>Billing Type</th>
                      <th>Salesman</th>
                      <th>Created At</th>
                      <th>Suggestion Status</th>
                      <th>Suggest Credit Limit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((request, index) => (
                      <tr key={request._id}>
                        <td>{index + 1}</td>
                        <td>{request.name}</td>
                        <td>{request.email}</td>
                        <td>{request.phoneNumber}</td>
                        <td>AED {request.creditLimit.toFixed(2)}</td>
                        <td>{request.billingType}</td>
                        <td>{request.salesman?.username || 'Unknown'}</td>
                        <td>{new Date(request.createdAt).toLocaleDateString()}</td>
                        <td>
                          {request.suggestedCreditLimitStatus === 'pending' ? (
                            <span className="suggestion-badge pending">
                              ⏳ Pending (AED {request.suggestedCreditLimit?.toFixed(2)})
                            </span>
                          ) : request.suggestedCreditLimitStatus === 'accepted' ? (
                            <span className="suggestion-badge accepted">
                              ✅ Accepted
                            </span>
                          ) : request.suggestedCreditLimitStatus === 'rejected' ? (
                            <span className="suggestion-badge rejected">
                              ❌ Rejected
                            </span>
                          ) : (
                            <span className="suggestion-badge none">
                              No Suggestion
                            </span>
                          )}
                        </td>
                        <td>
                          {request.suggestedCreditLimitStatus === 'none' || request.suggestedCreditLimitStatus === 'rejected' ? (
                            <div className="suggest-input-group">
                              <input
                                type="number"
                                min="0"
                                className="suggest-credit-input"
                                placeholder="Amount"
                                value={suggestInputs[request._id] || ''}
                                onChange={(e) =>
                                  setSuggestInputs(prev => ({ ...prev, [request._id]: e.target.value }))
                                }
                              />
                              <button
                                className="suggest-btn"
                                onClick={() => handleSuggest(request._id)}
                                disabled={submitting[request._id]}
                              >
                                {submitting[request._id] ? 'Sending...' : 'Suggest'}
                              </button>
                            </div>
                          ) : request.suggestedCreditLimitStatus === 'pending' ? (
                            <span style={{ color: '#92400e', fontWeight: 600, fontSize: '0.85rem' }}>
                              AED {request.suggestedCreditLimit?.toFixed(2)}
                            </span>
                          ) : (
                            <span>—</span>
                          )}
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

export default CreditSuggestion;
