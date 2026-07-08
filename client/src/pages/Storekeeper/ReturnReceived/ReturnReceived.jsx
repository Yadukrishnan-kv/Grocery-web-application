// src/pages/Storekeeper/ReturnReceived/ReturnReceived.jsx
import React, { useState, useEffect, useCallback } from "react";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import toast from "react-hot-toast";
import axios from "axios";
import "./ReturnReceived.css";
import InvoiceDownloadModal from "../../../components/InvoiceDownloadModal/InvoiceDownloadModal";

const ReturnReceived = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [pendingInvoiceSr, setPendingInvoiceSr] = useState(null);
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmModal, setConfirmModal] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [detailItem, setDetailItem] = useState(null);
  const [activeTab, setActiveTab] = useState("pending");
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

  const fetchPickedUpReturns = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${backendUrl}/api/sales-returns/picked-up`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setReturns(res.data);
    } catch {
      toast.error("Failed to load return items");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchUser();
    fetchPickedUpReturns();
    const interval = setInterval(fetchPickedUpReturns, 60000);
    return () => clearInterval(interval);
  }, [fetchUser, fetchPickedUpReturns]);

  const handleConfirmReceived = async () => {
    if (!confirmModal) return;
    setProcessing(true);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(
        `${backendUrl}/api/sales-returns/confirm-received/${confirmModal._id}`,
        { refundMethod: "none" },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(`Return completed! Invoice: ${res.data.returnInvoiceNumber}`);
      setConfirmModal(null);
      fetchPickedUpReturns();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to confirm receipt");
    } finally {
      setProcessing(false);
    }
  };

  const handleDownloadInvoice = async (sr, type = "normal") => {
    if (!sr?.returnInvoiceNumber) {
      toast.error("Return invoice not available yet");
      return;
    }
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${backendUrl}/api/sales-returns/invoice/${sr._id}?type=${type}`,
        { headers: { Authorization: `Bearer ${token}` }, responseType: "blob" }
      );
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      const suffix = type === "preprinted" ? "-preprinted" : "";
      link.download = `return-${sr.returnInvoiceNumber}${suffix}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
      toast.success("Return invoice downloaded");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to download return invoice");
    }
  };

  const totalReturnAmt = (sr) =>
    (sr.returnItems || []).reduce((s, i) => s + (i.totalAmount || 0), 0);

  const pendingReturns = returns.filter((r) => r.status === "picked_up");
  const completedReturns = returns.filter((r) => r.status === "completed");
  const visibleReturns = activeTab === "pending" ? pendingReturns : completedReturns;

  return (
    <div className="rr-layout">
      <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} user={user} />
      <Sidebar
        isOpen={sidebarOpen}
        activeItem="ReturnReceived"
        onSetActiveItem={() => {}}
        onClose={() => setSidebarOpen(false)}
        user={user}
      />

      <main className={`rr-main ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="rr-page-wrapper">

          <div className="rr-page-header">
            <div>
              <h1 className="rr-page-title">Return Received</h1>
              <p className="rr-page-sub">
                Confirm receipt of returned goods — triggers credit/return-balance adjustment and return invoice
              </p>
            </div>
            <div className="rr-badge-count">
              {pendingReturns.length} item(s) awaiting
            </div>
          </div>

          {/* Tabs */}
          <div className="rr-tabs">
            <button
              className={`rr-tab ${activeTab === "pending" ? "active" : ""}`}
              onClick={() => setActiveTab("pending")}
            >
              Pending Confirmation
              {pendingReturns.length > 0 && (
                <span className="rr-tab-count">{pendingReturns.length}</span>
              )}
            </button>
            <button
              className={`rr-tab ${activeTab === "history" ? "active" : ""}`}
              onClick={() => setActiveTab("history")}
            >
              History
              {completedReturns.length > 0 && (
                <span className="rr-tab-count">{completedReturns.length}</span>
              )}
            </button>
          </div>

          {loading ? (
            <div className="rr-loading">Loading...</div>
          ) : visibleReturns.length === 0 ? (
            <div className="rr-empty-card">
              <div className="rr-empty-icon">{activeTab === "pending" ? "✅" : "📋"}</div>
              <p>{activeTab === "pending" ? "No returned goods awaiting confirmation." : "No completed returns yet."}</p>
            </div>
          ) : (
            <div className="rr-card">
              <div className="rr-table-wrap">
                <table className="rr-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Customer</th>
                      <th>Original Order</th>
                      <th>Return Invoice</th>
                      <th>Delivery Man</th>
                      <th>Items</th>
                      <th>Return Amount</th>
                      <th>Picked Up At</th>
                      <th>Return Reason</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleReturns.map((sr, idx) => (
                      <tr key={sr._id}>
                        <td>{idx + 1}</td>
                        <td>
                          <div className="rr-name">{sr.customer?.name || "—"}</div>
                          <div className="rr-phone">{sr.customer?.phoneNumber || ""}</div>
                        </td>
                        <td>
                          <span className="rr-inv-badge">
                            {sr.order?.invoiceNumber || sr.order?._id?.toString().slice(-6) || "—"}
                          </span>
                        </td>
                        <td>
                          {sr.returnInvoiceNumber ? (
                            <span className="rr-inv-badge" style={{ background: "#e8f5e9", color: "#2e7d32" }}>
                              {sr.returnInvoiceNumber}
                            </span>
                          ) : (
                            <span className="rr-muted">—</span>
                          )}
                        </td>
                        <td>{sr.assignedTo?.username || <span className="rr-muted">—</span>}</td>
                        <td>
                          <button className="rr-items-btn" onClick={() => setDetailItem(sr)}>
                            {(sr.returnItems || []).length} item(s) — View
                          </button>
                        </td>
                        <td className="rr-amount">AED {totalReturnAmt(sr).toFixed(2)}</td>
                        <td className="rr-muted">
                          {sr.pickedUpAt
                            ? new Date(sr.pickedUpAt).toLocaleString("en-GB")
                            : "—"}
                        </td>
                        <td className="rr-reason">{sr.returnReason || "—"}</td>
                        <td>
                          {sr.status === "picked_up" ? (
                            <button
                              className="rr-btn-confirm"
                              onClick={() => setConfirmModal(sr)}
                            >
                              Confirm Received
                            </button>
                          ) : (
                            <>
                              <span className="rr-status-done">✅ Completed</span>
                              {sr.returnInvoiceNumber && (
                                <button
                                  className="rr-btn-download"
                                  onClick={() => {
                                    setPendingInvoiceSr(sr);
                                    setShowInvoiceModal(true);
                                  }}
                                  title="Download return invoice"
                                >
                                  Download Invoice
                                </button>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      <InvoiceDownloadModal
        isOpen={showInvoiceModal}
        onClose={() => setShowInvoiceModal(false)}
        onSelect={(type) => {
          setShowInvoiceModal(false);
          if (pendingInvoiceSr) {
            handleDownloadInvoice(pendingInvoiceSr, type);
          }
        }}
      />

      {/* ── Confirm Received Modal ────────────────────────────── */}
      {confirmModal && (
        <div className="rr-modal-overlay" onClick={() => setConfirmModal(null)}>
          <div className="rr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rr-modal-header">
              <h3>Confirm Return Received</h3>
              <button className="rr-modal-close" onClick={() => setConfirmModal(null)}>×</button>
            </div>
            <div className="rr-modal-body">
              <div className="rr-confirm-info">
                <div><span>Customer</span><strong>{confirmModal.customer?.name}</strong></div>
                <div><span>Order</span><strong>{confirmModal.order?.invoiceNumber || "—"}</strong></div>
                <div><span>Return Amount</span><strong>AED {totalReturnAmt(confirmModal).toFixed(2)}</strong></div>
                <div><span>Items</span><strong>{(confirmModal.returnItems || []).length} product(s)</strong></div>
              </div>

              <div className="rr-info-banner">
                <strong>On confirmation:</strong>
                <ul>
                  <li><strong>Credit order:</strong> Customer's credit balance is restored &amp; unpaid bill is reduced or closed</li>
                  <li><strong>Cash / Cheque order:</strong> Return amount is added to customer's Return Balance wallet — automatically deducted on next order before cash/cheque is collected</li>
                  <li>Return invoice will be generated</li>
                </ul>
              </div>

              <div className="rr-modal-actions">
                <button className="rr-btn-outline" onClick={() => setConfirmModal(null)}>Cancel</button>
                <button
                  className="rr-btn-complete"
                  onClick={handleConfirmReceived}
                  disabled={processing}
                >
                  {processing ? "Processing..." : "Confirm & Complete Return"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Items Detail Modal ───────────────────────────────── */}
      {detailItem && (
        <div className="rr-modal-overlay" onClick={() => setDetailItem(null)}>
          <div className="rr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rr-modal-header">
              <h3>Return Items — {detailItem.customer?.name}</h3>
              <button className="rr-modal-close" onClick={() => setDetailItem(null)}>×</button>
            </div>
            <div className="rr-modal-body">
              {detailItem.returnReason && (
                <div className="rr-reason-box">
                  <strong>Return Reason:</strong> {detailItem.returnReason}
                </div>
              )}
              <table className="rr-detail-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Product</th>
                    <th>Unit</th>
                    <th>Return Qty</th>
                    <th>Price</th>
                    <th>VAT%</th>
                    <th>Total</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {(detailItem.returnItems || []).map((item, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{item.product?.productName || "—"}</td>
                      <td>{item.unit || "—"}</td>
                      <td><strong>{item.returnedQuantity}</strong></td>
                      <td>AED {(item.price || 0).toFixed(2)}</td>
                      <td>{item.vatPercentage || 5}%</td>
                      <td>AED {(item.totalAmount || 0).toFixed(2)}</td>
                      <td className="rr-muted">{item.reason || "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="6"><strong>Total</strong></td>
                    <td colSpan="2"><strong>AED {totalReturnAmt(detailItem).toFixed(2)}</strong></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReturnReceived;
