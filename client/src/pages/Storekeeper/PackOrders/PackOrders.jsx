// src/pages/Storekeeper/PackOrders.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import toast from "react-hot-toast";
import axios from "axios";
import "./PackOrders.css"; // ← Use same CSS as OrderList (or copy styles)

const PackOrders = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeItem, setActiveItem] = useState("Pack Orders");
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [selectedOrder, setSelectedOrder] = useState(null);
  const [packInputs, setPackInputs] = useState({});
  const [processing, setProcessing] = useState(false);

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

  const fetchPendingOrders = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${backendUrl}/api/orders/pending-for-packing`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setOrders(response.data);
    } catch (error) {
      console.error("Error fetching pending orders:", error);
      toast.error("Failed to load orders to pack");
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

  const openPackModal = (order) => {
    const inputs = {};
    order.orderItems.forEach((item) => {
      inputs[item._id] = item.packedQuantity || 0;
    });
    setSelectedOrder(order);
    setPackInputs(inputs);
  };

  const handlePackQtyChange = (itemId, value) => {
    if (value === "" || (!isNaN(value) && Number(value) >= 0)) {
      setPackInputs((prev) => ({ ...prev, [itemId]: value }));
    }
  };

  const getMaxPackable = (item) => {
    return item.orderedQuantity - (item.packedQuantity || 0);
  };

  const submitPacking = async () => {
    if (!selectedOrder) return;

    const packedItems = selectedOrder.orderItems
      .map((item) => ({
        product: item._id,
        packedQuantity: Number(packInputs[item._id] || 0),
      }))
      .filter((p) => p.packedQuantity > 0);

    if (packedItems.length === 0) {
      return toast.error("Pack at least one item");
    }

    setProcessing(true);

    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${backendUrl}/api/orders/pack/${selectedOrder._id}`,
        { packedItems },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success("Packing submitted successfully!");
      setSelectedOrder(null);
      setPackInputs({});

      fetchPendingOrders(); // Refresh
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to submit packing");
    } finally {
      setProcessing(false);
    }
  };

  // ✅ NEW: Download unified invoice showing Ordered/Packed/Delivered
  const downloadUnifiedInvoice = async (orderId) => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${backendUrl}/api/orders/unified-invoice/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `unified-invoice-${orderId.slice(-8)}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success("Invoice downloaded");
    } catch (err) {
      toast.error("Failed to download invoice");
    }
  };

  const closeModal = () => {
    setSelectedOrder(null);
    setPackInputs({});
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch =
        !searchTerm.trim() ||
        (order.customer?.name &&
          order.customer.name.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesStatus =
        statusFilter === "all" ||
        (order.packedStatus &&
          order.packedStatus.toLowerCase() === statusFilter.toLowerCase());

      return matchesSearch && matchesStatus;
    });
  }, [orders, searchTerm, statusFilter]);

  const clearSearch = () => setSearchTerm("");

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  if (!user) return <div className="loading">Loading...</div>;

  return (
    <div className="order-list-layout"> {/* Same class as OrderList */}
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
            {/* Header Section – same as OrderList */}
            <div className="order-list-header-section">
              <h2 className="order-list-page-title">Pack Orders</h2>

              <div className="order-list-controls-group">
                <label htmlFor="statusFilter" className="order-list-filter-label">
                  Filter by Packing Status:
                </label>
                <select
                  id="statusFilter"
                  className="order-list-status-filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">All</option>
                  <option value="not_packed">Not Packed</option>
                  <option value="partially_packed">Partially Packed</option>
                  <option value="fully_packed">Fully Packed</option>
                </select>

                <div className="order-list-search-container">
                  <input
                    type="text"
                    className="order-list-search-input"
                    placeholder="Search by customer..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  {searchTerm && (
                    <button
                      className="order-list-search-clear"
                      onClick={clearSearch}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            </div>

            {loading ? (
              <div className="order-list-loading">Loading orders to pack...</div>
            ) : filteredOrders.length === 0 ? (
              <div className="order-list-no-data">
                No orders found
                {statusFilter !== "all" && ` matching status "${statusFilter}"`}
                {searchTerm.trim() && ` for "${searchTerm}"`}
              </div>
            ) : (
              <div className="order-list-table-wrapper">
                <table className="order-list-data-table">
                  <thead>
                      <th>No</th>
                      <th>Customer</th>
                      <th>Products</th>
                      <th>Total Ordered</th>
                      <th>Packed Qty</th>
                      <th>Status</th>
                      <th>Order Date</th>
                      <th>Actions</th>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order, index) => (
                      <tr key={order._id}>
                        <td>{index + 1}</td>
                        <td>{order.customer?.name || "N/A"}</td>

                        <td className="products-cell">
                          {order.orderItems?.length > 0 ? (
                            <div className="products-list">
                              {order.orderItems.map((item, i) => (
                                <div key={i} className="product-tag">
                                  <span className="product-name">
                                    {item.product?.productName || "Unknown"}
                                  </span>
                                  <span className="product-qty">× {item.orderedQuantity}</span>
                                  <span className="product-unit">{item.unit || ""}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="no-products">No products</span>
                          )}
                        </td>

                        <td>{order.totalOrderedQuantity || 0}</td>
                        <td>
                          {order.orderItems?.reduce((sum, i) => sum + (i.packedQuantity || 0), 0) || 0}
                        </td>

                        <td>
                          <span
                            className={`order-list-status-badge order-list-status-${order.packedStatus?.toLowerCase() || "not_packed"}`}
                          >
                            {order.packedStatus === "fully_packed"
                              ? "Fully Packed"
                              : order.packedStatus === "partially_packed"
                              ? "Partially Packed"
                              : "Not Packed"}
                          </span>
                        </td>

                        <td>{formatDate(order.orderDate)}</td>

                        <td>
                          {/* ✅ Show download invoice button if already packed */}
                          {order.packedStatus && order.packedStatus !== "not_packed" && (
                            <button
                              className="order-list-icon-button order-list-view-button"
                              onClick={() => downloadUnifiedInvoice(order._id)}
                              style={{ marginRight: "8px" }}
                            >
                              Invoice
                            </button>
                          )}
                          <button
                            className="order-list-icon-button order-list-edit-button"
                            onClick={() => openPackModal(order)}
                          >
                            Pack
                          </button>
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

      {/* Packing Modal – kept your original but styled consistently */}
      {selectedOrder && (
        <div className="modal-overlay">
          <div className="pack-modal">
            <h3>Pack Order #{selectedOrder._id.toString().slice(-8)}</h3>
            <p>Customer: {selectedOrder.customer?.name || "N/A"}</p>

            <div className="pack-items">
              {selectedOrder.orderItems.map((item) => {
                const max = getMaxPackable(item);
                return (
                  <div key={item._id} className="pack-item-row">
                    <div className="item-details">
                      <strong>{item.product?.productName || "Unknown"}</strong>
                      <div>Ordered: {item.orderedQuantity} {item.unit}</div>
                      <div>Already packed: {item.packedQuantity || 0}</div>
                    </div>

                    <div className="pack-qty">
                      <label>Pack Qty:</label>
                      <input
                        type="number"
                        min="0"
                        max={max}
                        step="any"
                        value={packInputs[item._id] ?? ""}
                        onChange={(e) => handlePackQtyChange(item._id, e.target.value)}
                      />
                      <span className="max-text">/ {max}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="modal-footer">
              <button className="cancel" onClick={closeModal}>
                Cancel
              </button>
              <button
                className="submit"
                onClick={submitPacking}
                disabled={processing}
              >
                {processing ? "Submitting..." : "Submit Packing"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PackOrders;