// src/pages/Sales/MyCustomerRequests.jsx
import React, { useState, useEffect } from 'react';
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
            </div>

            {requests.length === 0 ? (
              <div className="requests-no-data">
                No customer requests found
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
                    {requests.map((request, index) => (
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