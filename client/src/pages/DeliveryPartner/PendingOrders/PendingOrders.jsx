// src/pages/DeliveryPartner/PendingOrders/PendingOrders.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../../Assets/aed-symbol.png";
import toast from "react-hot-toast";
import axios from "axios";
import "./PendingOrders.css";

const PendingOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState("Pending Orders");
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const backendUrl = process.env.REACT_APP_BACKEND_IP;

  const fetchCurrentUser = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return window.location.href = "/login";
      const res = await axios.get(`${backendUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(res.data.user || res.data);
    } catch (err) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
  }, [backendUrl]);

  const fetchPendingOrders = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${backendUrl}/api/orders/my-assigned-orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // ✅ Show orders that are assigned/accepted but NOT yet delivered or ready to deliver
      // These are orders waiting for storekeeper to pack
      setOrders(
        res.data.filter(
          (o) =>
            o.assignmentStatus === "accepted" &&
            (o.packedStatus === "not_packed" || o.packedStatus === "partially_packed") &&
            o.status !== "delivered" &&
            o.status !== "cancelled"
        )
      );
    } catch (err) {
      toast.error("Failed to load pending orders");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchPendingOrders();

    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchPendingOrders, 60000);
    return () => clearInterval(interval);
  }, [fetchCurrentUser, fetchPendingOrders]);

  const getPendingStatus = (order) => {
    const totalOrdered = order.orderItems?.reduce((s, i) => s + i.orderedQuantity, 0) || 0;
    const totalPacked = order.orderItems?.reduce((s, i) => s + (i.packedQuantity || 0), 0) || 0;
    const remaining = totalOrdered - totalPacked;

    if (order.packedStatus === "not_packed") return "Awaiting First Pack";
    if (order.packedStatus === "partially_packed" && remaining > 0)
      return `Partially Packed (${remaining} remaining)`;
    return "Ready to Deliver";
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch =
        !searchTerm.trim() ||
        order.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus =
        statusFilter === "all" ||
        getPendingStatus(order).toLowerCase().includes(statusFilter.toLowerCase());
      return matchesSearch && matchesStatus;
    });
  }, [orders, searchTerm, statusFilter]);

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  if (!user) return <div className="pending-orders-loading">Loading...</div>;

  return (
    <div className="pending-orders-layout">
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
      <main className={`pending-orders-main-content ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="pending-orders-container-wrapper">
          <div className="pending-orders-container">
            <h2 className="pending-orders-page-title">Pending Orders (Awaiting Stock)</h2>
            <p className="pending-orders-description">
              These orders are assigned to you and waiting for the storekeeper to pack. 
              Check back when stock is available.
            </p>

            <div className="pending-orders-controls-group">
              <div className="pending-orders-filter-group">
                <label htmlFor="statusFilter" className="pending-orders-filter-label">
                  Filter by Status:
                </label>
                <select
                  id="statusFilter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="pending-orders-status-filter"
                >
                  <option value="all">All Statuses</option>
                  <option value="awaiting">Awaiting First Pack</option>
                  <option value="partially">Partially Packed</option>
                  <option value="ready">Ready to Deliver</option>
                </select>
              </div>

              <div className="pending-orders-search-container">
                <input
                  type="text"
                  className="pending-orders-search-input"
                  placeholder="Search by customer name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button
                    className="pending-orders-search-clear"
                    onClick={() => setSearchTerm("")}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {loading ? (
              <div className="pending-orders-loading">Loading orders...</div>
            ) : filteredOrders.length === 0 ? (
              <div className="pending-orders-no-data">
                No orders found
                {statusFilter !== "all" && ` with status "${statusFilter}"`}
                {searchTerm.trim() && ` matching "${searchTerm}"`}
              </div>
            ) : (
              <div className="pending-orders-table-wrapper">
                <table className="pending-orders-data-table">
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>Customer</th>
                      <th>Products</th>
                      <th>Total Ordered</th>
                      <th>Already Packed</th>
                      <th>Remaining to Pack</th>
                      <th>Grand Total</th>
                      <th>Status</th>
                      <th>Order Date</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order, index) => {
                      const totalOrdered = order.orderItems?.reduce((s, i) => s + i.orderedQuantity, 0) || 0;
                      const packedQty = order.orderItems?.reduce((s, i) => s + (i.packedQuantity || 0), 0) || 0;
                      const remaining = totalOrdered - packedQty;
                      const grandTotal = order.orderItems?.reduce((s, i) => s + i.totalAmount, 0)?.toFixed(2) || "0.00";

                      return (
                        <tr key={order._id} className="pending-order-row">
                          <td>{index + 1}</td>
                          <td className="customer-cell">
                            <div className="customer-info">
                              <strong>{order.customer?.name || "N/A"}</strong>
                              <small>{order.customer?.phoneNumber || "N/A"}</small>
                            </div>
                          </td>

                          <td className="products-cell">
                            {order.orderItems?.length > 0 ? (
                              <div className="products-list">
                                {order.orderItems.map((item, i) => (
                                  <div key={i} className="product-tag">
                                    <span className="product-name">{item.product?.productName || "—"}</span>
                                    <span className="product-qty">× {item.orderedQuantity}</span>
                                    <span className="product-unit">{item.unit || ""}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="no-products">No products</span>
                            )}
                          </td>

                          <td className="text-center">{totalOrdered}</td>
                          <td className="text-center">
                            <span className="packed-badge">{packedQty}</span>
                          </td>
                          <td className="text-center">
                            <span className="remaining-badge remaining">{remaining}</span>
                          </td>

                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <img src={DirhamSymbol} alt="AED" width={18} height={20} style={{ paddingTop: "2px" }} />
                              <span>{grandTotal}</span>
                            </div>
                          </td>

                          <td>
                            <span className={`status-badge status-${getPendingStatus(order).toLowerCase().replace(/\s/g, "-")}`}>
                              {getPendingStatus(order)}
                            </span>
                          </td>

                          <td>{formatDate(order.orderDate)}</td>

                          <td className="notes-cell">
                            {order.remarks ? (
                              <span className="notes-text">{order.remarks}</span>
                            ) : (
                              <span className="no-notes">—</span>
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

export default PendingOrders;
