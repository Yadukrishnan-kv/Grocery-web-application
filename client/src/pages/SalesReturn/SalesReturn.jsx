// src/pages/SalesReturn/SalesReturn.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../../components/layout/Header/Header";
import Sidebar from "../../components/layout/Sidebar/Sidebar";
import toast from "react-hot-toast";
import axios from "axios";
import "./SalesReturn.css";

const STATUS_LABELS = {
  pending_admin_approval: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
  pickup_assigned: "Pickup Assigned",
  picked_up: "Picked Up",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_COLORS = {
  pending_admin_approval: "status-orange",
  approved: "status-blue",
  rejected: "status-red",
  pickup_assigned: "status-purple",
  picked_up: "status-cyan",
  completed: "status-green",
  cancelled: "status-gray",
};

const SalesReturn = () => {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [returns, setReturns] = useState([]);
  const [deliveryMen, setDeliveryMen] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Modals
  const [detailReturn, setDetailReturn] = useState(null);
  const [approveModal, setApproveModal] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);
  const [assignModal, setAssignModal] = useState(null);

  const [approveForm, setApproveForm] = useState({ adminRemarks: "", deliveryManId: "" });
  const [rejectForm, setRejectForm] = useState({ adminRemarks: "" });
  const [assignDeliveryManId, setAssignDeliveryManId] = useState("");
  const [processing, setProcessing] = useState(false);

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

  const fetchReturns = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${backendUrl}/api/sales-returns/getall`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setReturns(res.data);
    } catch (err) {
      toast.error("Failed to load sales returns");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  const fetchDeliveryMen = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${backendUrl}/api/users/getAllUsers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const all = res.data?.users || res.data || [];
      setDeliveryMen(all.filter((u) => u.role === "Delivery man" || u.role === "Delivery Man" || u.role?.toLowerCase().includes("delivery")));
    } catch {
      // delivery men fetch is non-critical
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchUser();
    fetchReturns();
    fetchDeliveryMen();
  }, [fetchUser, fetchReturns, fetchDeliveryMen]);

  const tabs = [
    { key: "all", label: "All" },
    { key: "pending_admin_approval", label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "pickup_assigned", label: "Pickup Assigned" },
    { key: "picked_up", label: "Picked Up" },
    { key: "completed", label: "Completed" },
    { key: "rejected", label: "Rejected" },
  ];

  const stats = useMemo(() => ({
    pending: returns.filter((r) => r.status === "pending_admin_approval").length,
    approved: returns.filter((r) => r.status === "approved").length,
    inProgress: returns.filter((r) => ["pickup_assigned", "picked_up"].includes(r.status)).length,
    completed: returns.filter((r) => r.status === "completed").length,
  }), [returns]);

  const filtered = useMemo(() => {
    let list = activeTab === "all" ? returns : returns.filter((r) => r.status === activeTab);
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (r) =>
          r.customer?.name?.toLowerCase().includes(q) ||
          r.order?.invoiceNumber?.toLowerCase().includes(q) ||
          r.returnInvoiceNumber?.toLowerCase().includes(q) ||
          r.returnReason?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [returns, activeTab, searchTerm]);

  const totalReturnAmt = (sr) =>
    (sr.returnItems || []).reduce((s, i) => s + (i.totalAmount || 0), 0);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleApprove = async () => {
    if (!approveModal) return;
    setProcessing(true);
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${backendUrl}/api/sales-returns/approve/${approveModal._id}`,
        approveForm,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Sales return approved");
      setApproveModal(null);
      setApproveForm({ adminRemarks: "", deliveryManId: "" });
      fetchReturns();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to approve");
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    setProcessing(true);
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${backendUrl}/api/sales-returns/reject/${rejectModal._id}`,
        rejectForm,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Sales return rejected");
      setRejectModal(null);
      setRejectForm({ adminRemarks: "" });
      fetchReturns();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to reject");
    } finally {
      setProcessing(false);
    }
  };

  const handleAssignPickup = async () => {
    if (!assignModal || !assignDeliveryManId) return;
    setProcessing(true);
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${backendUrl}/api/sales-returns/assign-pickup/${assignModal._id}`,
        { deliveryManId: assignDeliveryManId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Delivery man assigned for pickup");
      setAssignModal(null);
      setAssignDeliveryManId("");
      fetchReturns();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to assign");
    } finally {
      setProcessing(false);
    }
  };

  const handleCancel = async (id) => {
    if (!window.confirm("Cancel this return request?")) return;
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${backendUrl}/api/sales-returns/cancel/${id}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Return cancelled");
      fetchReturns();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to cancel");
    }
  };

  const handleDownloadInvoice = async (sr) => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(
        `${backendUrl}/api/sales-returns/invoice/${sr._id}`,
        { headers: { Authorization: `Bearer ${token}` }, responseType: "blob" }
      );
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `return-${sr.returnInvoiceNumber}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download invoice");
    }
  };

  return (
    <div className="sr-layout">
      <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} user={user} />
      <Sidebar
        isOpen={sidebarOpen}
        activeItem="SalesReturn"
        onSetActiveItem={() => {}}
        onClose={() => setSidebarOpen(false)}
        user={user}
      />

      <main className={`sr-main ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="sr-page-wrapper">

          {/* Page header */}
          <div className="sr-page-header">
            <div>
              <h1 className="sr-page-title">Sales Returns</h1>
              <p className="sr-page-sub">Manage product return requests from customers</p>
            </div>
            <button className="sr-btn-primary" onClick={() => navigate("/sales-returns/create")}>
              + Create Return
            </button>
          </div>

          {/* Stats */}
          <div className="sr-stats-row">
            <div className="sr-stat-card sr-stat-orange">
              <div className="sr-stat-num">{stats.pending}</div>
              <div className="sr-stat-label">Pending Approval</div>
            </div>
            <div className="sr-stat-card sr-stat-blue">
              <div className="sr-stat-num">{stats.approved}</div>
              <div className="sr-stat-label">Approved</div>
            </div>
            <div className="sr-stat-card sr-stat-purple">
              <div className="sr-stat-num">{stats.inProgress}</div>
              <div className="sr-stat-label">In Progress</div>
            </div>
            <div className="sr-stat-card sr-stat-green">
              <div className="sr-stat-num">{stats.completed}</div>
              <div className="sr-stat-label">Completed</div>
            </div>
          </div>

          {/* Main card */}
          <div className="sr-card">
            {/* Tabs + search */}
            <div className="sr-card-top">
              <div className="sr-tabs">
                {tabs.map((t) => (
                  <button
                    key={t.key}
                    className={`sr-tab ${activeTab === t.key ? "active" : ""}`}
                    onClick={() => setActiveTab(t.key)}
                  >
                    {t.label}
                    {t.key !== "all" && (
                      <span className="sr-tab-count">
                        {returns.filter((r) => r.status === t.key).length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <input
                className="sr-search"
                placeholder="Search customer, order, reason..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Table */}
            {loading ? (
              <div className="sr-loading">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="sr-empty">No returns found.</div>
            ) : (
              <div className="sr-table-wrap">
                <table className="sr-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Customer</th>
                      <th>Order</th>
                      <th>Items</th>
                      <th>Return Amount</th>
                      <th>Status</th>
                      <th>Assigned To</th>
                      <th>Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((sr, idx) => (
                      <tr key={sr._id}>
                        <td>{idx + 1}</td>
                        <td>
                          <div className="sr-customer-name">{sr.customer?.name || "-"}</div>
                          <div className="sr-customer-phone">{sr.customer?.phoneNumber || ""}</div>
                        </td>
                        <td>
                          <span className="sr-invoice-badge">
                            {sr.order?.invoiceNumber || sr.order?._id?.toString().slice(-6) || "-"}
                          </span>
                        </td>
                        <td>{(sr.returnItems || []).length} item(s)</td>
                        <td className="sr-amount">AED {totalReturnAmt(sr).toFixed(2)}</td>
                        <td>
                          <span className={`sr-status-badge ${STATUS_COLORS[sr.status] || ""}`}>
                            {STATUS_LABELS[sr.status] || sr.status}
                          </span>
                        </td>
                        <td>{sr.assignedTo?.username || <span className="sr-muted">—</span>}</td>
                        <td className="sr-muted">
                          {new Date(sr.createdAt).toLocaleDateString("en-GB")}
                        </td>
                        <td>
                          <div className="sr-actions">
                            <button
                              className="sr-btn-sm sr-btn-view"
                              onClick={() => setDetailReturn(sr)}
                            >
                              View
                            </button>
                            {sr.status === "pending_admin_approval" && (
                              <>
                                <button
                                  className="sr-btn-sm sr-btn-approve"
                                  onClick={() => { setApproveModal(sr); setApproveForm({ adminRemarks: "", deliveryManId: "" }); }}
                                >
                                  Approve
                                </button>
                                <button
                                  className="sr-btn-sm sr-btn-reject"
                                  onClick={() => { setRejectModal(sr); setRejectForm({ adminRemarks: "" }); }}
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            {sr.status === "approved" && (
                              <button
                                className="sr-btn-sm sr-btn-assign"
                                onClick={() => { setAssignModal(sr); setAssignDeliveryManId(""); }}
                              >
                                Assign Pickup
                              </button>
                            )}
                            {["pending_admin_approval", "approved"].includes(sr.status) && (
                              <button
                                className="sr-btn-sm sr-btn-cancel"
                                onClick={() => handleCancel(sr._id)}
                              >
                                Cancel
                              </button>
                            )}
                            {sr.status === "completed" && sr.returnInvoiceNumber && (
                              <button
                                className="sr-btn-sm sr-btn-invoice"
                                onClick={() => handleDownloadInvoice(sr)}
                              >
                                Invoice
                              </button>
                            )}
                          </div>
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

      {/* ── Detail Modal ─────────────────────────────────────── */}
      {detailReturn && (
        <div className="sr-modal-overlay" onClick={() => setDetailReturn(null)}>
          <div className="sr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sr-modal-header">
              <h3>Return Details</h3>
              <button className="sr-modal-close" onClick={() => setDetailReturn(null)}>×</button>
            </div>
            <div className="sr-modal-body">
              <div className="sr-detail-grid">
                <div><span>Customer</span><strong>{detailReturn.customer?.name}</strong></div>
                <div><span>Phone</span><strong>{detailReturn.customer?.phoneNumber || "—"}</strong></div>
                <div><span>Original Order</span><strong>{detailReturn.order?.invoiceNumber || "—"}</strong></div>
                <div><span>Status</span>
                  <span className={`sr-status-badge ${STATUS_COLORS[detailReturn.status]}`}>
                    {STATUS_LABELS[detailReturn.status]}
                  </span>
                </div>
                <div><span>Return Reason</span><strong>{detailReturn.returnReason || "—"}</strong></div>
                <div><span>Admin Remarks</span><strong>{detailReturn.adminRemarks || "—"}</strong></div>
                {detailReturn.assignedTo && (
                  <div><span>Assigned To</span><strong>{detailReturn.assignedTo.username}</strong></div>
                )}
                {detailReturn.returnInvoiceNumber && (
                  <div><span>Return Invoice</span>
                    <strong className="sr-return-inv">{detailReturn.returnInvoiceNumber}</strong>
                  </div>
                )}
                {detailReturn.refundAmount > 0 && (
                  <div><span>Refund Amount</span><strong>AED {detailReturn.refundAmount?.toFixed(2)}</strong></div>
                )}
                {detailReturn.refundMethod && detailReturn.refundMethod !== "none" && (
                  <div><span>Refund Method</span><strong>{detailReturn.refundMethod.replace(/_/g, " ")}</strong></div>
                )}
              </div>

              <h4 className="sr-items-title">Return Items</h4>
              <table className="sr-items-table">
                <thead>
                  <tr><th>Product</th><th>Unit</th><th>Qty</th><th>Price</th><th>VAT</th><th>Total</th></tr>
                </thead>
                <tbody>
                  {(detailReturn.returnItems || []).map((item, i) => (
                    <tr key={i}>
                      <td>{item.product?.productName || "—"}</td>
                      <td>{item.unit || "—"}</td>
                      <td>{item.returnedQuantity}</td>
                      <td>AED {(item.price || 0).toFixed(2)}</td>
                      <td>{item.vatPercentage || 5}%</td>
                      <td>AED {(item.totalAmount || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="5"><strong>Total Return Amount</strong></td>
                    <td><strong>AED {totalReturnAmt(detailReturn).toFixed(2)}</strong></td>
                  </tr>
                </tfoot>
              </table>

              {detailReturn.status === "completed" && detailReturn.returnInvoiceNumber && (
                <button
                  className="sr-btn-primary sr-mt"
                  onClick={() => { handleDownloadInvoice(detailReturn); setDetailReturn(null); }}
                >
                  Download Return Invoice
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Approve Modal ────────────────────────────────────── */}
      {approveModal && (
        <div className="sr-modal-overlay" onClick={() => setApproveModal(null)}>
          <div className="sr-modal sr-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="sr-modal-header">
              <h3>Approve Return</h3>
              <button className="sr-modal-close" onClick={() => setApproveModal(null)}>×</button>
            </div>
            <div className="sr-modal-body">
              <p className="sr-modal-info">
                Customer: <strong>{approveModal.customer?.name}</strong> |
                Amount: <strong>AED {totalReturnAmt(approveModal).toFixed(2)}</strong>
              </p>
              <div className="sr-form-group">
                <label>Admin Remarks (optional)</label>
                <textarea
                  rows="2"
                  value={approveForm.adminRemarks}
                  onChange={(e) => setApproveForm((p) => ({ ...p, adminRemarks: e.target.value }))}
                  placeholder="Add remarks..."
                  className="sr-textarea"
                />
              </div>
              <div className="sr-form-group">
                <label>Assign Delivery Man (optional — skip to approve without assigning)</label>
                <select
                  value={approveForm.deliveryManId}
                  onChange={(e) => setApproveForm((p) => ({ ...p, deliveryManId: e.target.value }))}
                  className="sr-select"
                >
                  <option value="">-- Assign later --</option>
                  {deliveryMen.map((d) => (
                    <option key={d._id} value={d._id}>{d.username}</option>
                  ))}
                </select>
              </div>
              <div className="sr-modal-actions">
                <button className="sr-btn-outline" onClick={() => setApproveModal(null)}>Cancel</button>
                <button className="sr-btn-approve-lg" onClick={handleApprove} disabled={processing}>
                  {processing ? "Approving..." : "Approve Return"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject Modal ─────────────────────────────────────── */}
      {rejectModal && (
        <div className="sr-modal-overlay" onClick={() => setRejectModal(null)}>
          <div className="sr-modal sr-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="sr-modal-header">
              <h3>Reject Return</h3>
              <button className="sr-modal-close" onClick={() => setRejectModal(null)}>×</button>
            </div>
            <div className="sr-modal-body">
              <p className="sr-modal-info">Customer: <strong>{rejectModal.customer?.name}</strong></p>
              <div className="sr-form-group">
                <label>Reason for Rejection</label>
                <textarea
                  rows="3"
                  value={rejectForm.adminRemarks}
                  onChange={(e) => setRejectForm({ adminRemarks: e.target.value })}
                  placeholder="Explain why the return is rejected..."
                  className="sr-textarea"
                />
              </div>
              <div className="sr-modal-actions">
                <button className="sr-btn-outline" onClick={() => setRejectModal(null)}>Cancel</button>
                <button className="sr-btn-reject-lg" onClick={handleReject} disabled={processing}>
                  {processing ? "Rejecting..." : "Reject Return"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Assign Pickup Modal ──────────────────────────────── */}
      {assignModal && (
        <div className="sr-modal-overlay" onClick={() => setAssignModal(null)}>
          <div className="sr-modal sr-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="sr-modal-header">
              <h3>Assign Delivery Man</h3>
              <button className="sr-modal-close" onClick={() => setAssignModal(null)}>×</button>
            </div>
            <div className="sr-modal-body">
              <p className="sr-modal-info">
                Select a delivery man to pick up the returned goods from customer.
              </p>
              <div className="sr-form-group">
                <label>Delivery Man</label>
                <select
                  value={assignDeliveryManId}
                  onChange={(e) => setAssignDeliveryManId(e.target.value)}
                  className="sr-select"
                >
                  <option value="">-- Select --</option>
                  {deliveryMen.map((d) => (
                    <option key={d._id} value={d._id}>{d.username}</option>
                  ))}
                </select>
              </div>
              <div className="sr-modal-actions">
                <button className="sr-btn-outline" onClick={() => setAssignModal(null)}>Cancel</button>
                <button
                  className="sr-btn-primary"
                  onClick={handleAssignPickup}
                  disabled={processing || !assignDeliveryManId}
                >
                  {processing ? "Assigning..." : "Assign"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesReturn;
