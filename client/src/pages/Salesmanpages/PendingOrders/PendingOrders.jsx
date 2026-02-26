import React, { useEffect, useState } from "react";
import axios from "axios";
import "./PendingOrders.css";

const PendingOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPending = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem("token");
        const backendUrl = process.env.REACT_APP_BACKEND_IP || "";
        const url = backendUrl
          ? `${backendUrl}/api/orders/pending-for-packing`
          : `/api/orders/pending-for-packing`;
        const res = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setOrders(res.data || []);
      } catch (err) {
        setError(err?.response?.data?.message || err.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    };
    fetchPending();
  }, []);

  return (
    <div className="sales-page pending-orders">
      <div className="page-header">
        <h1>Pending Orders</h1>
        <p className="sub">Orders still being packed by storekeeper</p>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: 20 }}>Loading pending orders...</div>
        ) : error ? (
          <div style={{ padding: 20, color: "#c00" }}>{error}</div>
        ) : (
          <table className="orders-table">
          <thead>
            <tr>
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
                <td colSpan={6} className="empty">
                  No pending orders
                </td>
              </tr>
            ) : (
              orders.map((o) => (
                <tr key={o._id}>
                  <td>{String(o._id).slice(-8)}</td>
                  <td>{o.customer?.name || "N/A"}</td>
                  <td>{o.orderItems?.length || 0}</td>
                  <td>{
                    // Calculate pending qty across items
                    (o.orderItems || []).reduce((s, it) => s + Math.max((it.orderedQuantity || 0) - (it.packedQuantity || 0), 0), 0)
                  }</td>
                  <td>{o.status}</td>
                  <td>
                    <button className="btn small">View</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default PendingOrders;
