// src/pages/Customer/Orders/CustomerOrdersList.jsx
import React, { useState, useEffect, useCallback } from 'react';
import Header from '../../../components/layout/Header/Header';
import Sidebar from '../../../components/layout/Sidebar/Sidebar';
import './CustomerOrdersList.css';
import axios from 'axios';
// REMOVE useParams - not needed for list page
// import { useParams } from 'react-router-dom';

const CustomerOrdersList = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState('Orders');
  const [user, setUser] = useState(null);
  
  // REMOVE this line - no ID needed for list page
  // const { id } = useParams();

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

  // FIX: Fetch all customer orders (no ID needed)
  const fetchCustomerOrders = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      // Use the correct endpoint for customer orders list
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

  if (!user) {
    return <div className="loading">Loading...</div>;
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
      <main className={`main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="table-container">
          <div className="table-header">
            <h2>My Orders</h2>
            <button 
              className="create-button"
              onClick={handleCreateOrder}
            >
              Create Order
            </button>
          </div>
          
          {loading ? (
            <div className="loading">Loading orders...</div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">No</th>
                    <th scope="col">Product</th>
                    <th scope="col">Ordered Qty</th>
                    <th scope="col">Delivered Qty</th>
                    <th scope="col">Price</th>
                    <th scope="col">Total Amount</th>
                    <th scope="col">Status</th>
                    <th scope="col">Order Date</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length > 0 ? (
                    orders.map((order, index) => (
                      <tr key={order._id}>
                        <td>{index + 1}</td>
                        <td>{order.product?.productName || 'N/A'}</td>
                        <td>{order.orderedQuantity}</td>
                        <td>{order.deliveredQuantity}</td>
                        <td>${order.price.toFixed(2)}</td>
                        <td>${order.totalAmount.toFixed(2)}</td>
                        <td>
                          <span className={`status-badge status-${order.status}`}>
                            {order.status}
                          </span>
                        </td>
                        <td>{new Date(order.orderDate).toLocaleDateString()}</td>
                        
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="9" className="no-data">
                        No orders found
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

export default CustomerOrdersList;