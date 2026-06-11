// src/pages/Sales/Orders/OrderList/ManageOrders.jsx
import React, { useState, useEffect } from 'react';
import Header from '../../../../components/layout/Header/Header';
import Sidebar from '../../../../components/layout/Sidebar/Sidebar';
import DirhamSymbol from '../../../../Assets/aed-symbol.png';
import axios from 'axios';
import toast from 'react-hot-toast';
import './ManageOrders.css';

const ManageOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [activeItem, setActiveItem] = useState("Sales");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [deliveryMen, setDeliveryMen] = useState([]);
  const [selectedDeliveryMan, setSelectedDeliveryMan] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [assigningOrder, setAssigningOrder] = useState(null);
  
  const backendUrl = process.env.REACT_APP_BACKEND_IP;

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${backendUrl}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setUser(res.data.user || res.data);
      } catch (err) {
        console.error('Failed to fetch user', err);
      }
    };

    const fetchOrders = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${backendUrl}/api/orders/pending-assignment`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setOrders(res.data);
      } catch (err) {
        toast.error('Failed to load pending orders');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    const fetchDeliveryMen = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${backendUrl}/api/users/getdeliverymen`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setDeliveryMen(res.data);
      } catch (err) {
        console.error('Failed to load delivery men', err);
      }
    };

    fetchUser();
    fetchOrders();
    fetchDeliveryMen();
  }, [backendUrl]);

  const handleAssignClick = (order) => {
    setAssigningOrder(order);
    setSelectedDeliveryMan('');
    setIsModalOpen(true);
  };

  const handleAssignDeliveryMan = async () => {
    if (!selectedDeliveryMan) {
      toast.error('Please select a delivery man');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${backendUrl}/api/orders/assign/${assigningOrder._id}`,
        { deliveryManId: selectedDeliveryMan },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Order assigned to delivery man successfully!');
      setOrders((prev) => prev.filter((o) => o._id !== assigningOrder._id));
      setIsModalOpen(false);
      setSelectedDeliveryMan('');
      setAssigningOrder(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to assign order');
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedDeliveryMan('');
    setAssigningOrder(null);
  };

  const getTotalAmount = (orderItems) => {
    return orderItems.reduce((sum, item) => sum + (item.totalAmount || 0), 0).toFixed(2);
  };

  if (loading) {
    return <div className="manage-orders-loading">Loading pending orders...</div>;
  }

  return (
    <div className="manage-orders-layout">
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
      <main className={`manage-orders-main ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="manage-orders-container">
          <h1>📦 Manage Orders - Assign Delivery Man</h1>
          <p className="subtitle">View all pending orders and assign delivery partners</p>
          
          {orders.length === 0 ? (
            <div className="no-orders">
              <p>No pending orders to assign</p>
            </div>
          ) : (
            <div className="orders-table-container">
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Customer</th>
                    <th>Items</th>
                    <th>Total Amount</th>
                    <th>Payment</th>
                    <th>Created By</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order._id}>
                      <td>{order.orderId}</td>
                      <td>{order.customer?.name}</td>
                      <td>{order.orderItems?.length}</td>
                      <td>
                        <img src={DirhamSymbol} alt="AED" className="currency-icon" />
                        {getTotalAmount(order.orderItems)}
                      </td>
                      <td>{order.payment}</td>
                      <td>{order.createdBy?.username}</td>
                      <td>
                        <button
                          className="btn-assign"
                          onClick={() => handleAssignClick(order)}
                        >
                          Assign Delivery
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal for assigning delivery man */}
        {isModalOpen && (
          <div className="modal-overlay" onClick={closeModal}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Assign Delivery Man</h2>
                <button className="modal-close" onClick={closeModal}>✕</button>
              </div>
              
              <div className="modal-body">
                <div className="order-summary">
                  <h3>Order Details</h3>
                  <p><strong>Order ID:</strong> {assigningOrder?.orderId}</p>
                  <p><strong>Customer:</strong> {assigningOrder?.customer?.name}</p>
                  <p><strong>Total Amount:</strong> <img src={DirhamSymbol} alt="AED" className="currency-icon" /> {getTotalAmount(assigningOrder?.orderItems)}</p>
                </div>

                <div className="form-group">
                  <label htmlFor="deliveryMan">Select Delivery Man</label>
                  <select
                    id="deliveryMan"
                    value={selectedDeliveryMan}
                    onChange={(e) => setSelectedDeliveryMan(e.target.value)}
                    className="delivery-man-select"
                  >
                    <option value="">-- Choose a Delivery Man --</option>
                    {deliveryMen.map((dm) => (
                      <option key={dm._id} value={dm._id}>
                        {dm.username}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="modal-footer">
                <button className="btn-cancel" onClick={closeModal}>
                  Cancel
                </button>
                <button className="btn-submit" onClick={handleAssignDeliveryMan}>
                  Assign
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default ManageOrders;
