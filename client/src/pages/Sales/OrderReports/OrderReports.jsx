import React, { useState, useEffect, useCallback } from 'react';
import Header from '../../../components/layout/Header/Header';
import Sidebar from '../../../components/layout/Sidebar/Sidebar';
import './OrderReports.css';
import axios from 'axios';

const OrderReports = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
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
        headers: { Authorization: `Bearer ${token}` }
      });
      setUser(response.data.user || response.data);
    } catch (error) {
      console.error("Failed to load user", error);
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
  }, [backendUrl]);

  // Updated: Now fetches ALL orders with deliveredQuantity > 0 (partial or full)
  const fetchDeliveredOrders = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/orders/admin-delivered-orders`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setOrders(response.data);
    } catch (error) {
      console.error('Error fetching orders with delivery:', error);
      alert('Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchDeliveredOrders();
  }, [fetchCurrentUser, fetchDeliveredOrders]);

  const downloadDeliveredInvoice = async (orderId) => {
    setDownloadingOrderId(orderId);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${backendUrl}/api/orders/getdeliveredinvoice/${orderId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob'
        }
      );
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `delivered-invoice-${orderId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Error downloading delivered invoice:', error);
      if (error.response?.status === 400) {
        alert('No delivered quantity available for this order');
      } else {
        alert('Failed to download delivered invoice');
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
          responseType: 'blob'
        }
      );
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `pending-invoice-${orderId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Error downloading pending invoice:', error);
      if (error.response?.status === 400) {
        alert('No pending quantity available for this order');
      } else {
        alert('Failed to download pending invoice');
      }
    } finally {
      setDownloadingOrderId(null);
    }
  };

  const refreshOrderData = async (orderId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/orders/getorderbyid/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setOrders(prevOrders => 
        prevOrders.map(order => 
          order._id === orderId ? response.data : order
        )
      );
    } catch (error) {
      console.error('Error refreshing order data:', error);
    }
  };

  if (!user) {
    return <div className="order-reports-loading">Loading...</div>;
  }

  return (
    <div className="order-reports-layout">
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
      <main className={`order-reports-main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="order-reports-container-wrapper">
          <div className="order-reports-container">
            <div className="order-reports-header-section">
              <h2 className="order-reports-page-title">Order Reports</h2>
              <button 
                className="order-reports-refresh-button"
                onClick={fetchDeliveredOrders}
                disabled={loading}
              >
                {loading ? 'Refreshing...' : 'Refresh Data'}
              </button>
            </div>
            
            {loading ? (
              <div className="order-reports-loading">Loading orders...</div>
            ) : orders.length === 0 ? (
              <div className="order-reports-no-data">
                No orders with delivered quantity found
              </div>
            ) : (
              <div className="order-reports-table-wrapper">
                <table className="order-reports-data-table">
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>Customer</th>
                      <th>Product</th>
                      <th>Ordered Qty</th>
                      <th>Delivered Qty</th>
                      <th>Pending Qty</th>
                      <th>Price</th>
                      <th>Total Amount</th>
                      <th>Delivery Partner</th>
                      <th>Order Date</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order, index) => {
                      const pendingQty = order.orderedQuantity - order.deliveredQuantity;
                      const isPartiallyDelivered = order.deliveredQuantity > 0 && pendingQty > 0;
                      const isFullyDelivered = pendingQty === 0;

                      return (
                        <tr key={order._id}>
                          <td>{index + 1}</td>
                          <td>{order.customer?.name || 'N/A'}</td>
                          <td>{order.product?.productName || 'N/A'}</td>
                          <td>{order.orderedQuantity}</td>
                          <td>{order.deliveredQuantity}</td>
                          <td>{pendingQty}</td>
                          <td>₹{order.price.toFixed(2)}</td>
                          <td>₹{order.totalAmount.toFixed(2)}</td>
                          <td>{order.assignedTo?.username || 'Not assigned'}</td>
                          <td>{new Date(order.orderDate).toLocaleDateString()}</td>
                          <td>
                            <span className={`order-reports-status-badge ${
                              isFullyDelivered 
                                ? 'order-reports-status-fully-delivered' 
                                : isPartiallyDelivered 
                                  ? 'order-reports-status-partially-delivered' 
                                  : 'order-reports-status-pending'
                            }`}>
                              {isFullyDelivered ? 'Fully Delivered' : isPartiallyDelivered ? 'Partially Delivered' : 'Pending'}
                            </span>
                          </td>
                          <td>
                            <div className="order-reports-action-buttons">
                              {/* Delivered Invoice - show if any qty delivered */}
                              {order.deliveredQuantity > 0 && (
                                <button
                                  className="order-reports-invoice-button delivered"
                                  onClick={() => downloadDeliveredInvoice(order._id)}
                                  disabled={downloadingOrderId === order._id}
                                >
                                  {downloadingOrderId === order._id ? 'Downloading...' : 'Delivered Invoice'}
                                </button>
                              )}

                              {/* Pending Invoice - show if any qty pending */}
                              {pendingQty > 0 && (
                                <button
                                  className="order-reports-invoice-button pending"
                                  onClick={() => downloadPendingInvoice(order._id)}
                                  disabled={downloadingOrderId === order._id}
                                >
                                  {downloadingOrderId === order._id ? 'Downloading...' : 'Pending Invoice'}
                                </button>
                              )}

                              <button
                                className="order-reports-refresh-order-button"
                                onClick={() => refreshOrderData(order._id)}
                                title="Refresh order data"
                              >
                                🔄
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
        </div>
      </main>
    </div>
  );
};

export default OrderReports;