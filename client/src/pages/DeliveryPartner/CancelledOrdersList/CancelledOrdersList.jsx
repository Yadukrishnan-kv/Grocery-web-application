// src/pages/Delivery/CancelledOrdersList.jsx
import React, { useState, useEffect, useCallback } from "react";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../../Assets/aed-symbol.png";

import "./CancelledOrdersList.css";
import axios from "axios";

const CancelledOrdersList = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState("Cancelled Orders"); // fixed typo
  const [user, setUser] = useState(null);
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

  const fetchCancellableOrders = useCallback(async () => {
  try {
    const token = localStorage.getItem('token');
    const response = await axios.get(`${backendUrl}/api/orders/my-assigned-orders`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const cancellableOrders = response.data.filter(order => 
      order.assignmentStatus === "accepted" || order.assignmentStatus === "rejected"
    );
    setOrders(cancellableOrders);
  } catch (error) {
    console.error('Error fetching cancellable orders:', error);
    alert('Failed to load orders');
  } finally {
    setLoading(false);
  }
}, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchCancellableOrders();
  }, [fetchCurrentUser, fetchCancellableOrders]);

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
    return <div className="cancelled-orders-loading">Loading...</div>;
  }

  return (
    <div className="cancelled-orders-layout">
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
        className={`cancelled-orders-main-content ${sidebarOpen ? "sidebar-open" : ""}`}
      >
        <div className="cancelled-orders-container-wrapper">
          <div className="cancelled-orders-container">
            <h2 className="cancelled-orders-page-title">Cancel Orders</h2>

            {loading ? (
              <div className="cancelled-orders-loading">Loading orders...</div>
            ) : (
              <div className="cancelled-orders-table-wrapper">
                <table className="cancelled-orders-data-table">
                  <thead>
                    <tr>
                      <th scope="col">No</th>
                      <th scope="col">Customer</th>
                      <th scope="col">Product</th>
                      <th scope="col">Ordered Qty</th>
                      <th scope="col">Delivered Qty</th>
                      <th scope="col">Price</th>
                      <th scope="col">Total Amount</th>
                      <th scope="col">Order Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.length > 0 ? (
                      orders.map((order, index) => (
                        <tr key={order._id}>
                          <td>{index + 1}</td>
                          <td>{order.customer?.name || "N/A"}</td>
                          <td>{order.product?.productName || "N/A"}</td>
                          <td>{order.orderedQuantity}</td>
                          <td>{order.deliveredQuantity}</td>
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
                              <span>{order.price != null ? Number(order.price).toFixed(2) : "0.00"}</span>
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
                              <span>{order.totalAmount != null ? Number(order.totalAmount).toFixed(2) : "0.00"}</span>
                            </div>
                          </td>
                          <td>{formatDate(order.orderDate)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="7" className="cancelled-orders-no-data">
                          No orders available for cancellation
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
    </div>
  );
};

export default CancelledOrdersList;
