// src/pages/Admin/AdminOrderRequests.jsx
import React, { useState, useEffect } from 'react';
import Header from '../../../../components/layout/Header/Header';
import Sidebar from '../../../../components/layout/Sidebar/Sidebar';
import DirhamSymbol from '../../../../Assets/aed-symbol.png';
import axios from 'axios';
import toast from 'react-hot-toast';
import './AdminOrderRequests.css';

const AdminOrderRequests = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
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
        activeItem={activeItem}
        onSetActiveItem={setActiveItem}
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
                    {/* ✅ UPDATED: VAT Breakdown Columns */}
                    <th className="vat-col">Total Dhs<br/><small>(Excl. VAT)</small></th>
                    <th className="vat-col">VAT 5%<br/><small>(Amount)</small></th>
                    <th className="vat-col grand-total-col">Grand Total<br/><small>(Incl. VAT)</small></th>
                    <th>Payment</th>
                    <th>Remarks</th>
                    <th>Requested At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((req, index) => {
                    const totalQty = req.orderItems.reduce((sum, item) => sum + item.orderedQuantity, 0);
                    
                    // ✅ Calculate VAT breakdown for this request
                    const { exclVat, vatAmount, grandTotal } = calculateRequestVAT(req.orderItems);

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
                        
                        {/* ✅ VAT Breakdown Display */}
                        <td className="vat-cell">
                          <div className="vat-amount">
                            <img src={DirhamSymbol} alt="AED" width={12} />
                            <span>{exclVat.toFixed(2)}</span>
                          </div>
                        </td>
                        <td className="vat-cell">
                          <div className="vat-amount vat-highlight">
                            <img src={DirhamSymbol} alt="AED" width={12} />
                            <span>{vatAmount.toFixed(2)}</span>
                          </div>
                        </td>
                        <td className="vat-cell grand-total-cell">
                          <div className="vat-amount grand-total-amount">
                            <img src={DirhamSymbol} alt="AED" width={14} />
                            <span>{grandTotal.toFixed(2)}</span>
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

// ✅ Helper: Calculate VAT breakdown for order request items
const calculateRequestVAT = (orderItems) => {
  if (!orderItems || !Array.isArray(orderItems)) {
    return { exclVat: 0, vatAmount: 0, grandTotal: 0 };
  }
  
  let totalExclVat = 0;
  let totalVatAmount = 0;
  let totalGrand = 0;
  
  orderItems.forEach((item) => {
    const qty = item.orderedQuantity || 0;
    const price = item.price || 0;
    const vatPercent = item.vatPercentage || 5; // Default to 5% if not set
    
    const exclVat = qty * price;
    const vatAmount = exclVat * (vatPercent / 100);
    const total = exclVat + vatAmount;
    
    totalExclVat += exclVat;
    totalVatAmount += vatAmount;
    totalGrand += total;
  });
  
  return {
    exclVat: totalExclVat,
    vatAmount: totalVatAmount,
    grandTotal: totalGrand,
  };
};

export default AdminOrderRequests;