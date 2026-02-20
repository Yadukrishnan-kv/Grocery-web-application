// src/pages/Admin/AdminOrderRequests.jsx
import React, { useState, useEffect } from 'react';
import Header from '../../../../components/layout/Header/Header';
import Sidebar from '../../../../components/layout/Sidebar/Sidebar';
import DirhamSymbol from '../../../../Assets/aed-symbol.png'; // Reuse same symbol as OrderList
import axios from 'axios';
import toast from 'react-hot-toast';
import './AdminOrderRequests.css';

const AdminOrderRequests = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  // Add this state near the top of AdminOrderRequests.jsx
const [activeItem, setActiveItem] = useState("Sales");
  const backendUrl = process.env.REACT_APP_BACKEND_IP;

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${backendUrl}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setUser(res.data.user || res.data);
      } catch (err) {
        console.error('Failed to fetch user', err);
      }
    };

    const fetchRequests = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${backendUrl}/api/orders/pending-requests`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setRequests(res.data);
      } catch (err) {
        toast.error('Failed to load pending order requests');
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
    fetchRequests();
  }, [backendUrl]);

  const handleApprove = async (requestId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${backendUrl}/api/orders/approve-request/${requestId}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Order request approved and placed successfully!');
      setRequests((prev) => prev.filter((r) => r._id !== requestId));
    } catch (err) {
      toast.error('Failed to approve request');
    }
  };

  const handleReject = async (requestId) => {
    const reason = prompt('Enter rejection reason (optional):');
    if (reason === null) return; // User cancelled prompt

    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${backendUrl}/api/orders/reject-request/${requestId}`,
        { reason: reason.trim() || 'No reason provided' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Order request rejected');
      setRequests((prev) => prev.filter((r) => r._id !== requestId));
    } catch (err) {
      toast.error('Failed to reject request');
    }
  };

  if (loading) {
    return <div className="admin-requests-loading">Loading pending order requests...</div>;
  }

  return (
    <div className="admin-requests-layout">
      <Header
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        user={user}
      />
      <Sidebar
  isOpen={sidebarOpen}
  activeItem={activeItem}               // ← string, current active menu
  onSetActiveItem={setActiveItem}   // ← pass a real state setter function
  onClose={() => setSidebarOpen(false)}
  user={user}
/>
      <main className={`admin-requests-main ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="admin-requests-container">
          <div className="admin-requests-header">
            <h1 className="admin-requests-title">Pending Order Requests</h1>
          </div>

          {requests.length === 0 ? (
            <div className="admin-requests-empty">
              No pending order requests at the moment.
            </div>
          ) : (
            <div className="admin-requests-table-wrapper">
              <table className="admin-requests-table">
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Customer</th>
                    <th>Products</th>
                    <th>Total Qty</th>
                    <th>Grand Total (AED)</th>
                    <th>Payment</th>
                    <th>Remarks</th>
                    <th>Requested At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((req, index) => {
                    const totalQty = req.orderItems.reduce((sum, item) => sum + item.orderedQuantity, 0);
                    const grandTotal = req.grandTotal.toFixed(2);

                    return (
                      <tr key={req._id}>
                        <td>{index + 1}</td>
                        <td>
                          <div className="admin-requests-customer-info">
                            <strong>{req.customer?.name || 'N/A'}</strong>
                            <span>{req.customer?.phoneNumber || ''}</span>
                          </div>
                        </td>
                        <td className="admin-requests-products-cell">
                          {req.orderItems?.length > 0 ? (
                            <div className="admin-requests-products-list">
                              {req.orderItems.map((item, i) => (
                                <div key={i} className="admin-requests-product-tag">
                                  <span className="admin-requests-product-name">
                                    {item.product?.productName || 'Unknown'}
                                  </span>
                                  <span className="admin-requests-product-qty">
                                    × {item.orderedQuantity}
                                  </span>
                                  <span className="admin-requests-product-unit">
                                    {item.unit || ''}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="admin-requests-no-products">No products</span>
                          )}
                        </td>
                        <td>{totalQty}</td>
                        <td>
                          <div className="admin-requests-total-cell">
                            <img
                              src={DirhamSymbol}
                              alt="AED"
                              width={15}
                              height={15}
                              style={{ paddingTop: '3px' }}
                            />
                            <span>{grandTotal}</span>
                          </div>
                        </td>
                        <td className="admin-requests-payment">
                          {req.payment?.charAt(0).toUpperCase() + req.payment?.slice(1) || 'N/A'}
                        </td>
                        <td title={req.remarks || ''}>
                          {req.remarks
                            ? req.remarks.substring(0, 40) + (req.remarks.length > 40 ? '...' : '')
                            : '-'}
                        </td>
                        <td>{new Date(req.requestedAt).toLocaleString()}</td>
                        <td>
                          <div className="admin-requests-actions">
                            <button
                              className="admin-requests-approve-btn"
                              onClick={() => handleApprove(req._id)}
                            >
                              Approve
                            </button>
                            <button
                              className="admin-requests-reject-btn"
                              onClick={() => {
                                const reason = prompt('Enter rejection reason (optional):');
                                handleReject(req._id, reason);
                              }}
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default AdminOrderRequests;