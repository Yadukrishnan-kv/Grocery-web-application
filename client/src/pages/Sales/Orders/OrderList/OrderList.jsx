// src/pages/Order/OrderList.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import Header from "../../../../components/layout/Header/Header";
import Sidebar from "../../../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../../../Assets/aed-symbol.png";
import "./OrderList.css";
import axios from "axios";
import toast from 'react-hot-toast';

const OrderList = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeItem, setActiveItem] = useState("Orders");
  const [user, setUser] = useState(null);
  const [deliveryPartners, setDeliveryPartners] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState(null);

  const backendUrl = process.env.REACT_APP_BACKEND_IP;

  const fetchCurrentUser = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        window.location.href = "/login";
        return;
      }
      const response = await axios.get(`${backendUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(response.data.user || response.data);
    } catch (error) {
      console.error("Failed to load user", error);
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
  }, [backendUrl]);

  const fetchOrders = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      let endpoint;
      
      // ✅ ROLE-BASED ENDPOINT SELECTION
      if (user?.role === "Sales man") {
        endpoint = `${backendUrl}/api/orders/salesman-orders`;
      } else {
        // Admin or other roles see all orders
        endpoint = `${backendUrl}/api/orders/getallorders`;
      }
      
      const response = await axios.get(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setOrders(response.data);
    } catch (error) {
      console.error("Error fetching orders:", error);
      toast.error("Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [backendUrl, user]);

  const fetchDeliveryPartners = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${backendUrl}/api/users/getAllUsers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const partners = response.data.filter(
        (user) => user.role === "Delivery Man"
      );
      setDeliveryPartners(partners);
    } catch (error) {
      console.error("Error fetching delivery partners:", error);
    }
  }, [backendUrl]);

  // ==================== FIXED INFINITE LOOP ====================
  // 1. Fetch user + delivery partners (independent of orders)
  // 2. Only fetch orders AFTER user is loaded → no circular dependency
  useEffect(() => {
    fetchCurrentUser();
    fetchDeliveryPartners();
  }, [fetchCurrentUser, fetchDeliveryPartners]);

  useEffect(() => {
    if (user) {
      fetchOrders();
    }
  }, [user, fetchOrders]);
  // ============================================================

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch =
        !searchTerm.trim() ||
        (order.customer?.name &&
          order.customer.name.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesStatus =
        statusFilter === "all" ||
        (order.status &&
          order.status.toLowerCase() === statusFilter.toLowerCase());
      return matchesSearch && matchesStatus;
    });
  }, [orders, searchTerm, statusFilter]);

  const handleDeleteClick = (id, orderId) => {
    setOrderToDelete({ id, orderId });
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!orderToDelete) return;

    setShowDeleteModal(false);

    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${backendUrl}/api/orders/deleteorder/${orderToDelete.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      toast.success(`Order deleted successfully!`);
      fetchOrders();
    } catch (error) {
      console.error("Error deleting order:", error);
      toast.error("Failed to delete order. Please try again.");
    } finally {
      setOrderToDelete(null);
    }
  };

  const handleAssignDeliveryPartner = async (orderId, deliveryManId) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${backendUrl}/api/orders/assign/${orderId}`,
        { deliveryManId },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      toast.success("Delivery partner assigned successfully!");
      fetchOrders();
    } catch (error) {
      console.error("Error assigning delivery partner:", error);
      toast.error("Failed to assign delivery partner. Please try again.");
    }
  };

  const clearSearch = () => {
    setSearchTerm("");
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // ✅ Helper to calculate VAT breakdown for an order
  const getVatBreakdown = (order) => {
    if (!order.orderItems || !Array.isArray(order.orderItems)) {
      return { exclVat: 0, vatAmount: 0, grandTotal: 0 };
    }
    const exclVat = order.orderItems.reduce((sum, item) => sum + (item.exclVatAmount || 0), 0);
    const vatAmount = order.orderItems.reduce((sum, item) => sum + (item.vatAmount || 0), 0);
    const grandTotal = order.orderItems.reduce((sum, item) => sum + (item.totalAmount || 0), 0);
    return { exclVat, vatAmount, grandTotal };
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
      <main
        className={`order-list-main-content ${sidebarOpen ? "sidebar-open" : ""}`}
      >
        <div className="order-list-container-wrapper">
          <div className="order-list-container">
            <div className="order-list-header-section">
              <h2 className="order-list-page-title">Order Management</h2>

              <div className="order-list-controls-group">
                <label
                  htmlFor="statusFilter"
                  className="order-list-filter-label"
                >
                  Filter by Order Status:
                </label>
                <select
                  id="statusFilter"
                  className="order-list-status-filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  aria-label="Filter orders by status"
                >
                  <option value="all">All</option>
                  <option value="pending">Pending</option>
                  <option value="partial_delivered">Partial Delivered</option>
                  <option value="delivered">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                </select>

                <div className="order-list-search-container">
                  <input
                    type="text"
                    className="order-list-search-input"
                    placeholder="Search by customer..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    aria-label="Search orders by customer name"
                  />
                  {searchTerm && (
                    <button
                      className="order-list-search-clear"
                      onClick={clearSearch}
                      aria-label="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>

                <Link to="/order/create" className="order-list-create-button">
                  Create Order
                </Link>
              </div>
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
                      <th scope="col">Products</th>
                      <th scope="col">Total Qty</th>
                      {/* ✅ UPDATED: VAT Breakdown Columns */}
                      <th scope="col" className="vat-col">Total Dhs<br/><small>(Excl. VAT)</small></th>
                      <th scope="col" className="vat-col">VAT 5%<br/><small>(Amount)</small></th>
                      <th scope="col" className="vat-col grand-total-col">Grand Total<br/><small>(Incl. VAT)</small></th>
                      <th scope="col">Payment</th>
                      <th scope="col">Remarks</th>
                      <th scope="col">Delivery Partner</th>
                      <th scope="col">Assignment Status</th>
                      <th scope="col">Status</th>
                      <th scope="col">Order Date</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.length > 0 ? (
                      filteredOrders.map((order, index) => {
                        const { exclVat, vatAmount, grandTotal } = getVatBreakdown(order);
                        return (
                          <tr key={order._id}>
                            <td>{index + 1}</td>
                            <td>{order.customer?.name || "N/A"}</td>

                            <td className="products-cell">
                              {order.orderItems?.length > 0 ? (
                                <div className="products-list">
                                  {order.orderItems.map((item, i) => (
                                    <div key={i} className="product-tag">
                                      <span className="product-name">{item.product?.productName || "Unknown"}</span>
                                      <span className="product-qty">× {item.orderedQuantity}</span>
                                      <span className="product-unit">{item.unit || ""}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="no-products">No products</span>
                              )}
                            </td>

                            <td>{order.totalOrderedQuantity || order.orderItems?.reduce((sum, it) => sum + it.orderedQuantity, 0) || 0}</td>

                            {/* ✅ UPDATED: VAT Breakdown Display */}
                            <td className="vat-cell">
                              <div className="vat-amount">
                                <img src={DirhamSymbol} alt="AED" width={12} />
                                <span>{exclVat.toFixed(2)}</span>
                              </div>
                            </td>
                            <td className="vat-cell">
                              <div className="vat-amount vat-highlight">
                                <img src={DirhamSymbol} alt="AED" width={12} />
                                <span>{vatAmount.toFixed(2)}</span>
                              </div>
                            </td>
                            <td className="vat-cell grand-total-cell">
                              <div className="vat-amount grand-total-amount">
                                <img src={DirhamSymbol} alt="AED" width={14} />
                                <span>{grandTotal.toFixed(2)}</span>
                              </div>
                            </td>

                            <td>{order.payment || "N/A"}</td>
                            <td title={order.remarks || ""}>
                              {order.remarks
                                ? order.remarks.substring(0, 30) +
                                  (order.remarks.length > 30 ? "..." : "")
                                : "-"}
                            </td>

                            <td>
                              {order.assignmentStatus === "pending_assignment" ||
                              order.assignmentStatus === "rejected" ? (
                                <select
                                  className="order-list-delivery-partner-select"
                                  onChange={(e) => {
                                    const selectedId = e.target.value;
                                    if (selectedId) {
                                      handleAssignDeliveryPartner(
                                        order._id,
                                        selectedId
                                      );
                                    }
                                  }}
                                  defaultValue=""
                                >
                                  <option value="">
                                    {order.assignmentStatus === "rejected"
                                      ? "Reassign Partner"
                                      : "Assign Delivery Partner"}
                                  </option>
                                  {deliveryPartners.map((partner) => (
                                    <option key={partner._id} value={partner._id}>
                                      {partner.username}
                                    </option>
                                  ))}
                                </select>
                              ) : order.assignedTo ? (
                                <span className="order-list-assigned-partner">
                                  {order.assignedTo.username || "Assigned"}
                                </span>
                              ) : (
                                <span className="order-list-not-assigned">
                                  Not Assigned
                                </span>
                              )}
                            </td>
                            <td>
                              <span
                                className={`order-list-assignment-badge order-list-assignment-${order.assignmentStatus?.toLowerCase() || "pending"}`}
                              >
                                {order.assignmentStatus === "accepted"
                                  ? "Accepted"
                                  : order.assignmentStatus === "rejected"
                                  ? "Rejected"
                                  : order.assignmentStatus === "assigned"
                                  ? "Assigned"
                                  : "Pending"}
                              </span>
                            </td>
                            <td>
                              <span
                                className={`order-list-status-badge order-list-status-${order.status?.toLowerCase() || "pending"}`}
                              >
                                {order.status?.charAt(0).toUpperCase() +
                                  order.status?.slice(1) || "Pending"}
                              </span>
                            </td>
                            <td>{formatDate(order.orderDate)}</td>
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
                                  onClick={() =>
                                    handleDeleteClick(order._id, order._id)
                                  }
                                  aria-label={`Delete order ${order._id}`}
                                >
                                  🗑️
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan="14" className="order-list-no-data">
                          {orders.length === 0
                            ? "No orders found"
                            : "No orders match your filters"}
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

      {showDeleteModal && orderToDelete && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal">
            <h3 className="confirm-title">Delete Order</h3>
            <p className="confirm-text">
              Are you sure you want to delete order 
              <strong> #{orderToDelete.orderId}</strong>?
            </p>
            <p className="confirm-warning">This action cannot be undone.</p>

            <div className="confirm-actions">
              <button 
                className="confirm-cancel"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </button>
              <button 
                className="confirm-delete"
                onClick={confirmDelete}
              >
                Delete Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderList;