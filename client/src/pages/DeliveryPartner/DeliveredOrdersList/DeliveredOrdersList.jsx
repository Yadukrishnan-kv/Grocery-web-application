// DeliveredOrdersList.jsx
import React, { useState, useEffect, useCallback } from 'react';
import Header from '../../../components/layout/Header/Header';
import Sidebar from '../../../components/layout/Sidebar/Sidebar';
import './DeliveredOrdersList.css';
import axios from 'axios';

const DeliveredOrdersList = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState('Delivered Orders');
  const [user, setUser] = useState(null);
  const [deliveringOrderId, setDeliveringOrderId] = useState(null);

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

  // Fetch ALL accepted orders (both partially and fully delivered)
  const fetchAllAcceptedOrders = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/orders/my-assigned-orders`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Filter only accepted orders (regardless of delivery status)
      const acceptedOrders = response.data.filter(order => 
        order.assignmentStatus === "accepted"
      );
      setOrders(acceptedOrders);
    } catch (error) {
      console.error('Error fetching accepted orders:', error);
      alert('Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchAllAcceptedOrders();
  }, [fetchCurrentUser, fetchAllAcceptedOrders]);

  const handleDeliverOrder = async (orderId, orderedQuantity, deliveredQuantity) => {
    const remaining = orderedQuantity - deliveredQuantity;
    const quantity = prompt(`Enter quantity to deliver (Max: ${remaining}):`);
    
    if (quantity && !isNaN(quantity) && parseInt(quantity) > 0 && parseInt(quantity) <= remaining) {
      setDeliveringOrderId(orderId);
      try {
        const token = localStorage.getItem('token');
        await axios.post(
          `${backendUrl}/api/orders/deliverorder/${orderId}`,
          { quantity: parseInt(quantity) },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        // Refresh the entire list to show updated delivery status
        fetchAllAcceptedOrders();
      } catch (error) {
        console.error('Error delivering order:', error);
        alert('Failed to deliver order. Please try again.');
      } finally {
        setDeliveringOrderId(null);
      }
    } else {
      alert('Please enter a valid quantity.');
    }
  };

  // Helper function to get delivery status
  const getDeliveryStatus = (order) => {
    if (order.deliveredQuantity === 0) {
      return 'Not Delivered';
    } else if (order.deliveredQuantity < order.orderedQuantity) {
      return 'Partially Delivered';
    } else {
      return 'Fully Delivered';
    }
  };

  if (!user) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="delivered-orders-layout">
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
          <h2>Deliver Orders</h2>
          
          {loading ? (
            <div className="loading">Loading orders...</div>
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
                    <th scope="col">Remaining Qty</th>
                    <th scope="col">Delivery Status</th>
                    <th scope="col">Price</th>
                    <th scope="col">Total Amount</th>
                    <th scope="col">Order Date</th>
                    <th scope="col">Actions</th>
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
                        <td>{order.deliveredQuantity}</td>
                        <td>{order.orderedQuantity - order.deliveredQuantity}</td>
                        <td>
                          <span className={`status-badge status-${getDeliveryStatus(order).replace(' ', '-').toLowerCase()}`}>
                            {getDeliveryStatus(order)}
                          </span>
                        </td>
                        <td>${order.price.toFixed(2)}</td>
                        <td>${order.totalAmount.toFixed(2)}</td>
                        <td>{new Date(order.orderDate).toLocaleDateString()}</td>
                        <td>
                          {order.deliveredQuantity < order.orderedQuantity ? (
                            <button
                              className="deliver-button"
                              onClick={() => handleDeliverOrder(order._id, order.orderedQuantity, order.deliveredQuantity)}
                              disabled={deliveringOrderId === order._id}
                            >
                              {deliveringOrderId === order._id ? 'Delivering...' : 'Deliver'}
                            </button>
                          ) : (
                            <span className="delivered-text">Completed</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="11" className="no-data">
                        No accepted orders found
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

export default DeliveredOrdersList;