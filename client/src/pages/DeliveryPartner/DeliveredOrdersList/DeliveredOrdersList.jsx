// src/pages/Delivery/DeliveredOrdersList.jsx
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

  // Units that allow decimals (fractional)
  const fractionalUnits = ['kg', 'gram', 'liter', 'ml', 'meter', 'cm', 'inch'];

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

  const fetchAllAcceptedOrders = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/orders/my-assigned-orders`, {
        headers: { Authorization: `Bearer ${token}` }
      });
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

  const handleDeliverOrder = async (orderId, orderedQuantity, deliveredQuantity, unit) => {
    const remaining = orderedQuantity - deliveredQuantity;
    
    // Check if unit allows decimals
    const allowDecimal = fractionalUnits.includes(unit?.toLowerCase());
    
    const promptMessage = allowDecimal
      ? `Enter quantity to deliver (Max: ${remaining.toFixed(2)} ${unit}):`
      : `Enter quantity to deliver (Max: ${Math.floor(remaining)} ${unit}):`;

    const quantityStr = prompt(promptMessage);
    
    if (!quantityStr) return; // User canceled

    const quantity = parseFloat(quantityStr);
    
    if (isNaN(quantity) || quantity <= 0 || quantity > remaining) {
      alert(`Please enter a valid quantity (max ${remaining.toFixed(allowDecimal ? 2 : 0)} ${unit}).`);
      return;
    }

    // For non-decimal units, enforce whole numbers
    if (!allowDecimal && !Number.isInteger(quantity)) {
      alert(`For ${unit} units, only whole numbers are allowed.`);
      return;
    }

    setDeliveringOrderId(orderId);
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${backendUrl}/api/orders/deliverorder/${orderId}`,
        { quantity },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchAllAcceptedOrders();
    } catch (error) {
      console.error('Error delivering order:', error);
      alert('Failed to deliver order. Please try again.');
    } finally {
      setDeliveringOrderId(null);
    }
  };

  const getDeliveryStatus = (order) => {
    if (order.deliveredQuantity === 0) return 'Not Delivered';
    if (order.deliveredQuantity < order.orderedQuantity) return 'Partially Delivered';
    return 'Fully Delivered';
  };

  if (!user) {
    return <div className="delivered-orders-loading">Loading...</div>;
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
      <main className={`delivered-orders-main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="delivered-orders-container-wrapper">
          <div className="delivered-orders-container">
            <h2 className="delivered-orders-page-title">Deliver Orders</h2>
            
            {loading ? (
              <div className="delivered-orders-loading">Loading orders...</div>
            ) : (
              <div className="delivered-orders-table-wrapper">
                <table className="delivered-orders-data-table">
                  <thead>
                    <tr>
                      <th scope="col">No</th>
                      <th scope="col">Customer</th>
                      <th scope="col">Product</th>
                      <th scope="col">Ordered Qty (in unit)</th>
                      <th scope="col">Delivered Qty (in unit)</th>
                      <th scope="col">Remaining Qty (in unit)</th>
                      <th scope="col">Delivery Status</th>
                      <th scope="col">Price</th>
                      <th scope="col">Total Amount</th>
                      <th scope="col">Remarks</th>
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
                          <td>{order.orderedQuantity} {order.unit || ''}</td>
                          <td>{order.deliveredQuantity} {order.unit || ''}</td>
                          <td>{(order.orderedQuantity - order.deliveredQuantity).toFixed(2)} {order.unit || ''}</td>
                          <td>
                            <span className={`delivered-orders-status-badge delivered-orders-status-${getDeliveryStatus(order).toLowerCase().replace(' ', '-')}`}>
                              {getDeliveryStatus(order)}
                            </span>
                          </td>
                          <td>AED{order.price.toFixed(2)}</td>
                          <td>AED{order.totalAmount.toFixed(2)}</td>
                          <td>{order.remarks || '-'}</td>
                          <td>{new Date(order.orderDate).toLocaleDateString()}</td>
                          <td>
                            {order.deliveredQuantity < order.orderedQuantity ? (
                              <button
                                className="delivered-orders-deliver-button"
                                onClick={() => handleDeliverOrder(
                                  order._id, 
                                  order.orderedQuantity, 
                                  order.deliveredQuantity,
                                  order.unit  // Pass unit for validation
                                )}
                                disabled={deliveringOrderId === order._id}
                              >
                                {deliveringOrderId === order._id ? 'Delivering...' : 'Deliver'}
                              </button>
                            ) : (
                              <span className="delivered-orders-delivered-text">Completed</span>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="12" className="delivered-orders-no-data">
                          No accepted orders found
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

export default DeliveredOrdersList;