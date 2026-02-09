// src/pages/Customer/Orders/CustomerOrdersList.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Header from '../../../components/layout/Header/Header';
import Sidebar from '../../../components/layout/Sidebar/Sidebar';
import './CustomerOrdersList.css';
import axios from 'axios';

const CustomerOrdersList = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState('Orders');
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
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

  const fetchCustomerOrders = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/orders/customerorders`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setOrders(response.data);
    } catch (error) {
      console.error('Error fetching customer orders:', error);
      alert('Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchCustomerOrders();
  }, [fetchCurrentUser, fetchCustomerOrders]);

  const handleCreateOrder = () => {
    window.location.href = '/customer/create-order';
  };

  // Filter orders
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesSearch = !searchTerm.trim() ||
        (order.product?.productName?.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesStatus = statusFilter === 'all' ||
        (order.status?.toLowerCase() === statusFilter.toLowerCase());
      return matchesSearch && matchesStatus;
    });
  }, [orders, searchTerm, statusFilter]);

  const clearSearch = () => {
    setSearchTerm('');
  };

  // Helper to get assignment status display text
  const getAssignmentStatusDisplay = (order) => {
    if (!order.assignedTo) return 'Not Assigned';
    if (order.assignmentStatus === 'accepted') return 'Accepted';
    if (order.assignmentStatus === 'rejected') return 'Rejected';
    if (order.assignmentStatus === 'assigned') return 'Assigned';
    return 'Pending';
  };

  if (!user) {
    return <div className="customer-orders-loading">Loading...</div>;
  }

  return (
    <div className="customer-orders-layout">
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
      <main className={`customer-orders-main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="customer-orders-container-wrapper">
          <div className="customer-orders-container">
            <div className="customer-orders-header-section">
              <h2 className="customer-orders-page-title">My Orders</h2>
              <div className="customer-orders-controls-group">
                {/* Status Filter */}
                <div className="customer-orders-filter-group">
                  <label htmlFor="statusFilter" className="customer-orders-filter-label">
                    Filter by Status:
                  </label>
                  <select
                    id="statusFilter"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="customer-orders-status-filter"
                  >
                    <option value="all">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="delivered">Delivered</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                {/* Search */}
                <div className="customer-orders-search-container">
                  <input
                    type="text"
                    className="customer-orders-search-input"
                    placeholder="Search by product name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    aria-label="Search orders by product name"
                  />
                  {searchTerm && (
                    <button
                      className="customer-orders-search-clear"
                      onClick={clearSearch}
                      aria-label="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>
                {/* Create Button */}
                <button
                  className="customer-orders-create-button"
                  onClick={handleCreateOrder}
                >
                  Create Order
                </button>
              </div>
            </div>
            {loading ? (
              <div className="customer-orders-loading">Loading orders...</div>
            ) : filteredOrders.length === 0 ? (
              <div className="customer-orders-no-data">
                No orders found
                {statusFilter !== 'all' ? ` with status "${statusFilter}"` : ''}
                {searchTerm.trim() ? ` matching "${searchTerm}"` : ''}
              </div>
            ) : (
              <div className="customer-orders-table-wrapper">
                <table className="customer-orders-data-table">
                  <thead>
                    <tr>
                      <th scope="col">No</th>
                      <th scope="col">Product</th>
                      <th scope="col">Unit</th>
                      <th scope="col">Ordered Qty</th>
                      <th scope="col">Delivered Qty</th>
                      <th scope="col">Price</th>
                      <th scope="col">Total Amount</th>
                      <th scope="col">Remarks</th>
                      <th scope="col">Payment</th>
                      <th scope="col">Status</th>
                      <th scope="col">Delivery Partner</th>
                      <th scope="col">Assignment Status</th> {/* NEW COLUMN */}
                      <th scope="col">Order Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order, index) => (
                      <tr key={order._id}>
                        <td>{index + 1}</td>
                        <td>{order.product?.productName || 'N/A'}</td>
                        <td>{order.unit || '-'}</td>
                        <td>{order.orderedQuantity}</td>
                        <td>{order.deliveredQuantity || 0}</td>
                        <td>AED{order.price?.toFixed(2) || '0.00'}</td>
                        <td>AED{order.totalAmount?.toFixed(2) || '0.00'}</td>
                        <td>{order.remarks || '-'}</td>
                        <td>{order.payment?.charAt(0).toUpperCase() + order.payment?.slice(1) || 'N/A'}</td>
                        <td>
                          <span className={`customer-orders-status-badge customer-orders-status-${order.status?.toLowerCase() || 'pending'}`}>
                            {order.status?.charAt(0).toUpperCase() + order.status?.slice(1) || 'Pending'}
                          </span>
                        </td>
                        <td>
                          {order.assignedTo?.username || 'Not Assigned'}
                        </td>
                        <td>
                          <span className={`customer-orders-assignment-badge customer-orders-assignment-${order.assignmentStatus?.toLowerCase() || 'pending'}`}>
                            {getAssignmentStatusDisplay(order)}
                          </span>
                        </td>
                        <td>{new Date(order.orderDate).toLocaleDateString()}</td>
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

export default CustomerOrdersList;