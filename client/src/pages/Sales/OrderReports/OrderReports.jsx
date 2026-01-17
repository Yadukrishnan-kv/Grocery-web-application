// src/pages/Sales/Orders/OrderReports.jsx
import React, { useState, useEffect, useCallback } from 'react';
import Header from '../../../components/layout/Header/Header';
import Sidebar from '../../../components/layout/Sidebar/Sidebar';
import './OrderReports.css';
import axios from 'axios';

const OrderReports = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState('Orders Report');
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

  const fetchDeliveredOrders = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/orders/admin-delivered-orders`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setOrders(response.data);
    } catch (error) {
      console.error('Error fetching delivered orders:', error);
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
          responseType: 'blob' // For file download
        }
      );
      
      // Create download link
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
      
      // Create download link
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
      
      // Update the specific order in the list
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
    return <div className="loading">Loading...</div>;
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
      <main className={`main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="table-container">
          <div className="table-header">
            <h2>Order Reports</h2>
            <button 
              className="refresh-button"
              onClick={fetchDeliveredOrders}
              disabled={loading}
            >
              {loading ? 'Refreshing...' : 'Refresh Data'}
            </button>
          </div>
          
          {loading ? (
            <div className="loading">Loading delivered orders...</div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">No</th>
                    <th scope="col">Customer</th>
                    <th scope="col">Product</th>
                    <th scope="col">Ordered Qty</th>
                    <th scope="col">Delivered Qty</th>
                    <th scope="col">Pending Qty</th>
                    <th scope="col">Price</th>
                    <th scope="col">Total Amount</th>
                    <th scope="col">Delivery Partner</th>
                    <th scope="col">Order Date</th>
                    <th scope="col">Status</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length > 0 ? (
                    orders.map((order, index) => {
                      const pendingQty = order.orderedQuantity - order.deliveredQuantity;
                      const isFullyDelivered = pendingQty === 0;
                      
                      return (
                        <tr key={order._id}>
                          <td>{index + 1}</td>
                          <td>{order.customer?.name || 'N/A'}</td>
                          <td>{order.product?.productName || 'N/A'}</td>
                          <td>{order.orderedQuantity}</td>
                          <td>{order.deliveredQuantity}</td>
                          <td>{pendingQty}</td>
                          <td>${order.price.toFixed(2)}</td>
                          <td>${order.totalAmount.toFixed(2)}</td>
                          <td>{order.assignedTo?.username || 'Not assigned'}</td>
                          <td>{new Date(order.orderDate).toLocaleDateString()}</td>
                          <td>
                            <span className={`status-badge status-delivered`}>
                              Delivered
                            </span>
                          </td>
                          <td>
                            <div className="action-buttons">
                              <button
                                className="invoice-button delivered"
                                onClick={() => downloadDeliveredInvoice(order._id)}
                                disabled={downloadingOrderId === order._id}
                              >
                                {downloadingOrderId === order._id && 
                                 order.deliveredQuantity > 0 ? 'Downloading...' : 'Delivered Invoice'}
                              </button>
                              
                              {!isFullyDelivered && (
                                <button
                                  className="invoice-button pending"
                                  onClick={() => downloadPendingInvoice(order._id)}
                                  disabled={downloadingOrderId === order._id}
                                >
                                  {downloadingOrderId === order._id && 
                                   pendingQty > 0 ? 'Downloading...' : 'Pending Invoice'}
                                </button>
                              )}
                              
                              <button
                                className="refresh-order-button"
                                onClick={() => refreshOrderData(order._id)}
                                title="Refresh order data"
                              >
                                🔄
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="12" className="no-data">
                        No delivered orders found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default OrderReports;