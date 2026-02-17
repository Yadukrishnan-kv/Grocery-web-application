// src/pages/Delivery/OrderArrivedList.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../../Assets/aed-symbol.png";
import "./OrderArrivedList.css";
import axios from "axios";
import toast from 'react-hot-toast';

const OrderArrivedList = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState("Order arrived");
  const [user, setUser] = useState(null);
  const [acceptingOrderId, setAcceptingOrderId] = useState(null);
  const [rejectingOrderId, setRejectingOrderId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
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
      if (error.response?.status === 401) {
        localStorage.removeItem("token");
        toast.error("Your session has expired. Please login again.");
        window.location.href = "/login";
      } else {
        toast.error("Failed to load user information.");
        window.location.href = "/login";
      }
    }
  }, [backendUrl]);

  const fetchAssignedOrders = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No token found");

      const response = await axios.get(
        `${backendUrl}/api/orders/my-assigned-orders`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Only show orders that are assigned (not yet accepted/rejected)
      const assignedOrders = response.data.filter(
        (order) => order.assignmentStatus === "assigned"
      );
      setOrders(assignedOrders);
    } catch (error) {
      console.error("Error fetching assigned orders:", error);
      if (error.response?.status === 401) {
        localStorage.removeItem("token");
        toast.error("Your session has expired. Please login again.");
        window.location.href = "/login";
      } else if (error.response?.status === 403) {
        toast.error("You do not have permission to view assigned orders.");
        setOrders([]);
      } else {
        toast.error("Failed to load orders. Please try again later.");
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
    setAcceptingOrderId(orderId);
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${backendUrl}/api/orders/accept/${orderId}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success("Order accepted successfully");
      fetchAssignedOrders();
    } catch (error) {
      console.error("Error accepting order:", error);
      toast.error("Failed to accept order. Please try again.");
    } finally {
      setAcceptingOrderId(null);
    }
  };

  const handleRejectOrder = async (orderId) => {
    setRejectingOrderId(orderId);
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${backendUrl}/api/orders/reject/${orderId}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success("Order rejected successfully. It has been returned for reassignment.");
      fetchAssignedOrders();
    } catch (error) {
      console.error("Error rejecting order:", error);
      toast.error("Failed to reject order. Please try again.");
    } finally {
      setRejectingOrderId(null);
    }
  };

  const clearFilters = () => {
    setSearchTerm("");
    setFromDate("");
    setToDate("");
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch =
        !searchTerm.trim() ||
        order.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase());

      let matchesDate = true;
      if (fromDate || toDate) {
        const orderDate = new Date(order.orderDate);
        orderDate.setHours(0, 0, 0, 0);
        if (fromDate) {
          const start = new Date(fromDate);
          start.setHours(0, 0, 0, 0);
          if (orderDate < start) matchesDate = false;
        }
        if (toDate) {
          const end = new Date(toDate);
          end.setHours(23, 59, 59, 999);
          if (orderDate > end) matchesDate = false;
        }
      }
      return matchesSearch && matchesDate;
    });
  }, [orders, searchTerm, fromDate, toDate]);

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
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
      <main
        className={`order-arrived-main-content ${sidebarOpen ? "sidebar-open" : ""}`}
      >
        <div className="order-arrived-container-wrapper">
          <div className="order-arrived-container">
            <h2 className="order-arrived-page-title">Order Arrived</h2>

            <div className="order-arrived-controls-group">
              <div className="order-arrived-date-filter">
                <label htmlFor="fromDate" className="order-arrived-filter-label">
                  From Date:
                </label>
                <input
                  type="date"
                  id="fromDate"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="order-arrived-date-input"
                />
              </div>

              <div className="order-arrived-date-filter">
                <label htmlFor="toDate" className="order-arrived-filter-label">
                  To Date:
                </label>
                <input
                  type="date"
                  id="toDate"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="order-arrived-date-input"
                />
              </div>

              <div className="order-arrived-search-container">
                <input
                  type="text"
                  className="order-arrived-search-input"
                  placeholder="Search by customer name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  aria-label="Search orders by customer name"
                />
                {searchTerm && (
                  <button
                    className="order-arrived-search-clear"
                    onClick={() => setSearchTerm("")}
                    aria-label="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>

              {(searchTerm || fromDate || toDate) && (
                <button
                  className="order-arrived-clear-button"
                  onClick={clearFilters}
                >
                  Clear Filters
                </button>
              )}
            </div>

            {loading ? (
              <div className="order-arrived-loading">Loading orders...</div>
            ) : filteredOrders.length === 0 ? (
              <div className="order-arrived-no-data">
                No assigned orders found
                {searchTerm || fromDate || toDate ? " matching your filters" : ""}
              </div>
            ) : (
              <div className="order-arrived-table-wrapper">
                <table className="order-arrived-data-table">
                  <thead>
                    <tr>
                      <th scope="col">No</th>
                      <th scope="col">Customer</th>
                      <th scope="col">Products</th>           {/* Updated */}
                      <th scope="col">Total Qty</th>         {/* New */}
                      <th scope="col">Grand Total</th>       {/* Updated */}
                      <th scope="col">Remarks</th>
                      <th scope="col">Order Date</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order, index) => (
                      <tr key={order._id}>
                        <td>{index + 1}</td>
                        <td>{order.customer?.name || "N/A"}</td>

                        {/* Attractive multi-product display */}
                        <td className="products-cell">
                          {order.orderItems?.length > 0 ? (
                            <div className="products-list">
                              {order.orderItems.map((item, i) => (
                                <div key={i} className="product-tag">
                                  <span className="product-name">
                                    {item.product?.productName || "Unknown Product"}
                                  </span>
                                  <span className="product-qty">
                                    × {item.orderedQuantity}
                                  </span>
                                  <span className="product-unit">
                                    {item.unit || ""}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="no-products">No products</span>
                          )}
                        </td>

                        {/* Total ordered quantity */}
                        <td>
                          {order.totalOrderedQuantity ||
                            order.orderItems?.reduce((sum, it) => sum + it.orderedQuantity, 0) ||
                            0}
                        </td>

                        {/* Grand total with Dirham symbol */}
                        <td>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            <img
                              src={DirhamSymbol}
                              alt="AED"
                              width={20}
                              height={20}
                              style={{ paddingTop: "2px" }}
                            />
                            <span style={{ fontWeight: 500 }}>
                              {order.grandTotal?.toFixed(2) ||
                                order.orderItems
                                  ?.reduce((sum, it) => sum + it.totalAmount, 0)
                                  ?.toFixed(2) ||
                                "0.00"}
                            </span>
                          </div>
                        </td>

                        <td>{order.remarks || "-"}</td>
                        <td>{formatDate(order.orderDate)}</td>

                        <td>
                          <div className="order-arrived-action-buttons">
                            <button
                              className="order-arrived-accept-button"
                              onClick={() => handleAcceptOrder(order._id)}
                              disabled={
                                acceptingOrderId === order._id ||
                                rejectingOrderId === order._id
                              }
                            >
                              {acceptingOrderId === order._id ? "Accepting..." : "Accept"}
                            </button>
                            <button
                              className="order-arrived-reject-button"
                              onClick={() => handleRejectOrder(order._id)}
                              disabled={
                                acceptingOrderId === order._id ||
                                rejectingOrderId === order._id
                              }
                            >
                              {rejectingOrderId === order._id ? "Rejecting..." : "Reject"}
                            </button>
                          </div>
                        </td>
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

export default OrderArrivedList;