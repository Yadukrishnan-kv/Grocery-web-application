// src/pages/DeliveryPartner/ReturnPickups/ReturnPickups.jsx
import React, { useState, useEffect, useCallback } from "react";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import toast from "react-hot-toast";
import axios from "axios";
import "./ReturnPickups.css";

const STATUS_LABELS = {
  pickup_assigned: "Assigned",
  picked_up: "Picked Up",
};

const ReturnPickups = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [pickups, setPickups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const backendUrl = process.env.REACT_APP_BACKEND_IP;

  const fetchUser = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) { window.location.href = "/login"; return; }
      const res = await axios.get(`${backendUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(res.data.user || res.data);
    } catch {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
  }, [backendUrl]);

  const fetchPickups = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${backendUrl}/api/sales-returns/my-pickups`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPickups(res.data);
    } catch {
      toast.error("Failed to load return pickups");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchUser();
    fetchPickups();
    const interval = setInterval(fetchPickups, 60000);
    return () => clearInterval(interval);
  }, [fetchUser, fetchPickups]);

  const handleConfirmPickup = async (id) => {
    if (!window.confirm("Confirm that you have picked up the returned goods from the customer?")) return;
    setProcessingId(id);
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${backendUrl}/api/sales-returns/confirm-pickup/${id}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Pickup confirmed. Deliver goods to the storekeeper.");
      fetchPickups();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to confirm pickup");
    } finally {
      setProcessingId(null);
    }
  };

  const totalReturnAmt = (sr) =>
    (sr.returnItems || []).reduce((s, i) => s + (i.totalAmount || 0), 0);

  const assigned = pickups.filter((p) => p.status === "pickup_assigned");
  const pickedUp = pickups.filter((p) => p.status === "picked_up");

  return (
    <div className="rp-layout">
      <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} user={user} />
      <Sidebar
        isOpen={sidebarOpen}
        activeItem="ReturnPickups"
        onSetActiveItem={() => {}}
        onClose={() => setSidebarOpen(false)}
        user={user}
      />

      <main className={`rp-main ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="rp-page-wrapper">

          <div className="rp-page-header">
            <div>
              <h1 className="rp-page-title">Return Pickups</h1>
              <p className="rp-page-sub">Collect returned products from customers and bring to storekeeper</p>
            </div>
            <div className="rp-header-stats">
              <div className="rp-stat rp-stat-orange">
                <strong>{assigned.length}</strong> Pending Pickup
              </div>
              <div className="rp-stat rp-stat-cyan">
                <strong>{pickedUp.length}</strong> Picked Up
              </div>
            </div>
          </div>

          {loading ? (
            <div className="rp-loading">Loading pickups...</div>
          ) : pickups.length === 0 ? (
            <div className="rp-empty-card">
              <div className="rp-empty-icon">📦</div>
              <p>No return pickups assigned to you.</p>
            </div>
          ) : (
            <>
              {/* Pending pickups */}
              {assigned.length > 0 && (
                <div className="rp-section">
                  <h2 className="rp-section-title">
                    <span className="rp-dot rp-dot-orange" />
                    Awaiting Pickup ({assigned.length})
                  </h2>
                  <div className="rp-card">
                    <div className="rp-table-wrap">
                      <table className="rp-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Customer</th>
                            <th>Address</th>
                            <th>Original Order</th>
                            <th>Items</th>
                            <th>Return Amount</th>
                            <th>Requested</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {assigned.map((sr, idx) => (
                            <tr key={sr._id}>
                              <td>{idx + 1}</td>
                              <td>
                                <div className="rp-name">{sr.customer?.name || "—"}</div>
                                <div className="rp-phone">{sr.customer?.phoneNumber || ""}</div>
                              </td>
                              <td className="rp-address">{sr.customer?.address || "—"}</td>
                              <td>
                                <span className="rp-inv-badge">
                                  {sr.order?.invoiceNumber || sr.order?._id?.toString().slice(-6) || "—"}
                                </span>
                              </td>
                              <td>
                                <button className="rp-items-btn" onClick={() => setDetailItem(sr)}>
                                  {(sr.returnItems || []).length} item(s)
                                </button>
                              </td>
                              <td className="rp-amount">AED {totalReturnAmt(sr).toFixed(2)}</td>
                              <td className="rp-muted">
                                {new Date(sr.createdAt).toLocaleDateString("en-GB")}
                              </td>
                              <td>
                                <button
                                  className="rp-btn-confirm"
                                  onClick={() => handleConfirmPickup(sr._id)}
                                  disabled={processingId === sr._id}
                                >
                                  {processingId === sr._id ? "..." : "Confirm Pickup"}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Picked up - bring to store */}
              {pickedUp.length > 0 && (
                <div className="rp-section">
                  <h2 className="rp-section-title">
                    <span className="rp-dot rp-dot-cyan" />
                    Picked Up — Deliver to Storekeeper ({pickedUp.length})
                  </h2>
                  <div className="rp-card">
                    <div className="rp-table-wrap">
                      <table className="rp-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Customer</th>
                            <th>Original Order</th>
                            <th>Items</th>
                            <th>Return Amount</th>
                            <th>Picked Up At</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pickedUp.map((sr, idx) => (
                            <tr key={sr._id}>
                              <td>{idx + 1}</td>
                              <td>
                                <div className="rp-name">{sr.customer?.name || "—"}</div>
                                <div className="rp-phone">{sr.customer?.phoneNumber || ""}</div>
                              </td>
                              <td>
                                <span className="rp-inv-badge">
                                  {sr.order?.invoiceNumber || sr.order?._id?.toString().slice(-6) || "—"}
                                </span>
                              </td>
                              <td>
                                <button className="rp-items-btn" onClick={() => setDetailItem(sr)}>
                                  {(sr.returnItems || []).length} item(s)
                                </button>
                              </td>
                              <td className="rp-amount">AED {totalReturnAmt(sr).toFixed(2)}</td>
                              <td className="rp-muted">
                                {sr.pickedUpAt
                                  ? new Date(sr.pickedUpAt).toLocaleString("en-GB")
                                  : "—"}
                              </td>
                              <td>
                                <span className="rp-badge-cyan">Bring to Store</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Detail Modal */}
      {detailItem && (
        <div className="rp-modal-overlay" onClick={() => setDetailItem(null)}>
          <div className="rp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rp-modal-header">
              <h3>Return Items — {detailItem.customer?.name}</h3>
              <button className="rp-modal-close" onClick={() => setDetailItem(null)}>×</button>
            </div>
            <div className="rp-modal-body">
              {detailItem.returnReason && (
                <div className="rp-reason-box">
                  <strong>Return Reason:</strong> {detailItem.returnReason}
                </div>
              )}
              <table className="rp-detail-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Product</th>
                    <th>Unit</th>
                    <th>Return Qty</th>
                    <th>Total</th>
                    <th>Item Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {(detailItem.returnItems || []).map((item, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{item.product?.productName || "—"}</td>
                      <td>{item.unit || "—"}</td>
                      <td><strong>{item.returnedQuantity}</strong></td>
                      <td>AED {(item.totalAmount || 0).toFixed(2)}</td>
                      <td className="rp-muted">{item.reason || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReturnPickups;
