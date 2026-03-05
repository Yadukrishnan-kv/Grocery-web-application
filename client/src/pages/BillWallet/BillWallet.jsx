// src/pages/Admin/BillWallet.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import Header from "../../components/layout/Header/Header";
import Sidebar from "../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../Assets/aed-symbol.png";
import toast from "react-hot-toast";
import axios from "axios";
import "./BillWallet.css";

const BillWallet = () => {
  const [transactions, setTransactions] = useState([]);
  const [adminRequests, setAdminRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState("Bill Wallet");
  const [user, setUser] = useState(null);

  // Processing states – used on buttons
  const [processingId, setProcessingId] = useState(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // Search (shared)
  const [searchQuery, setSearchQuery] = useState("");

  // Selections
  const [selectedReceived, setSelectedReceived] = useState([]);
  const [selectAllReceived, setSelectAllReceived] = useState(false);
  const [selectedRequests, setSelectedRequests] = useState([]);
  const [selectAllRequests, setSelectAllRequests] = useState(false);

  // Method modal (mark received)
  const [showMethodModal, setShowMethodModal] = useState(false);
  const [modalAction, setModalAction] = useState(null); // "mark-received" | "bulk-mark-received"
  const [modalTxId, setModalTxId] = useState(null);
  const [method, setMethod] = useState("cash");
  const [chequeDetails, setChequeDetails] = useState({ number: "", bank: "", date: "" });

  // Accept/Reject confirmation modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [txToProcess, setTxToProcess] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null); // "accept" | "reject"

  const backendUrl = process.env.REACT_APP_BACKEND_IP;

  const fetchCurrentUser = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return (window.location.href = "/login");
      const res = await axios.get(`${backendUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(res.data.user || res.data);
    } catch (err) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
  }, [backendUrl]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");

      const [txRes, reqRes] = await Promise.all([
        axios.get(`${backendUrl}/api/bill-transactions/admin-all`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${backendUrl}/api/bill-transactions/admin-pending`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      setTransactions(txRes.data);
      setAdminRequests(reqRes.data);

      setSelectedReceived([]);
      setSelectedRequests([]);
      setSelectAllReceived(false);
      setSelectAllRequests(false);
    } catch (err) {
      console.error("Fetch error:", err);
      toast.error("Failed to load bill wallet data");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchData();
  }, [fetchCurrentUser, fetchData]);

  // Filtered data
  const filteredTransactions = useMemo(() => {
    if (!searchQuery.trim()) return transactions;
    const term = searchQuery.toLowerCase();
    return transactions.filter(tx =>
      tx.customer?.name?.toLowerCase().includes(term) ||
      tx.bill?._id?.toLowerCase().includes(term) ||
      tx.recipient?.username?.toLowerCase().includes(term) ||
      tx.invoiceNumber?.toLowerCase().includes(term)
    );
  }, [transactions, searchQuery]);

  const receivedTx = useMemo(() => 
    filteredTransactions.filter(t => t.status === "received"), 
    [filteredTransactions]
  );

  const paidTx = useMemo(() => 
    filteredTransactions.filter(t => t.status === "paid_to_admin"), 
    [filteredTransactions]
  );

  const filteredRequests = useMemo(() => {
    if (!searchQuery.trim()) return adminRequests;
    const term = searchQuery.toLowerCase();
    return adminRequests.filter(req =>
      req.transaction?.customer?.name?.toLowerCase().includes(term) ||
      req.sender?.username?.toLowerCase().includes(term) ||
      req.transaction?.invoiceNumber?.toLowerCase().includes(term)
    );
  }, [adminRequests, searchQuery]);

  // Totals
  const receivedFilteredTotal = useMemo(() => 
    receivedTx.reduce((sum, t) => sum + t.amount, 0), 
    [receivedTx]
  );

  const requestsFilteredTotal = useMemo(() => 
    filteredRequests.reduce((sum, r) => sum + (r.amount || r.transaction?.amount || 0), 0), 
    [filteredRequests]
  );

  const selectedReceivedTotal = useMemo(() => 
    receivedTx.filter(t => selectedReceived.includes(t._id))
      .reduce((sum, t) => sum + t.amount, 0), 
    [receivedTx, selectedReceived]
  );

  const selectedRequestsTotal = useMemo(() => 
    filteredRequests.filter(r => selectedRequests.includes(r._id))
      .reduce((sum, r) => sum + (r.amount || r.transaction?.amount || 0), 0), 
    [filteredRequests, selectedRequests]
  );

  // Selection handlers - Received
  const toggleSelectReceived = (id) => {
    setSelectedReceived(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleAllReceived = () => {
    if (selectAllReceived) {
      setSelectedReceived([]);
    } else {
      setSelectedReceived(receivedTx.map(t => t._id));
    }
    setSelectAllReceived(!selectAllReceived);
  };

  useEffect(() => {
    setSelectAllReceived(receivedTx.length > 0 && selectedReceived.length === receivedTx.length);
  }, [receivedTx, selectedReceived]);

  // Selection handlers - Requests
  const toggleSelectRequest = (id) => {
    setSelectedRequests(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleAllRequests = () => {
    if (selectAllRequests) {
      setSelectedRequests([]);
    } else {
      setSelectedRequests(filteredRequests.map(r => r._id));
    }
    setSelectAllRequests(!selectAllRequests);
  };

  useEffect(() => {
    setSelectAllRequests(filteredRequests.length > 0 && selectedRequests.length === filteredRequests.length);
  }, [filteredRequests, selectedRequests]);

  // Method modal (mark received)
  const openMethodModal = (action, txId = null) => {
    setModalAction(action);
    setModalTxId(txId);
    setMethod("cash");
    setChequeDetails({ number: "", bank: "", date: "" });
    setShowMethodModal(true);
  };

  const closeMethodModal = () => {
    setShowMethodModal(false);
    setModalAction(null);
    setModalTxId(null);
  };

  const submitMethod = async () => {
    if (method === "cheque" && (!chequeDetails.number || !chequeDetails.bank || !chequeDetails.date)) {
      return toast.error("Please fill all cheque details");
    }

    closeMethodModal();
    setBulkProcessing(true);

    try {
      const token = localStorage.getItem("token");
      let success = 0, fail = 0;
      const ids = modalAction === "bulk-mark-received" ? selectedReceived : (modalTxId ? [modalTxId] : []);

      for (const txId of ids) {
        try {
          await axios.post(
            `${backendUrl}/api/bill-transactions/admin-mark-received/${txId}`,
            {
              method,
              chequeDetails: method === "cheque" ? chequeDetails : undefined,
            },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          success++;
        } catch (err) {
          fail++;
        }
      }

      if (success > 0) toast.success(`${success} marked as received`);
      if (fail > 0) toast.error(`${fail} failed`);
      fetchData();
    } catch (err) {
      toast.error("Operation failed");
    } finally {
      setBulkProcessing(false);
      if (modalAction === "bulk-mark-received") {
        setSelectedReceived([]);
        setSelectAllReceived(false);
      }
    }
  };

  // Accept/Reject
  const handleAccept = (txId) => {
    setTxToProcess(txId);
    setConfirmAction("accept");
    setShowConfirmModal(true);
  };

  const handleReject = (txId) => {
    setTxToProcess(txId);
    setConfirmAction("reject");
    setShowConfirmModal(true);
  };

  const confirmSingle = async () => {
    if (!txToProcess) return;
    setShowConfirmModal(false);
    setProcessingId(txToProcess);

    try {
      const token = localStorage.getItem("token");
      const endpoint = confirmAction === "accept"
        ? `${backendUrl}/api/bill-transactions/admin-accept/${txToProcess}`
        : `${backendUrl}/api/bill-transactions/admin-reject/${txToProcess}`;

      await axios.post(endpoint, {}, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(confirmAction === "accept" ? "Accepted – credited" : "Rejected");
      fetchData();
    } catch (err) {
      toast.error("Action failed");
    } finally {
      setProcessingId(null);
      setTxToProcess(null);
      setConfirmAction(null);
    }
  };

  const handleBulkAcceptReject = (action) => {
    if (selectedRequests.length === 0) {
      toast.error("No pending requests selected");
      return;
    }
    setConfirmAction(action);
    setShowConfirmModal(true);
  };

  const confirmBulkAcceptReject = async () => {
    setShowConfirmModal(false);
    setBulkProcessing(true);

    try {
      const token = localStorage.getItem("token");
      let success = 0, fail = 0;

      for (const reqId of selectedRequests) {
        try {
          const endpoint = confirmAction === "accept"
            ? `${backendUrl}/api/bill-transactions/admin-accept/${reqId}`
            : `${backendUrl}/api/bill-transactions/admin-reject/${reqId}`;
          await axios.post(endpoint, {}, { headers: { Authorization: `Bearer ${token}` } });
          success++;
        } catch (err) {
          fail++;
        }
      }

      toast.success(`${success} request${success !== 1 ? "s" : ""} ${confirmAction}ed`);
      if (fail > 0) toast.error(`${fail} failed`);
      fetchData();
    } catch (err) {
      toast.error("Bulk action failed");
    } finally {
      setBulkProcessing(false);
      setSelectedRequests([]);
      setSelectAllRequests(false);
      setConfirmAction(null);
    }
  };

  // Collected total
  const paidTotal = useMemo(() => 
    paidTx.reduce((sum, t) => sum + t.amount, 0), 
    [paidTx]
  );

  if (!user) return <div className="loading">Loading...</div>;

  return (
    <div className="bill-wallet-layout">
      <Header sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} user={user} />
      <Sidebar 
        isOpen={sidebarOpen} 
        activeItem={activeItem} 
        onSetActiveItem={setActiveItem} 
        onClose={() => setSidebarOpen(false)} 
        user={user} 
      />
      <main className={`bill-wallet-main ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="bill-wallet-container">
          <h2 className="page-title">Bill Wallet – Admin</h2>

          {/* Summary Cards */}
          <div className="summary-cards">
            <div className="summary-card">
              <h4>Total Collected</h4>
              <div className="amount">
                <img src={DirhamSymbol} alt="AED" width={28} />
                <span>{paidTotal.toFixed(2)}</span>
              </div>
            </div>
            <div className="summary-card received">
              <h4>Received (Not Sent)</h4>
              <div className="amount">
                <img src={DirhamSymbol} alt="AED" width={24} />
                <span>{receivedFilteredTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Shared Search */}
          <div className="search-box-wrapper">
            <input
              type="text"
              placeholder="Search customer, invoice, delivery/sales..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
            {searchQuery && <button onClick={() => setSearchQuery("")} className="search-clear">✕</button>}
          </div>

          {/* Received (Not Yet Sent) Section */}
          <div className="table-section">
            <h3>Received (Not Yet Sent)</h3>

            {searchQuery.trim() && (
              <div className="filtered-summary">
                Showing <strong>{receivedTx.length}</strong> received transaction(s) — 
                Total: <strong>AED {receivedFilteredTotal.toFixed(2)}</strong>
              </div>
            )}

            {selectedReceived.length > 0 && (
              <div className="bulk-action-bar">
                <span>
                  {selectedReceived.length} selected — Total:{" "}
                  <strong>AED {selectedReceivedTotal.toFixed(2)}</strong>
                </span>
                <button 
                  className="bulk-mark-btn" 
                  onClick={() => openMethodModal("bulk-mark-received")}
                  disabled={bulkProcessing}
                >
                  {bulkProcessing ? "Processing..." : "Mark Selected as Received"}
                </button>
                <button 
                  className="bulk-clear-btn" 
                  onClick={() => { setSelectedReceived([]); setSelectAllReceived(false); }}
                >
                  Clear
                </button>
              </div>
            )}

            {loading ? (
              <div className="loading">Loading...</div>
            ) : receivedTx.length === 0 ? (
              <div className="no-data">No received (not sent) transactions</div>
            ) : (
              <div className="table-responsive">
                <table className="requests-table">
                  <thead>
                    <tr>
                      <th className="checkbox-col">
                        <input type="checkbox" checked={selectAllReceived} onChange={toggleAllReceived} />
                      </th>
                      <th>No</th>
                      <th>Delivery/Sales</th>
                      <th>Customer</th>
                      <th>Invoice #</th>
                      <th>Amount</th>
                      <th>Method</th>
                      <th>Cheque Details</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receivedTx.map((tx, idx) => {
                      const invoiceNo = tx.invoiceNumber || tx.bill?.invoiceNumber || tx.order?.invoiceNumber || "N/A";
                      const isProcessing = processingId === tx._id;
                      return (
                        <tr key={tx._id} className={selectedReceived.includes(tx._id) ? "selected-row" : ""}>
                          <td className="checkbox-col">
                            <input 
                              type="checkbox" 
                              checked={selectedReceived.includes(tx._id)} 
                              onChange={() => toggleSelectReceived(tx._id)} 
                              disabled={bulkProcessing || isProcessing}
                            />
                          </td>
                          <td>{idx + 1}</td>
                          <td>{tx.recipient?.username || "—"} <small>({tx.recipientType})</small></td>
                          <td>{tx.customer?.name || "—"}</td>
                          <td><strong>{invoiceNo}</strong></td>
                          <td>{tx.amount.toFixed(2)}</td>
                          <td>{tx.method?.toUpperCase() || "—"}</td>
                          <td>{tx.chequeDetails ? "Yes" : "—"}</td>
                          <td>{new Date(tx.createdAt).toLocaleDateString()}</td>
                          <td><span className="status-badge status-received">Received</span></td>
                          <td>
                            <button 
                              className="mark-received-btn" 
                              onClick={() => openMethodModal("mark-received", tx._id)}
                              disabled={processingId || bulkProcessing || isProcessing}
                            >
                              {isProcessing ? "Processing..." : "Mark Received"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pending Approval Section */}
          <div className="table-section">
            <h3>Pending Approval (Sent by Delivery/Sales)</h3>

            {searchQuery.trim() && (
              <div className="filtered-summary">
                Showing <strong>{filteredRequests.length}</strong> pending request(s) — 
                Total: <strong>AED {requestsFilteredTotal.toFixed(2)}</strong>
              </div>
            )}

            {selectedRequests.length > 0 && (
              <div className="bulk-action-bar">
                <span>
                  {selectedRequests.length} selected — Total:{" "}
                  <strong>AED {selectedRequestsTotal.toFixed(2)}</strong>
                </span>
                <button 
                  className="bulk-accept-btn" 
                  onClick={() => handleBulkAcceptReject("accept")}
                  disabled={bulkProcessing}
                >
                  {bulkProcessing ? "Processing..." : "Accept Selected"}
                </button>
                <button 
                  className="bulk-reject-btn" 
                  onClick={() => handleBulkAcceptReject("reject")}
                  disabled={bulkProcessing}
                >
                  {bulkProcessing ? "Processing..." : "Reject Selected"}
                </button>
                <button 
                  className="bulk-clear-btn" 
                  onClick={() => { setSelectedRequests([]); setSelectAllRequests(false); }}
                >
                  Clear
                </button>
              </div>
            )}

            {loading ? (
              <div className="loading">Loading...</div>
            ) : filteredRequests.length === 0 ? (
              <div className="no-data">No pending requests</div>
            ) : (
              <div className="table-responsive">
                <table className="requests-table">
                  <thead>
                    <tr>
                      <th className="checkbox-col">
                        <input type="checkbox" checked={selectAllRequests} onChange={toggleAllRequests} />
                      </th>
                      <th>No</th>
                      <th>Sent By</th>
                      <th>Customer</th>
                      <th>Invoice #</th>
                      <th>Amount</th>
                      <th>Method</th>
                      <th>Cheque Details</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRequests.map((req, idx) => {
                      const tx = req.transaction || {};
                      const invoiceNo = tx.invoiceNumber || tx.bill?.invoiceNumber || tx.order?.invoiceNumber || "N/A";
                      return (
                        <tr key={req._id} className={selectedRequests.includes(req._id) ? "selected-row" : ""}>
                          <td className="checkbox-col">
                            <input 
                              type="checkbox" 
                              checked={selectedRequests.includes(req._id)} 
                              onChange={() => toggleSelectRequest(req._id)} 
                              disabled={bulkProcessing}
                            />
                          </td>
                          <td>{idx + 1}</td>
                          <td>{req.sender?.username || "—"} <small>({req.sender?.role?.toLowerCase()})</small></td>
                          <td>{tx.customer?.name || "—"}</td>
                          <td><strong>{invoiceNo}</strong></td>
                          <td>{req.amount?.toFixed(2)}</td>
                          <td>{req.method?.toUpperCase() || "—"}</td>
                          <td>{req.chequeDetails ? "Yes" : "—"}</td>
                          <td>{new Date(req.createdAt).toLocaleDateString()}</td>
                          <td><span className="status-badge status-pending">Pending</span></td>
                          <td>
                            <div className="action-buttons">
                              <button 
                                className="accept-btn" 
                                onClick={() => handleAccept(tx._id || req._id)}
                                disabled={processingId || bulkProcessing}
                              >
                                Accept
                              </button>
                              <button 
                                className="reject-btn" 
                                onClick={() => handleReject(tx._id || req._id)}
                                disabled={processingId || bulkProcessing}
                              >
                                Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Collected (Paid to Admin) */}
          <div className="table-section">
            <h3>Collected (Paid to Admin)</h3>
            {loading ? (
              <div className="loading">Loading...</div>
            ) : paidTx.length === 0 ? (
              <div className="no-data">No payments collected yet</div>
            ) : (
              <div className="table-responsive">
                <table className="requests-table">
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>Sender</th>
                      <th>Customer</th>
                      <th>Invoice #</th>
                      <th>Amount</th>
                      <th>Method</th>
                      <th>Cheque Details</th>
                      <th>Date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paidTx.map((tx, idx) => {
                      const invoiceNo = tx.invoiceNumber || tx.bill?.invoiceNumber || tx.order?.invoiceNumber || "N/A";
                      return (
                        <tr key={tx._id}>
                          <td>{idx + 1}</td>
                          <td>{tx.recipient?.username || "—"} <small>({tx.recipientType})</small></td>
                          <td>{tx.customer?.name || "—"}</td>
                          <td><strong>{invoiceNo}</strong></td>
                          <td>{tx.amount.toFixed(2)}</td>
                          <td>{tx.method?.toUpperCase() || "—"}</td>
                          <td>{tx.chequeDetails ? "Yes" : "—"}</td>
                          <td>{new Date(tx.updatedAt || tx.createdAt).toLocaleDateString()}</td>
                          <td><span className="status-badge status-paid">Paid to Admin</span></td>
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

      {/* Method Modal – Mark Received (Single & Bulk) */}
      {showMethodModal && (
        <div className="pay-modal-overlay">
          <div className="pay-modal">
            <h3>
              {modalAction === "mark-received" 
                ? "Mark Payment as Received" 
                : `Mark ${selectedReceived.length} Payments as Received`}
            </h3>
            <div className="pay-modal-info">
              <p>
                <strong>Total Amount:</strong> AED{" "}
                {modalTxId 
                  ? transactions.find(t => t._id === modalTxId)?.amount?.toFixed(2) || "0.00"
                  : receivedTx.filter(t => selectedReceived.includes(t._id)).reduce((sum, t) => sum + t.amount, 0).toFixed(2)}
              </p>
            </div>
            <div className="pay-modal-input-group">
              <label>Payment Method</label>
              <select value={method} onChange={(e) => setMethod(e.target.value)} className="pay-modal-select">
                <option value="cash">Cash</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>
            {method === "cheque" && (
              <div className="pay-modal-cheque-group">
                <input 
                  placeholder="Cheque Number *" 
                  value={chequeDetails.number} 
                  onChange={(e) => setChequeDetails({...chequeDetails, number: e.target.value})} 
                />
                <input 
                  placeholder="Bank Name *" 
                  value={chequeDetails.bank} 
                  onChange={(e) => setChequeDetails({...chequeDetails, bank: e.target.value})} 
                />
                <input 
                  type="date" 
                  value={chequeDetails.date} 
                  onChange={(e) => setChequeDetails({...chequeDetails, date: e.target.value})} 
                />
              </div>
            )}
            <div className="pay-modal-actions">
              <button className="pay-modal-cancel" onClick={closeMethodModal} disabled={bulkProcessing}>
                Cancel
              </button>
              <button 
                className="pay-modal-confirm" 
                onClick={submitMethod} 
                disabled={bulkProcessing}
              >
                {bulkProcessing ? "Processing..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Accept/Reject Confirmation Modal */}
      {showConfirmModal && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal">
            <h3>{confirmAction === "accept" ? "Accept Request?" : "Reject Request?"}</h3>
            <p>
              {confirmAction === "accept" 
                ? "This will credit the amount to admin wallet."
                : "Delivery/Sales can resend the request."}
            </p>
            <div className="confirm-actions">
              <button className="confirm-cancel" onClick={() => setShowConfirmModal(false)}>
                Cancel
              </button>
              <button
                className={`confirm-${confirmAction}`}
                onClick={selectedRequests.length > 0 ? confirmBulkAcceptReject : confirmSingle}
                disabled={processingId || bulkProcessing}
              >
                {processingId || bulkProcessing ? "Processing..." : confirmAction === "accept" ? "Yes, Accept" : "Yes, Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillWallet;