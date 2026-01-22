// src/pages/Customer/Reports/CustomerOrderReports.jsx
import React, { useState, useEffect, useCallback } from 'react';
import Header from '../../../components/layout/Header/Header';
import Sidebar from '../../../components/layout/Sidebar/Sidebar';
import './CustomerOrderReports.css';
import axios from 'axios';

const CustomerOrderReports = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState('Order Reports');
  const [user, setUser] = useState(null);
  const [downloadingOrderId, setDownloadingOrderId] = useState(null);

  const backendUrl = process.env.REACT_APP_BACKEND_IP;

  const fetchCurrentUser = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        window.location.href = '/login';
        return;
      }

      const response = await axios.get(`${backendUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(response.data.user || response.data);
    } catch (error) {
      console.error("Failed to load user:", error);
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
  }, [backendUrl]);

  const fetchMyOrders = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/orders/my-orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setOrders(response.data);
    } catch (error) {
      console.error("Error fetching your orders:", error);
      setError("Failed to load your orders. Please try again later.");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchMyOrders();
  }, [fetchCurrentUser, fetchMyOrders]);

  const downloadDeliveredInvoice = async (orderId) => {
    setDownloadingOrderId(orderId);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${backendUrl}/api/orders/getdeliveredinvoice/${orderId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob',
        }
      );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `delivered-invoice-${orderId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading delivered invoice:", error);
      if (error.response?.status === 400) {
        alert("No delivered quantity available for this order.");
      } else {
        alert("Failed to download delivered invoice.");
      }
    } finally {
      setDownloadingOrderId(null);
    }
  };

  const downloadPendingInvoice = async (orderId) => {
    setDownloadingOrderId(orderId);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${backendUrl}/api/orders/getpendinginvoice/${orderId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob',
        }
      );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `pending-invoice-${orderId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading pending invoice:", error);
      if (error.response?.status === 400) {
        alert("No pending quantity available for this order.");
      } else {
        alert("Failed to download pending invoice.");
      }
    } finally {
      setDownloadingOrderId(null);
    }
  };

  if (!user) {
    return <div className="customer-reports-loading">Loading...</div>;
  }

  return (
    <div className="customer-reports-layout">
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
      <main className={`customer-reports-main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="customer-reports-container-wrapper">
          <div className="customer-reports-container">
            <div className="customer-reports-header-section">
              <h2 className="customer-reports-page-title">My Order Reports</h2>
              <button
                className="customer-reports-refresh-button"
                onClick={fetchMyOrders}
                disabled={loading}
              >
                {loading ? 'Refreshing...' : 'Refresh My Orders'}
              </button>
            </div>

            {error && <div className="customer-reports-error-message">{error}</div>}

            {loading ? (
              <div className="customer-reports-loading">Loading your orders...</div>
            ) : orders.length === 0 ? (
              <div className="customer-reports-no-data">No orders found</div>
            ) : (
              <div className="customer-reports-table-wrapper">
                <table className="customer-reports-data-table">
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>Product</th>
                      <th>Ordered Qty</th>
                      <th>Delivered Qty</th>
                      <th>Pending Qty</th>
                      <th>Price</th>
                      <th>Total Amount</th>
                      <th>Status</th>
                      <th>Order Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order, index) => {
                      const pendingQty = order.orderedQuantity - order.deliveredQuantity;
                      const hasDelivered = order.deliveredQuantity > 0;
                      const hasPending = pendingQty > 0;

                      return (
                        <tr key={order._id}>
                          <td>{index + 1}</td>
                          <td>{order.product?.productName || 'N/A'}</td>
                          <td>{order.orderedQuantity}</td>
                          <td>{order.deliveredQuantity}</td>
                          <td>{pendingQty}</td>
                          <td>₹{order.price.toFixed(2)}</td>
                          <td>₹{order.totalAmount.toFixed(2)}</td>
                          <td>
                            <span className={`customer-reports-status-badge customer-reports-status-${order.status?.toLowerCase() || 'pending'}`}>
                              {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                            </span>
                          </td>
                          <td>{new Date(order.orderDate).toLocaleDateString()}</td>
                          <td>
                            <div className="customer-reports-action-buttons">
                              {hasDelivered && (
                                <button
                                  className="customer-reports-invoice-button delivered"
                                  onClick={() => downloadDeliveredInvoice(order._id)}
                                  disabled={downloadingOrderId === order._id}
                                >
                                  {downloadingOrderId === order._id
                                    ? 'Downloading...'
                                    : 'Delivered Invoice'}
                                </button>
                              )}

                              {hasPending && (
                                <button
                                  className="customer-reports-invoice-button pending"
                                  onClick={() => downloadPendingInvoice(order._id)}
                                  disabled={downloadingOrderId === order._id}
                                >
                                  {downloadingOrderId === order._id
                                    ? 'Downloading...'
                                    : 'Pending Invoice'}
                                </button>
                              )}
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
        </div>
      </main>
    </div>
  );
};

export default CustomerOrderReports;