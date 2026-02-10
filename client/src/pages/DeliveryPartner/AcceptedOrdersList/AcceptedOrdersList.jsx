// src/pages/Delivery/AcceptedOrdersList.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../../Assets/aed-symbol.png";

import "./AcceptedOrdersList.css";
import axios from "axios";

const AcceptedOrdersList = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState("Accepted Orders");
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState(""); // ← NEW: search state

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

  const fetchAcceptedOrders = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${backendUrl}/api/orders/my-assigned-orders`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const acceptedOrders = response.data.filter(
        (order) => order.assignmentStatus === "accepted",
      );
      setOrders(acceptedOrders);
    } catch (error) {
      console.error("Error fetching accepted orders:", error);
      alert("Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchAcceptedOrders();
  }, [fetchCurrentUser, fetchAcceptedOrders]);

  // Filter orders by customer name
  const filteredOrders = useMemo(() => {
    if (!searchTerm.trim()) return orders;

    const query = searchTerm.toLowerCase().trim();
    return orders.filter((order) =>
      order.customer?.name?.toLowerCase().includes(query),
    );
  }, [orders, searchTerm]);

  const clearSearch = () => {
    setSearchTerm("");
  };

  // Helper function to format date as DD/MM/YYYY
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  if (!user) {
    return <div className="accepted-orders-loading">Loading...</div>;
  }

  return (
    <div className="accepted-orders-layout">
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
        className={`accepted-orders-main-content ${sidebarOpen ? "sidebar-open" : ""}`}
      >
        <div className="accepted-orders-container-wrapper">
          <div className="accepted-orders-container">
            <div className="accepted-orders-header-section">
              <h2 className="accepted-orders-page-title">Accepted Orders</h2>

              {/* Search bar (same style as OrderList) */}
              <div className="accepted-orders-controls-group">
                <div className="accepted-orders-search-container">
                  <input
                    type="text"
                    className="accepted-orders-search-input"
                    placeholder="Search by customer name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    aria-label="Search accepted orders by customer"
                  />
                  {searchTerm && (
                    <button
                      className="accepted-orders-search-clear"
                      onClick={clearSearch}
                      aria-label="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            </div>

            {loading ? (
              <div className="accepted-orders-loading">Loading orders...</div>
            ) : filteredOrders.length === 0 ? (
              <div className="accepted-orders-no-data">
                No accepted orders found
                {searchTerm.trim() ? ` matching "${searchTerm}"` : ""}
              </div>
            ) : (
              <div className="accepted-orders-table-wrapper">
                <table className="accepted-orders-data-table">
                  <thead>
                    <tr>
                      <th scope="col">No</th>
                      <th scope="col">Customer</th>
                      <th scope="col">Product</th>
                      <th scope="col">Ordered Qty</th>
                      <th scope="col">Price</th>
                      <th scope="col">Total Amount</th>
                      <th scope="col">Remarks</th>
                      <th scope="col">Order Date</th>
                      <th scope="col">Accepted At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order, index) => (
                      <tr key={order._id}>
                        <td>{index + 1}</td>
                        <td>{order.customer?.name || "N/A"}</td>
                        <td>{order.product?.productName || "N/A"}</td>
                        <td>{order.orderedQuantity}</td>
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
                                paddingTop: "2px",
                              }}
                            />
                            <span>{order.price.toFixed(2)}</span>
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
                                paddingTop: "2px",
                              }}
                            />
                            <span>{order.totalAmount.toFixed(2)}</span>
                          </div>
                        </td>
                        <td>{order.remarks || "-"}</td>
                        <td>{formatDate(order.orderDate)}</td>
                        <td>{formatDate(order.acceptedAt)}</td>
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

export default AcceptedOrdersList;
