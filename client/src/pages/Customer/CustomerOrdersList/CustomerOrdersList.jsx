// src/pages/Customer/Orders/CustomerOrdersList.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../../Assets/aed-symbol.png";
import "./CustomerOrdersList.css";
import axios from "axios";
import toast from "react-hot-toast";

const CustomerOrdersList = () => {
  const [realOrders, setRealOrders] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState("Orders");
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
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

  const fetchCustomerHistory = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${backendUrl}/api/orders/customer-history`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setRealOrders(res.data.realOrders || []);

      // Only keep pending + rejected requests (approved ones are now real orders)
      const filteredRequests = (res.data.requests || []).filter(
        (req) => req.status === "pending" || req.status === "rejected"
      );
      setRequests(filteredRequests);
    } catch (err) {
      console.error("Error fetching customer history:", err);
      toast.error("Failed to load your order history");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchCustomerHistory();
  }, [fetchCurrentUser, fetchCustomerHistory]);

  const handleCreateOrder = () => {
    window.location.href = "/customer/create-order";
  };

  // Combine real orders + pending/rejected requests into one list
  const filteredItems = useMemo(() => {
    const allItems = [
      ...realOrders.map((order) => ({ ...order, type: "order" })),
      ...requests.map((req) => ({ ...req, type: "request" })),
    ];

    return allItems.filter((item) => {
      const matchesSearch =
        !searchTerm.trim() ||
        item.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.orderItems?.some((item) =>
          item.product?.productName?.toLowerCase().includes(searchTerm.toLowerCase())
        );

      const itemStatus = item.type === "order" ? item.status : item.status;

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "pending_approval" &&
          item.type === "request" &&
          itemStatus === "pending") ||
        (statusFilter === "rejected" &&
          item.type === "request" &&
          itemStatus === "rejected") ||
        (item.type === "order" && itemStatus?.toLowerCase() === statusFilter.toLowerCase());

      return matchesSearch && matchesStatus;
    });
  }, [realOrders, requests, searchTerm, statusFilter]);

  const clearSearch = () => setSearchTerm("");

  const getAssignmentStatusDisplay = (item) => {
    if (item.type === "request") return "N/A"; // Requests don't have assignment
    if (!item.assignedTo) return "Not Assigned";
    if (item.assignmentStatus === "accepted") return "Accepted";
    if (item.assignmentStatus === "rejected") return "Rejected";
    if (item.assignmentStatus === "assigned") return "Assigned";
    return "Pending";
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const getStatusDisplay = (item) => {
    if (item.type === "request") {
      if (item.status === "pending") return "Pending Approval";
      if (item.status === "rejected") return "Rejected";
    }
    return item.status?.charAt(0).toUpperCase() + item.status?.slice(1) || "Pending";
  };

  const getStatusClass = (item) => {
    if (item.type === "request") {
      if (item.status === "pending") return "pending-approval";
      if (item.status === "rejected") return "rejected";
    }
    return item.status?.toLowerCase() || "pending";
  };

  if (!user) {
    return <div className="customer-orders-loading">Loading...</div>;
  }

  return (
    <div className="customer-orders-layout">
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
        className={`customer-orders-main-content ${sidebarOpen ? "sidebar-open" : ""}`}
      >
        <div className="customer-orders-container-wrapper">
          <div className="customer-orders-container">
            <div className="customer-orders-header-section">
              <h2 className="customer-orders-page-title">My Orders</h2>

              <div className="customer-orders-controls-group">
                {/* Status Filter */}
                <div className="customer-orders-filter-group">
                  <label
                    htmlFor="statusFilter"
                    className="customer-orders-filter-label"
                  >
                    Filter by Status:
                  </label>
                  <select
                    id="statusFilter"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="customer-orders-status-filter"
                  >
                    <option value="all">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="pending_approval">Pending Approval</option>
                    <option value="rejected">Rejected</option>
                    <option value="partial_delivered">Partially Delivered</option>
                    <option value="delivered">Delivered</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                {/* Search */}
                <div className="customer-orders-search-container">
                  <input
                    type="text"
                    className="customer-orders-search-input"
                    placeholder="Search by customer or product..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    aria-label="Search orders by customer or product name"
                  />
                  {searchTerm && (
                    <button
                      className="customer-orders-search-clear"
                      onClick={clearSearch}
                      aria-label="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* Create Button */}
                <button
                  className="customer-orders-create-button"
                  onClick={handleCreateOrder}
                >
                  Create Order
                </button>
              </div>
            </div>

            {loading ? (
              <div className="customer-orders-loading">Loading orders...</div>
            ) : filteredItems.length === 0 ? (
              <div className="customer-orders-no-data">
                No orders found
                {statusFilter !== "all" ? ` with status "${statusFilter}"` : ""}
                {searchTerm.trim() ? ` matching "${searchTerm}"` : ""}
              </div>
            ) : (
              <div className="customer-orders-table-wrapper">
                <table className="customer-orders-data-table">
                  <thead>
                    <tr>
                      <th scope="col">No</th>
                      <th scope="col">Products</th>
                      <th scope="col">Total Ordered Qty</th>
                      <th scope="col">Total Delivered Qty</th>
                      <th scope="col">Grand Total</th>
                      <th scope="col">Remarks</th>
                      <th scope="col">Payment</th>
                      <th scope="col">Delivery Partner</th>
                      <th scope="col">Status</th>
                      <th scope="col">Order Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item, index) => {
                      const isRequest = item.type === "request";

                      // For real orders
                      const totalOrdered = isRequest
                        ? item.orderItems?.reduce((sum, it) => sum + it.orderedQuantity, 0) || 0
                        : item.orderItems?.reduce((sum, it) => sum + it.orderedQuantity, 0) || 0;

                      const totalDelivered = isRequest
                        ? 0 // Requests have no delivered qty
                        : item.orderItems?.reduce((sum, it) => sum + it.deliveredQuantity, 0) || 0;

                      const grandTotal = isRequest
                        ? item.grandTotal?.toFixed(2) || "0.00"
                        : item.orderItems?.reduce((sum, it) => sum + it.totalAmount, 0)?.toFixed(2) ||
                          "0.00";

                      return (
                        <tr key={item._id}>
                          <td>{index + 1}</td>

                          <td className="products-cell">
                            {item.orderItems?.length > 0 ? (
                              <div className="products-list">
                                {item.orderItems.map((oi, i) => (
                                  <div key={i} className="product-tag">
                                    <span className="product-name">
                                      {oi.product?.productName || "Unknown"}
                                    </span>
                                    <span className="product-qty">× {oi.orderedQuantity}</span>
                                    <span className="product-unit">{oi.unit || ""}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="no-products">No products</span>
                            )}
                          </td>

                          <td>{totalOrdered}</td>
                          <td>{totalDelivered}</td>

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
                                style={{ paddingTop: "3px" }}
                              />
                              <span>{grandTotal}</span>
                            </div>
                          </td>

                          <td>{item.remarks || "-"}</td>

                          <td>
                            {item.payment?.charAt(0).toUpperCase() +
                              item.payment?.slice(1) || "N/A"}
                          </td>

                          <td>
                            <span
                              className={`customer-orders-assignment-badge customer-orders-assignment-${
                                isRequest ? "pending" : (item.assignmentStatus?.toLowerCase() || "pending")
                              }`}
                            >
                              {isRequest ? "N/A" : getAssignmentStatusDisplay(item)}
                            </span>
                          </td>

                          <td>
                            <span
                              className={`customer-orders-status-badge customer-orders-status-${getStatusClass(item)}`}
                            >
                              {getStatusDisplay(item)}
                            </span>
                          </td>

                          <td>
                            {isRequest
                              ? formatDate(item.requestedAt)
                              : formatDate(item.orderDate)}
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

export default CustomerOrdersList;