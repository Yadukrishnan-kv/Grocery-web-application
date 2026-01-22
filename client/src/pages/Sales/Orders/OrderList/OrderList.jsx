// src/pages/Order/OrderList.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Header from '../../../../components/layout/Header/Header';
import Sidebar from '../../../../components/layout/Sidebar/Sidebar';
import './OrderList.css';
import axios from 'axios';

const OrderList = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState('Orders');
  const [user, setUser] = useState(null);
  const [deliveryPartners, setDeliveryPartners] = useState([]);

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

  const fetchOrders = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/orders/getallorders`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setOrders(response.data);
    } catch (error) {
      console.error('Error fetching orders:', error);
      alert('Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  const fetchDeliveryPartners = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/users/getAllUsers`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const partners = response.data.filter(user => user.role === "Delivery Man");
      setDeliveryPartners(partners);
    } catch (error) {
      console.error('Error fetching delivery partners:', error);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchOrders();
    fetchDeliveryPartners();
  }, [fetchCurrentUser, fetchOrders, fetchDeliveryPartners]);

  const handleDelete = async (id, orderId) => {
    if (window.confirm(`Are you sure you want to delete order "${orderId}"?`)) {
      try {
        const token = localStorage.getItem('token');
        await axios.delete(`${backendUrl}/api/orders/deleteorder/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        fetchOrders();
      } catch (error) {
        console.error('Error deleting order:', error);
        alert('Failed to delete order. Please try again.');
      }
    }
  };

  const handleAssignDeliveryPartner = async (orderId, deliveryManId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${backendUrl}/api/orders/assign/${orderId}`,
        { deliveryManId },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      fetchOrders();
    } catch (error) {
      console.error('Error assigning delivery partner:', error);
      alert('Failed to assign delivery partner. Please try again.');
    }
  };

  if (!user) {
    return <div className="order-list-loading">Loading...</div>;
  }

  return (
    <div className="order-list-layout">
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
      <main className={`order-list-main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="order-list-container-wrapper">
          <div className="order-list-container">
            <div className="order-list-header-section">
              <h2 className="order-list-page-title">Order Management</h2>
              <Link to="/order/create" className="order-list-create-button">
                Create Order
              </Link>
            </div>
            
            {loading ? (
              <div className="order-list-loading">Loading orders...</div>
            ) : (
              <div className="order-list-table-wrapper">
                <table className="order-list-data-table">
                  <thead>
                    <tr>
                      <th scope="col">No</th>
                      <th scope="col">Customer</th>
                      <th scope="col">Product</th>
                      <th scope="col">Ordered Qty</th>
                      <th scope="col">Delivered Qty</th>
                      <th scope="col">Price</th>
                      <th scope="col">Total Amount</th>
                      <th scope="col">Status</th>
                      <th scope="col">Payment</th>
                      <th scope="col">Order Date</th>
                      <th scope="col">Delivery Partner</th>
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
                          <td>${order.price.toFixed(2)}</td>
                          <td>${order.totalAmount.toFixed(2)}</td>
                          <td>
                            <span className={`order-list-status-badge order-list-status-${order.status?.toLowerCase() || 'pending'}`}>
                              {order.status || 'Pending'}
                            </span>
                          </td>
                          <td>{order.payment}</td>
                          <td>{new Date(order.orderDate).toLocaleDateString()}</td>
                          <td>
                            {order.assignmentStatus === "pending_assignment" ? (
                              <select
                                className="order-list-delivery-partner-select"
                                onChange={(e) => {
                                  const selectedId = e.target.value;
                                  if (selectedId) {
                                    handleAssignDeliveryPartner(order._id, selectedId);
                                  }
                                }}
                                defaultValue=""
                              >
                                <option value="">Assign Delivery Partner</option>
                                {deliveryPartners.map(partner => (
                                  <option key={partner._id} value={partner._id}>
                                    {partner.username}
                                  </option>
                                ))}
                              </select>
                            ) : order.assignedTo ? (
                              <span className="order-list-assigned-partner">
                                {order.assignedTo.username || 'Assigned'}
                              </span>
                            ) : (
                              <span className="order-list-not-assigned">Not Assigned</span>
                            )}
                          </td>
                          <td>
                            <div className="order-list-action-buttons">
                              <Link
                                to={`/order/create?edit=${order._id}`}
                                className="order-list-icon-button order-list-edit-button"
                                aria-label={`Edit order ${order._id}`}
                              >
                                ✎
                              </Link>
                              <button
                                className="order-list-icon-button order-list-delete-button"
                                onClick={() => handleDelete(order._id, order._id)}
                                aria-label={`Delete order ${order._id}`}
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="12" className="order-list-no-data">
                          No orders found
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

export default OrderList;