// src/pages/Customer/Reports/CustomerOrderReports.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../../Assets/aed-symbol.png";
import "./CustomerOrderReports.css";
import axios from "axios";
import toast from "react-hot-toast";

const CustomerOrderReports = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState("Order Reports");
  const [user, setUser] = useState(null);
  const [downloadingOrderId, setDownloadingOrderId] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const backendUrl = process.env.REACT_APP_BACKEND_IP;

  const fetchCurrentUser = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return (window.location.href = "/login");
      const response = await axios.get(`${backendUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(response.data.user || response.data);
    } catch (err) {
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
    } catch (err) {
      console.error("Error fetching your orders:", err);
      setError("Failed to load your orders. Please try again later.");
      toast.error("Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchMyOrders();
  }, [fetchCurrentUser, fetchMyOrders]);

  // Filter orders
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch =
        !searchTerm.trim() ||
        order.customer?.name
          ?.toLowerCase()
          .includes(searchTerm.toLowerCase().trim()) ||
        order.orderItems?.some((item) =>
          item.product?.productName
            ?.toLowerCase()
            .includes(searchTerm.toLowerCase().trim()),
        );

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
    } catch (err) {
      console.error("Error downloading delivered invoice:", err);
      toast.error(
        err.response?.status === 400
          ? "No delivered quantity available for this order."
          : "Failed to download delivered invoice.",
      );
    } finally {
      setDownloadingOrderId(null);
    }
  };

  const resetFilters = () => {
    setSearchTerm("");
    setFromDate("");
    setToDate("");
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
  };

  if (!user) return <div className="customer-reports-loading">Loading...</div>;

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
                    placeholder="Search by customer or product..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  {searchTerm && (
                    <button
                      className="customer-reports-search-clear"
                      onClick={() => setSearchTerm("")}
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
                {(fromDate || toDate || searchTerm) && " matching your filters"}
              </div>
            ) : (
              <div className="customer-reports-table-wrapper">
                <table className="customer-reports-data-table">
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>Products</th>
                      <th>Total Ordered Qty</th>
                      <th>Total Delivered Qty</th>
                      <th>Pending Qty</th>
                      <th>Grand Total</th>
                      <th>Status</th>
                      <th>Order Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order, index) => {
                      const totalOrdered =
                        order.orderItems?.reduce(
                          (sum, item) => sum + item.orderedQuantity,
                          0,
                        ) || 0;
                      const totalDelivered =
                        order.orderItems?.reduce(
                          (sum, item) => sum + item.deliveredQuantity,
                          0,
                        ) || 0;
                      const pendingQty = totalOrdered - totalDelivered;
                      const grandTotal =
                        order.orderItems
                          ?.reduce((sum, item) => sum + item.totalAmount, 0)
                          ?.toFixed(2) || "0.00";
                      const hasDelivered = totalDelivered > 0;

                      return (
                        <tr key={order._id}>
                          <td>{index + 1}</td>

                          {/* Multi-product column */}
                          <td className="products-cell">
                            {order.orderItems?.length > 0 ? (
                              <div className="products-list">
                                {order.orderItems.map((item, i) => (
                                  <div key={i} className="product-tag">
                                    <span className="product-name">
                                      {item.product?.productName || "Unknown"}
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

                          <td>{totalOrdered}</td>
                          <td>{totalDelivered}</td>
                          <td>{pendingQty}</td>

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
                                width={15}
                                height={15}
                              />
                              <span>{grandTotal}</span>
                            </div>
                          </td>

                          <td>
                            <span
                              className={`customer-reports-status-badge customer-reports-status-${order.status?.toLowerCase() || "pending"}`}
                            >
                              {order.status?.charAt(0).toUpperCase() +
                                order.status?.slice(1) || "Pending"}
                            </span>
                          </td>

                          <td>{formatDate(order.orderDate)}</td>

                          <td>
                            <div className="customer-reports-action-buttons">
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
