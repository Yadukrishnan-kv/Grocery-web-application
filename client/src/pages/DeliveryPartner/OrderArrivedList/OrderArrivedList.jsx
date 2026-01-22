// src/pages/Delivery/OrderArrivedList.jsx
import React, { useState, useEffect, useCallback } from 'react';
import Header from '../../../components/layout/Header/Header';
import Sidebar from '../../../components/layout/Sidebar/Sidebar';
import './OrderArrivedList.css';
import axios from 'axios';

const OrderArrivedList = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState('Order arrived');
  const [user, setUser] = useState(null);
  const [acceptingOrderId, setAcceptingOrderId] = useState(null);

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
      
      if (error.response?.status === 401) {
        localStorage.removeItem('token');
        alert('Your session has expired. Please login again.');
        window.location.href = '/login';
      } else {
        alert('Failed to load user information.');
        window.location.href = '/login';
      }
    }
  }, [backendUrl]);

  const fetchAssignedOrders = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No token found');
      }
      
      const response = await axios.get(`${backendUrl}/api/orders/my-assigned-orders`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const assignedOrders = response.data.filter(order => order.assignmentStatus === "assigned");
      setOrders(assignedOrders);
    } catch (error) {
      console.error('Error fetching assigned orders:', error);
      
      if (error.response?.status === 401) {
        localStorage.removeItem('token');
        alert('Your session has expired. Please login again.');
        window.location.href = '/login';
      } else if (error.response?.status === 403) {
        alert('You do not have permission to view assigned orders.');
        setOrders([]);
      } else {
        alert('Failed to load orders. Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchAssignedOrders();
  }, [fetchCurrentUser, fetchAssignedOrders]);

  const handleAcceptOrder = async (orderId) => {
    if (!window.confirm('Are you sure you want to accept this order?')) return;
    
    setAcceptingOrderId(orderId);
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${backendUrl}/api/orders/accept/${orderId}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchAssignedOrders();
    } catch (error) {
      console.error('Error accepting order:', error);
      alert('Failed to accept order. Please try again.');
    } finally {
      setAcceptingOrderId(null);
    }
  };

  if (!user) {
    return <div className="order-arrived-loading">Loading...</div>;
  }

  return (
    <div className="order-arrived-layout">
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
      <main className={`order-arrived-main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="order-arrived-container-wrapper">
          <div className="order-arrived-container">
            <h2 className="order-arrived-page-title">Order Arrived</h2>
            
            {loading ? (
              <div className="order-arrived-loading">Loading orders...</div>
            ) : (
              <div className="order-arrived-table-wrapper">
                <table className="order-arrived-data-table">
                  <thead>
                    <tr>
                      <th scope="col">No</th>
                      <th scope="col">Customer</th>
                      <th scope="col">Product</th>
                      <th scope="col">Ordered Qty</th>
                      <th scope="col">Price</th>
                      <th scope="col">Total Amount</th>
                      <th scope="col">Order Date</th>
                      <th scope="col">Accept Order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.length > 0 ? (
                      orders.map((order, index) => (
                        <tr key={order._id}>
                          <td>{index + 1}</td>
                          <td>{order.customer?.name || 'N/A'}</td>
                          <td>{order.product?.productName || 'N/A'}</td>
                          <td>{order.orderedQuantity}</td>
                          <td>${order.price.toFixed(2)}</td>
                          <td>${order.totalAmount.toFixed(2)}</td>
                          <td>{new Date(order.orderDate).toLocaleDateString()}</td>
                          <td>
                            <button
                              className="order-arrived-accept-button"
                              onClick={() => handleAcceptOrder(order._id)}
                              disabled={acceptingOrderId === order._id}
                            >
                              {acceptingOrderId === order._id ? 'Accepting...' : 'Accept'}
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="8" className="order-arrived-no-data">
                          No assigned orders found
                        </td>
                      </tr>
                    )}
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

export default OrderArrivedList;