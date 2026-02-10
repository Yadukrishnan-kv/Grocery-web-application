// src/pages/Customer/Reports/CustomerOrderReports.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../../Assets/aed-symbol.png";

import "./CustomerOrderReports.css";
import axios from "axios";

const CustomerOrderReports = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState("Order Reports");
  const [user, setUser] = useState(null);
  const [downloadingOrderId, setDownloadingOrderId] = useState(null);

  // Filter states (same as OrderReports)
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
      console.error("Failed to load user:", error);
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
  }, [backendUrl]);

  const fetchMyOrders = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const response = await axios.get(`${backendUrl}/api/orders/my-orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setOrders(response.data);
    } catch (error) {
      console.error("Error fetching your orders:", error);
      setError("Failed to load your orders. Please try again later.");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchMyOrders();
  }, [fetchCurrentUser, fetchMyOrders]);

  // Filtered orders (same logic as before)
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch =
        !searchTerm.trim() ||
        order.product?.productName
          ?.toLowerCase()
          .includes(searchTerm.toLowerCase().trim());

      let matchesDate = true;
      const orderDate = new Date(order.orderDate);
      orderDate.setHours(0, 0, 0, 0);

      if (fromDate) {
        const start = new Date(fromDate);
        start.setHours(0, 0, 0, 0);
        matchesDate = matchesDate && orderDate >= start;
      }

      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        matchesDate = matchesDate && orderDate <= end;
      }

      return matchesSearch && matchesDate;
    });
  }, [orders, searchTerm, fromDate, toDate]);

  const downloadDeliveredInvoice = async (orderId) => {
    setDownloadingOrderId(orderId);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${backendUrl}/api/orders/getdeliveredinvoice/${orderId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: "blob",
        },
      );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `delivered-invoice-${orderId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading delivered invoice:", error);
      if (error.response?.status === 400) {
        alert("No delivered quantity available for this order.");
      } else {
        alert("Failed to download delivered invoice.");
      }
    } finally {
      setDownloadingOrderId(null);
    }
  };

  // Reset all filters
  const resetFilters = () => {
    setSearchTerm("");
    setFromDate("");
    setToDate("");
  };

  // Helper to format date as DD/MM/YYYY
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  if (!user) {
    return <div className="customer-reports-loading">Loading...</div>;
  }

  return (
    <div className="customer-reports-layout">
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
        className={`customer-reports-main-content ${sidebarOpen ? "sidebar-open" : ""}`}
      >
        <div className="customer-reports-container-wrapper">
          <div className="customer-reports-container">
            <div className="customer-reports-header-section">
              <h2 className="customer-reports-page-title">My Order Reports</h2>

              {/* Exact same controls group as before */}
              <div className="customer-reports-controls-group">
                <div className="customer-reports-date-group">
                  <input
                    type="date"
                    id="fromDate"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="customer-reports-date-input"
                  />
                </div>

                <div className="customer-reports-date-group">
                  <input
                    type="date"
                    id="toDate"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="customer-reports-date-input"
                  />
                </div>

                <div className="customer-reports-search-container">
                  <input
                    type="text"
                    className="customer-reports-search-input"
                    placeholder="Search by product name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  {searchTerm && (
                    <button
                      className="customer-reports-search-clear"
                      onClick={() => setSearchTerm("")}
                      aria-label="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>

                <button
                  className="customer-reports-reset-button"
                  onClick={resetFilters}
                >
                  Reset Filters
                </button>

                <button
                  className="customer-reports-refresh-button"
                  onClick={fetchMyOrders}
                  disabled={loading}
                >
                  {loading ? "Refreshing..." : "Refresh My Orders"}
                </button>
              </div>
            </div>

            {error && (
              <div className="customer-reports-error-message">{error}</div>
            )}

            {loading ? (
              <div className="customer-reports-loading">
                Loading your orders...
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="customer-reports-no-data">
                No orders found
                {fromDate || toDate || searchTerm
                  ? " matching your filters"
                  : ""}
              </div>
            ) : (
              <div className="customer-reports-table-wrapper">
                <table className="customer-reports-data-table">
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>Product</th>
                      <th>Ordered Qty (in unit)</th>
                      <th>Delivered Qty (in unit)</th>
                      <th>Pending Qty (in unit)</th>
                      <th>Price</th>
                      <th>Total Amount</th>
                      <th>Status</th>
                      <th>Order Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order, index) => {
                      const pendingQty =
                        order.orderedQuantity - order.deliveredQuantity;
                      const hasDelivered = order.deliveredQuantity > 0;

                      return (
                        <tr key={order._id}>
                          <td>{index + 1}</td>
                          <td>{order.product?.productName || "N/A"}</td>
                          <td>
                            {order.orderedQuantity} {order.unit || ""}
                          </td>
                          <td>
                            {order.deliveredQuantity} {order.unit || ""}
                          </td>
                          <td>
                            {pendingQty} {order.unit || ""}
                          </td>
                          <td>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <img
                                src={DirhamSymbol}
                                alt="Dirham Symbol"
                                width={15}
                                height={15}
                                style={{
                                  paddingTop: "3px",
                                }}
                              />
                              <span>{order.price?.toFixed(2) || "0.00"}</span>
                            </div>
                          </td>
                          <td>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <img
                                src={DirhamSymbol}
                                alt="Dirham Symbol"
                                width={15}
                                height={15}
                                style={{
                                  paddingTop: "3px",
                                }}
                              />
                              <span>
                                {order.totalAmount?.toFixed(2) || "0.00"}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span
                              className={`customer-reports-status-badge customer-reports-status-${order.status?.toLowerCase() || "pending"}`}
                            >
                              {order.status.charAt(0).toUpperCase() +
                                order.status.slice(1)}
                            </span>
                          </td>
                          <td>{formatDate(order.orderDate)}</td>
                          <td>
                            <div className="customer-reports-action-buttons">
                              {/* Only Delivered Invoice - no Pending Invoice */}
                              {hasDelivered && (
                                <button
                                  className="customer-reports-invoice-button delivered"
                                  onClick={() =>
                                    downloadDeliveredInvoice(order._id)
                                  }
                                  disabled={downloadingOrderId === order._id}
                                >
                                  {downloadingOrderId === order._id
                                    ? "Downloading..."
                                    : "Delivered Invoice"}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
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

export default CustomerOrderReports;
