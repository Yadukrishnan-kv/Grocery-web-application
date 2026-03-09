// src/pages/Sales/Orders/OrderReports.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../../Assets/aed-symbol.png";
import "./OrderReports.css";
import axios from "axios";
import toast from "react-hot-toast";

const OrderReports = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState("Order Reports");
  const [user, setUser] = useState(null);
  const [downloadingOrderId, setDownloadingOrderId] = useState(null);

  // New filter states
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
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
  }, [backendUrl]);

  // ✅ FIXED: Fetch full orders (not flattened) for salesmen
  const fetchDeliveredOrders = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      let endpoint;
      
      // ✅ ROLE-BASED ENDPOINT SELECTION - Use regular orders endpoint
      if (user?.role === "Sales man") {
        endpoint = `${backendUrl}/api/orders/salesman-orders`;
      } else {
        // Admin sees all orders
        endpoint = `${backendUrl}/api/orders/getallorders`;
      }
      
      const response = await axios.get(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      // ✅ Filter for orders that have ANY delivered quantity
      const deliveredOrders = response.data.filter(order => 
        order.orderItems?.some(item => (item.deliveredQuantity || 0) > 0)
      );
      
      setOrders(deliveredOrders);
    } catch (error) {
      console.error("Error fetching orders:", error);
      toast.error("Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [backendUrl, user]);

  // ==================== FIXED INFINITE LOOP ====================
  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  useEffect(() => {
    if (user) {
      fetchDeliveredOrders();
    }
  }, [user, fetchDeliveredOrders]);
  // ============================================================

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
            .includes(searchTerm.toLowerCase().trim())
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
      toast.success("Invoice downloaded");
    } catch (error) {
      console.error("Error downloading delivered invoice:", error);
      if (error.response?.status === 400) {
        toast.error("No delivered quantity available for this order");
      } else {
        toast.error("Failed to download delivered invoice");
      }
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
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  if (!user) {
    return <div className="order-reports-loading">Loading...</div>;
  }

  return (
    <div className="order-reports-layout">
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
        className={`order-reports-main-content ${sidebarOpen ? "sidebar-open" : ""}`}
      >
        <div className="order-reports-container-wrapper">
          <div className="order-reports-container">
            <div className="order-reports-header-section">
              <h2 className="order-reports-page-title">Order Reports</h2>

              <div className="order-reports-controls-group">
                <div className="order-reports-date-group">
                  <input
                    type="date"
                    id="fromDate"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="order-reports-date-input"
                  />
                </div>

                <div className="order-reports-date-group">
                  <input
                    type="date"
                    id="toDate"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="order-reports-date-input"
                  />
                </div>

                <div className="order-reports-search-container">
                  <input
                    type="text"
                    className="order-reports-search-input"
                    placeholder="Search by customer or product..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  {searchTerm && (
                    <button
                      className="order-reports-search-clear"
                      onClick={() => setSearchTerm("")}
                      aria-label="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>

                <button
                  className="order-reports-reset-button"
                  onClick={resetFilters}
                >
                  Reset Filters
                </button>

                <button
                  className="order-reports-refresh-button"
                  onClick={fetchDeliveredOrders}
                  disabled={loading}
                >
                  {loading ? "Refreshing..." : "Refresh Data"}
                </button>
              </div>
            </div>

            {loading ? (
              <div className="order-reports-loading">Loading orders...</div>
            ) : filteredOrders.length === 0 ? (
              <div className="order-reports-no-data">
                No orders found
                {fromDate || toDate || searchTerm
                  ? " matching your filters"
                  : ""}
              </div>
            ) : (
              <div className="order-reports-table-wrapper">
                <table className="order-reports-data-table">
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>Products</th> {/* ✅ Changed from "Product" to "Products" */}
                      <th>Total Ordered Qty</th> {/* ✅ Changed */}
                      <th>Total Delivered Qty</th> {/* ✅ Changed */}
                      <th>Pending Qty</th>
                      <th>Grand Total</th> {/* ✅ Changed */}
                      <th>Delivery Partner</th>
                      <th>Order Date</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order, index) => {
                      // ✅ Calculate totals for the ENTIRE order (not per item)
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

                          {/* ✅ Multi-product column - like Customer page */}
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
                            {order.assignedTo?.username || "Not assigned"}
                          </td>

                          <td>{formatDate(order.orderDate)}</td>

                          <td>
                            <span
                              className={`order-reports-status-badge order-reports-status-${order.status?.toLowerCase() || "pending"}`}
                            >
                              {order.status?.charAt(0).toUpperCase() +
                                order.status?.slice(1) || "Pending"}
                            </span>
                          </td>

                          <td>
                            <div className="order-reports-action-buttons">
                              {hasDelivered && (
                                <button
                                  className="order-reports-invoice-button delivered"
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

export default OrderReports;