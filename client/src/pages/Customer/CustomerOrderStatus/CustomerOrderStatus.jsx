// src/pages/Customer/Orders/CustomerOrderStatus.jsx
import React, { useState, useEffect, useCallback } from 'react';
import Header from '../../../components/layout/Header/Header';
import Sidebar from '../../../components/layout/Sidebar/Sidebar';
import './CustomerOrderStatus.css';
import axios from 'axios';
import { useParams } from 'react-router-dom';

const CustomerOrderStatus = () => {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState('Orders');
  const [user, setUser] = useState(null);

  const { id } = useParams();
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

  const fetchOrderDetails = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/orders/customer-order/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setOrder(response.data);
    } catch (error) {
      console.error('Error fetching order details:', error);
      alert('Failed to load order details');
      window.location.href = '/customer/orders';
    } finally {
      setLoading(false);
    }
  }, [backendUrl, id]);

  useEffect(() => {
    fetchCurrentUser();
    fetchOrderDetails();
  }, [fetchCurrentUser, fetchOrderDetails]);

  if (loading || !user) {
    return <div className="loading">Loading...</div>;
  }

  if (!order) {
    return <div className="error">Order not found</div>;
  }

  return (
    <div className="customer-order-status-layout">
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
        <div className="order-details-container">
          <h2>Order Status</h2>
          
          <div className="order-info">
            <div className="info-row">
              <span className="label">Order ID:</span>
              <span className="value">{order._id}</span>
            </div>
            <div className="info-row">
              <span className="label">Product:</span>
              <span className="value">{order.product?.productName || 'N/A'}</span>
            </div>
            <div className="info-row">
              <span className="label">Ordered Quantity:</span>
              <span className="value">{order.orderedQuantity}</span>
            </div>
            <div className="info-row">
              <span className="label">Delivered Quantity:</span>
              <span className="value">{order.deliveredQuantity}</span>
            </div>
            <div className="info-row">
              <span className="label">Price:</span>
              <span className="value">${order.price.toFixed(2)}</span>
            </div>
            <div className="info-row">
              <span className="label">Total Amount:</span>
              <span className="value">${order.totalAmount.toFixed(2)}</span>
            </div>
            <div className="info-row">
              <span className="label">Payment Method:</span>
              <span className="value">{order.payment}</span>
            </div>
            <div className="info-row">
              <span className="label">Order Date:</span>
              <span className="value">{new Date(order.orderDate).toLocaleDateString()}</span>
            </div>
            <div className="info-row">
              <span className="label">Order Status:</span>
              <span className={`status-value status-${order.status}`}>
                {order.status}
              </span>
            </div>
            <div className="info-row">
              <span className="label">Assignment Status:</span>
              <span className={`assignment-status assignment-${order.assignmentStatus}`}>
                {order.assignmentStatus}
              </span>
            </div>
            {order.assignedTo && (
              <div className="info-row">
                <span className="label">Assigned To:</span>
                <span className="value">{order.assignedTo.username}</span>
              </div>
            )}
            {order.assignedAt && (
              <div className="info-row">
                <span className="label">Assigned At:</span>
                <span className="value">{new Date(order.assignedAt).toLocaleDateString()}</span>
              </div>
            )}
            {order.acceptedAt && (
              <div className="info-row">
                <span className="label">Accepted At:</span>
                <span className="value">{new Date(order.acceptedAt).toLocaleDateString()}</span>
              </div>
            )}
          </div>

          <div className="action-buttons">
            <button 
              className="back-button"
              onClick={() => window.history.back()}
            >
              Back to Orders
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default CustomerOrderStatus;