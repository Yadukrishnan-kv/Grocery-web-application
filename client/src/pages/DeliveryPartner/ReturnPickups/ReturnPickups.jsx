// src/pages/DeliveryPartner/ReturnPickups/ReturnPickups.jsx
import React, { useState, useEffect, useCallback } from "react";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import toast from "react-hot-toast";
import axios from "axios";
import "./ReturnPickups.css";
import InvoiceDownloadModal from "../../../components/InvoiceDownloadModal/InvoiceDownloadModal";

const ReturnPickups = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [pendingInvoiceData, setPendingInvoiceData] = useState(null);
  const [pickups, setPickups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const [activeTab, setActiveTab] = useState("active");
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

  const handleDownloadInvoice = async (id, invoiceNumber, type = "normal") => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${backendUrl}/api/sales-returns/invoice/${id}?type=${type}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: "blob",
        }
      );
      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      const suffix = type === "preprinted" ? "-preprinted" : "";
      link.setAttribute("download", `return-${invoiceNumber}${suffix}.pdf`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success("Invoice downloaded successfully");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to download invoice");
    }
  };

  const totalReturnAmt = (sr) =>
    (sr.returnItems || []).reduce((s, i) => s + (i.totalAmount || 0), 0);

  const assigned = pickups.filter((p) => p.status === "pickup_assigned");
  const pickedUp = pickups.filter((p) => p.status === "picked_up");
  const completed = pickups.filter((p) => p.status === "completed");

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
              <div className="rp-stat" style={{ background: "#e8f5e9", color: "#2e7d32" }}>
                <strong>{completed.length}</strong> Completed
              </div>
            </div>
          </div>

          {loading ? (
            <div className="rp-loading">Loading pickups...</div>
          ) : (
            <>
              {/* Tabs */}
              <div className="rp-tabs" style={{ marginBottom: "16px" }}>
                <button
                  className={`rp-tab ${activeTab === "active" ? "active" : ""}`}
                  onClick={() => setActiveTab("active")}
                >
                  Active
                  {(assigned.length + pickedUp.length) > 0 && (
                    <span className="rp-tab-count">{assigned.length + pickedUp.length}</span>
                  )}
                </button>
                <button
                  className={`rp-tab ${activeTab === "history" ? "active" : ""}`}
                  onClick={() => setActiveTab("history")}
                >
                  History
                  {completed.length > 0 && (
                    <span className="rp-tab-count">{completed.length}</span>
                  )}
                </button>
              </div>

              {activeTab === "active" && (
                (assigned.length === 0 && pickedUp.length === 0) ? (
                  <div className="rp-empty-card">
                    <div className="rp-empty-icon">📦</div>
                    <p>No active return pickups assigned to you.</p>
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
                            <th>Action</th>
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
                              <td>
                                {sr.returnInvoiceNumber ? (
                                  <button
                                    className="rp-btn-download"
                                    onClick={() => {
                                      setPendingInvoiceData({ id: sr._id, invoiceNumber: sr.returnInvoiceNumber });
                                      setShowInvoiceModal(true);
                                    }}
                                    title="Download invoice"
                                  >
                                    📥 Invoice
                                  </button>
                                ) : (
                                  <span className="rp-muted">—</span>
                                )}
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
              ))}

              {/* History Tab */}
              {activeTab === "history" && (
                completed.length === 0 ? (
                  <div className="rp-empty-card">
                    <div className="rp-empty-icon">📋</div>
                    <p>No completed return pickups yet.</p>
                  </div>
                ) : (
                  <div className="rp-section">
                    <div className="rp-card">
                      <div className="rp-table-wrap">
                        <table className="rp-table">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Customer</th>
                              <th>Original Order</th>
                              <th>Return Invoice</th>
                              <th>Items</th>
                              <th>Return Amount</th>
                              <th>Completed At</th>
                              <th>Status</th>
                              <th>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {completed.map((sr, idx) => (
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
                                  {sr.returnInvoiceNumber ? (
                                    <span className="rp-inv-badge" style={{ background: "#e8f5e9", color: "#2e7d32" }}>
                                      {sr.returnInvoiceNumber}
                                    </span>
                                  ) : <span className="rp-muted">—</span>}
                                </td>
                                <td>
                                  <button className="rp-items-btn" onClick={() => setDetailItem(sr)}>
                                    {(sr.returnItems || []).length} item(s)
                                  </button>
                                </td>
                                <td className="rp-amount">AED {totalReturnAmt(sr).toFixed(2)}</td>
                                <td className="rp-muted">
                                  {sr.completedAt
                                    ? new Date(sr.completedAt).toLocaleString("en-GB")
                                    : "—"}
                                </td>
                                <td><span className="rp-badge-green">✅ Completed</span></td>
                                <td>
                                  {sr.returnInvoiceNumber ? (
                                    <button
                                      className="rp-btn-download"
                                      onClick={() => {
                                        setPendingInvoiceData({ id: sr._id, invoiceNumber: sr.returnInvoiceNumber });
                                        setShowInvoiceModal(true);
                                      }}
                                      title="Download invoice"
                                    >
                                      📥 Invoice
                                    </button>
                                  ) : (
                                    <span className="rp-muted">—</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )
              )}
            </>
          )}
        </div>
      </main>

      <InvoiceDownloadModal
        isOpen={showInvoiceModal}
        onClose={() => setShowInvoiceModal(false)}
        onSelect={(type) => {
          setShowInvoiceModal(false);
          if (pendingInvoiceData) {
            handleDownloadInvoice(pendingInvoiceData.id, pendingInvoiceData.invoiceNumber, type);
          }
        }}
      />

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
