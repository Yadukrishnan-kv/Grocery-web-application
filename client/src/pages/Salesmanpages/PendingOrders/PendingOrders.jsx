import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import "./PendingOrders.css";

const PendingOrders = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState([]);

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

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  useEffect(() => {
    const fetchPending = async () => {
      try {
        const token = localStorage.getItem("token");
        const backend = process.env.REACT_APP_BACKEND_IP || "";
        const url = backend
          ? `${backend}/api/orders/pending-for-packing`
          : `/api/orders/pending-for-packing`;
        const res = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setOrders(res.data || []);
      } catch (err) {
        console.error("Failed to load pending orders:", err);
      }
    };
    fetchPending();
  }, []);

  if (!user) {
    return <div className="order-list-loading">Loading...</div>;
  }

  return (
    <div className="order-list-layout">
      <Header sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} user={user} />
      <Sidebar isOpen={sidebarOpen} activeItem={"Pending Orders"} onSetActiveItem={() => {}} onClose={() => setSidebarOpen(false)} user={user} />

      <main className={`order-list-main-content ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="order-list-container-wrapper">
          <div className="order-list-container">
            <div className="order-list-header-section">
              <h2 className="order-list-page-title">Pending Orders</h2>
              <p className="sub">Orders still being packed by storekeeper</p>
            </div>

            <div className="order-list-table-wrapper">
              <table className="order-list-data-table">
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Order ID</th>
                    <th>Customer</th>
                    <th>Items</th>
                    <th>Qty Pending</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="order-list-no-data">No pending orders</td>
                    </tr>
                  ) : (
                    orders.map((o, idx) => (
                      <tr key={o._id}>
                        <td>{idx + 1}</td>
                        <td>{String(o._id).slice(-8)}</td>
                        <td>{o.customer?.name || "N/A"}</td>
                        <td>{o.orderItems?.length || 0}</td>
                        <td>{(o.orderItems || []).reduce((s, it) => s + Math.max((it.orderedQuantity || 0) - (it.packedQuantity || 0), 0), 0)}</td>
                        <td>{o.status}</td>
                        <td>
                          <button className="order-list-icon-button">👁️</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default PendingOrders;
