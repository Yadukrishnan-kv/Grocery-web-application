// src/pages/Storekeeper/StorekeeperOrders.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../../Assets/aed-symbol.png";
import toast from "react-hot-toast";
import axios from "axios";
import "./StorekeeperOrders.css";

const StorekeeperOrders = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeItem, setActiveItem] = useState("All Orders");
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [invoiceFilter, setInvoiceFilter] = useState("");

  const backendUrl = process.env.REACT_APP_BACKEND_IP;

  // Fetch current user
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

  // Fetch all orders for storekeeper
  const fetchAllOrders = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${backendUrl}/api/orders/all-orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setOrders(response.data);
    } catch (error) {
      console.error("Error fetching orders:", error);
      toast.error("Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchAllOrders();
  }, [fetchCurrentUser, fetchAllOrders]);

  // ✅ Download unified invoice with consistent DEL-XX invoice number
  const downloadUnifiedInvoice = async (orderId, invoiceNumber) => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(
        `${backendUrl}/api/orders/unified-invoice/${orderId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: "blob",
        }
      );
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      
      // ✅✅✅ USE CONSISTENT INVOICE NUMBER (DEL-XX) IN FILENAME ✅✅✅
      link.setAttribute("download", invoiceNumber 
        ? `unified-invoice-${invoiceNumber}.pdf` 
        : `unified-invoice-${orderId.slice(-8)}.pdf`);
      
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Invoice downloaded");
    } catch (err) {
      console.error("Download error:", err);
      toast.error("Failed to download invoice");
    }
  };

  // Filter orders
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch =
        !searchTerm.trim() ||
        order.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order._id?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesInvoice =
        !invoiceFilter.trim() ||
        order.invoiceNumber?.toLowerCase().includes(invoiceFilter.toLowerCase());
      
      const matchesStatus =
        statusFilter === "all" ||
        order.packedStatus?.toLowerCase() === statusFilter.toLowerCase();
      
      return matchesSearch && matchesInvoice && matchesStatus;
    });
  }, [orders, searchTerm, invoiceFilter, statusFilter]);



  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const getPackedStatusBadge = (order) => {
    const status = order.packedStatus || "not_packed";
    const map = {
      not_packed: { label: "Not Packed", class: "status-not-packed" },
      partially_packed: { label: "Partially Packed", class: "status-partial" },
      fully_packed: { label: "Fully Packed", class: "status-packed" },
    };
    return map[status] || { label: status, class: "status-neutral" };
  };

  if (!user) return <div className="order-list-loading">Loading...</div>;

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
      <main className={`order-list-main-content ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="order-list-container-wrapper">
          <div className="order-list-container">
            
            {/* Header Section */}
            <div className="order-list-header-section">
              <h2 className="order-list-page-title">All Orders</h2>
              <p className="sub">Complete order history with packing & delivery status</p>
            </div>

            {/* Controls */}
            <div className="order-list-controls-group">
              {/* Search */}
              <div className="order-list-search-container">
                <input
                  type="text"
                  className="order-list-search-input"
                  placeholder="Search by customer or order ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button
                    className="order-list-search-clear"
                    onClick={() => setSearchTerm("")}
                    aria-label="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Invoice Filter */}
              <div className="order-list-search-container">
                <input
                  type="text"
                  className="order-list-search-input"
                  placeholder="Filter by Invoice # (DEL-XX)..."
                  value={invoiceFilter}
                  onChange={(e) => setInvoiceFilter(e.target.value)}
                />
                {invoiceFilter && (
                  <button
                    className="order-list-search-clear"
                    onClick={() => setInvoiceFilter("")}
                    aria-label="Clear invoice filter"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Status Filter */}
              <div className="order-list-filter-group">
                <label htmlFor="statusFilter" className="order-list-filter-label">
                  Packing Status:
                </label>
                <select
                  id="statusFilter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="order-list-filter-select"
                >
                  <option value="all">All</option>
                  <option value="not_packed">Not Packed</option>
                  <option value="partially_packed">Partially Packed</option>
                  <option value="fully_packed">Fully Packed</option>
                </select>
              </div>
            </div>

            {/* Loading / Empty / Table */}
            {loading ? (
              <div className="order-list-loading">Loading orders...</div>
            ) : filteredOrders.length === 0 ? (
              <div className="order-list-no-data">
                No orders found
                {statusFilter !== "all" && ` with status "${statusFilter.replace("_", " ")}"`}
                {searchTerm.trim() && ` matching "${searchTerm}"`}
                {invoiceFilter.trim() && ` with invoice "${invoiceFilter}"`}
              </div>
            ) : (
              <div className="order-list-table-wrapper">
                <table className="order-list-data-table">
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>Invoice #</th>
                      <th>Customer</th>
                      <th>Products</th>
                      <th>Ordered</th>
                      <th>Packed</th>
                      <th>Delivered</th>
                      <th>Grand Total</th>
                      <th>Status</th>
                      <th>Order Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order, index) => {
                      const totalOrdered = order.orderItems?.reduce((s, i) => s + i.orderedQuantity, 0) || 0;
                      const totalPacked = order.orderItems?.reduce((s, i) => s + (i.packedQuantity || 0), 0) || 0;
                      const totalDelivered = order.orderItems?.reduce((s, i) => s + i.deliveredQuantity, 0) || 0;
                      const grandTotal = order.orderItems?.reduce((s, i) => s + i.totalAmount, 0)?.toFixed(2) || "0.00";
                      const statusBadge = getPackedStatusBadge(order);
                      
                      // ✅✅✅ USE ORDER'S INVOICE NUMBER (DEL-XX) ✅✅✅
                      const invoiceNo = order.invoiceNumber || "N/A";

                      return (
                        <tr key={order._id}>
                          <td>{index + 1}</td>
                          
                          {/* ✅✅✅ SHOW INVOICE # WITH CONSISTENT DEL-XX FORMAT ✅✅✅ */}
                          <td>
                            <strong className="invoice-number-cell">
                              {invoiceNo}
                            </strong>
                          </td>
                          
                          <td>
                            <div className="customer-cell">
                              <span className="customer-name">{order.customer?.name || "N/A"}</span>
                              <small className="customer-phone">{order.customer?.phoneNumber}</small>
                            </div>
                          </td>
                          
                          <td className="products-cell">
                            {order.orderItems?.length > 0 ? (
                              <div className="products-list">
                                {order.orderItems.slice(0, 2).map((item, i) => (
                                  <div key={i} className="product-tag">
                                    <span className="product-name">{item.product?.productName || "—"}</span>
                                    <span className="product-qty">× {item.orderedQuantity}</span>
                                  </div>
                                ))}
                                {order.orderItems.length > 2 && (
                                  <span className="product-more">+{order.orderItems.length - 2} more</span>
                                )}
                              </div>
                            ) : (
                              <span className="no-products">No products</span>
                            )}
                          </td>
                          
                          <td className="qty-cell">{totalOrdered}</td>
                          <td className="qty-cell packed">{totalPacked}</td>
                          <td className="qty-cell delivered">{totalDelivered}</td>
                          
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                              <img src={DirhamSymbol} alt="AED" width={14} height={14} />
                              <span>{grandTotal}</span>
                            </div>
                          </td>
                          
                          <td>
                            <span className={`status-badge ${statusBadge.class}`}>
                              {statusBadge.label}
                            </span>
                          </td>
                          
                          <td>{formatDate(order.orderDate)}</td>
                          
                          <td>
                            {/* ✅✅✅ DOWNLOAD INVOICE BUTTON - USES CONSISTENT DEL-XX ✅✅✅ */}
                            {order.packedStatus && order.packedStatus !== "not_packed" && (
                              <button
                                className="order-list-icon-button order-list-view-button"
                                onClick={() => downloadUnifiedInvoice(order._id, order.invoiceNumber)}
                                title={`Download invoice ${order.invoiceNumber || "N/A"}`}
                                disabled={!order.invoiceNumber}
                              >
                                📄 Invoice
                              </button>
                            )}
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

export default StorekeeperOrders;