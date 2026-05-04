// src/pages/Storekeeper/ReturnReceived/ReturnReceived.jsx
import React, { useState, useEffect, useCallback } from "react";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import toast from "react-hot-toast";
import axios from "axios";
import "./ReturnReceived.css";

const ReturnReceived = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmModal, setConfirmModal] = useState(null);
  const [refundMethod, setRefundMethod] = useState("none");
  const [processing, setProcessing] = useState(false);
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
        { refundMethod },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(
        `Return completed! Invoice: ${res.data.returnInvoiceNumber}` +
        (refundMethod !== "none" ? `. Refund (${refundMethod}) marked as pending.` : "")
      );
      setConfirmModal(null);
      setRefundMethod("none");
      fetchPickedUpReturns();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to confirm receipt");
    } finally {
      setProcessing(false);
    }
  };

  const totalReturnAmt = (sr) =>
    (sr.returnItems || []).reduce((s, i) => s + (i.totalAmount || 0), 0);

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
                Confirm receipt of returned goods from delivery man — triggers bill adjustment and refund
              </p>
            </div>
            <div className="rr-badge-count">
              {returns.length} item(s) awaiting
            </div>
          </div>

          {loading ? (
            <div className="rr-loading">Loading...</div>
          ) : returns.length === 0 ? (
            <div className="rr-empty-card">
              <div className="rr-empty-icon">✅</div>
              <p>No returned goods awaiting confirmation.</p>
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
                      <th>Delivery Man</th>
                      <th>Items</th>
                      <th>Return Amount</th>
                      <th>Picked Up At</th>
                      <th>Return Reason</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returns.map((sr, idx) => (
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
                          <button
                            className="rr-btn-confirm"
                            onClick={() => {
                              setConfirmModal(sr);
                              setRefundMethod("none");
                            }}
                          >
                            Confirm Received
                          </button>
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
                  <li>Customer credit balance will be restored (if credit order)</li>
                  <li>Related bill will be adjusted / cancelled</li>
                  <li>Return invoice will be generated</li>
                  {refundMethod !== "none" && (
                    <li>Refund via <strong>{refundMethod.replace(/_/g, " ")}</strong> will be marked as pending</li>
                  )}
                </ul>
              </div>

              <div className="rr-form-group">
                <label>Refund Method</label>
                <select
                  value={refundMethod}
                  onChange={(e) => setRefundMethod(e.target.value)}
                  className="rr-select"
                >
                  <option value="none">No Refund / Credit Adjustment Only</option>
                  <option value="cash">Cash Refund</option>
                  <option value="cheque">Cheque Refund</option>
                  <option value="credit_adjustment">Credit Adjustment</option>
                </select>
                <p className="rr-select-hint">
                  Select how the customer should be refunded. If "No Refund", only credit balance is restored.
                </p>
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
