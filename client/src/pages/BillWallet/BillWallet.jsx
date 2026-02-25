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
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState("Bill Wallet");
  const [user, setUser] = useState(null);
  const [processingId, setProcessingId] = useState(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [cashTx, setCashTx] = useState([]);
const [chequeTx, setChequeTx] = useState([]);

  // Search (shared across both tables)
  const [searchQuery, setSearchQuery] = useState("");

  // Selection - Not Yet Sent (received)
  const [selectedNotSent, setSelectedNotSent] = useState([]);
  const [selectAllNotSent, setSelectAllNotSent] = useState(false);

  // Selection - Pending Approval (sent by delivery/sales)
  const [selectedPending, setSelectedPending] = useState([]);
  const [selectAllPending, setSelectAllPending] = useState(false);

  // Modals
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [txToProcess, setTxToProcess] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null); // "accept", "reject", "mark-received"

  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkAction, setBulkAction] = useState(null); // "accept", "reject", "mark-received"

  const backendUrl = process.env.REACT_APP_BACKEND_IP;

  // Fetch user
  const fetchCurrentUser = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return window.location.href = "/login";
      const res = await axios.get(`${backendUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(res.data.user || res.data);
    } catch (err) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
  }, [backendUrl]);

  // Fetch all transactions
  const fetchTransactions = useCallback(async () => {
  try {
    setLoading(true);
    const token = localStorage.getItem("token");
    const res = await axios.get(`${backendUrl}/api/bill-transactions/admin-all`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const allTx = res.data;
    setTransactions(allTx);
    
    // Add these two lines to separate cash/cheque
    setCashTx(allTx.filter(t => t.method === "cash"));
    setChequeTx(allTx.filter(t => t.method === "cheque"));
  } catch (error) {
    console.error("Error fetching transactions:", error);
    toast.error("Failed to load bill wallet data");
  } finally {
    setLoading(false);
  }
}, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchTransactions();
  }, [fetchCurrentUser, fetchTransactions]);

  // ────────────────────────────────────────────────
  // Filtered Data (with search)
  // ────────────────────────────────────────────────
  const filteredTransactions = useMemo(() => {
    if (!searchQuery.trim()) return transactions;

    const term = searchQuery.toLowerCase();
    return transactions.filter(tx => 
      tx.customer?.name?.toLowerCase().includes(term) ||
      tx.bill?._id?.toLowerCase().includes(term) ||
      tx.recipient?.username?.toLowerCase().includes(term)
    );
  }, [transactions, searchQuery]);

  // Not Yet Sent (received but not sent to admin)
  const notSentTx = useMemo(() => 
    filteredTransactions.filter(tx => tx.status === "received"),
  [filteredTransactions]);

  // Pending Approval (sent by delivery/sales)
  const pendingTx = useMemo(() => 
    filteredTransactions.filter(tx => tx.status === "pending"),
  [filteredTransactions]);

  // ────────────────────────────────────────────────
  // Selection Handlers - Not Sent
  // ────────────────────────────────────────────────
  const handleNotSentSelect = (txId) => {
    setSelectedNotSent(prev =>
      prev.includes(txId) ? prev.filter(id => id !== txId) : [...prev, txId]
    );
  };

  const handleSelectAllNotSent = () => {
    if (selectAllNotSent) {
      setSelectedNotSent([]);
    } else {
      setSelectedNotSent(notSentTx.map(tx => tx._id));
    }
    setSelectAllNotSent(!selectAllNotSent);
  };

  useEffect(() => {
    if (notSentTx.length > 0 && selectedNotSent.length === notSentTx.length) {
      setSelectAllNotSent(true);
    } else {
      setSelectAllNotSent(false);
    }
  }, [notSentTx, selectedNotSent]);

  // ────────────────────────────────────────────────
  // Selection Handlers - Pending
  // ────────────────────────────────────────────────
  const handlePendingSelect = (txId) => {
    setSelectedPending(prev =>
      prev.includes(txId) ? prev.filter(id => id !== txId) : [...prev, txId]
    );
  };

  const handleSelectAllPending = () => {
    if (selectAllPending) {
      setSelectedPending([]);
    } else {
      setSelectedPending(pendingTx.map(tx => tx._id));
    }
    setSelectAllPending(!selectAllPending);
  };

  useEffect(() => {
    if (pendingTx.length > 0 && selectedPending.length === pendingTx.length) {
      setSelectAllPending(true);
    } else {
      setSelectAllPending(false);
    }
  }, [pendingTx, selectedPending]);

  // ────────────────────────────────────────────────
  // Single Actions
  // ────────────────────────────────────────────────
  const handleAcceptClick = (txId) => {
    setTxToProcess(txId);
    setConfirmAction("accept");
    setShowConfirmModal(true);
  };

  const handleRejectClick = (txId) => {
    setTxToProcess(txId);
    setConfirmAction("reject");
    setShowConfirmModal(true);
  };

  const handleMarkReceivedClick = (txId) => {
    setTxToProcess(txId);
    setConfirmAction("mark-received");
    setShowConfirmModal(true);
  };

  // ────────────────────────────────────────────────
  // Bulk Actions
  // ────────────────────────────────────────────────
  const handleBulkAccept = () => {
    if (selectedPending.length === 0) {
      toast.error("No pending transactions selected");
      return;
    }
    setBulkAction("accept");
    setShowBulkModal(true);
  };

  const handleBulkReject = () => {
    if (selectedPending.length === 0) {
      toast.error("No pending transactions selected");
      return;
    }
    setBulkAction("reject");
    setShowBulkModal(true);
  };

  const handleBulkMarkReceived = () => {
    if (selectedNotSent.length === 0) {
      toast.error("No received (not sent) transactions selected");
      return;
    }
    setBulkAction("mark-received");
    setShowBulkModal(true);
  };

  // ────────────────────────────────────────────────
  // Confirm Handlers
  // ────────────────────────────────────────────────
  const confirmActionHandler = async () => {
    if (!txToProcess) return;
    setShowConfirmModal(false);
    setProcessingId(txToProcess);

    try {
      const token = localStorage.getItem("token");
      let endpoint = "";
      let successMessage = "";

      if (confirmAction === "accept") {
        endpoint = `${backendUrl}/api/bill-transactions/admin-accept/${txToProcess}`;
        successMessage = "Payment accepted – credited to admin";
      } else if (confirmAction === "reject") {
        endpoint = `${backendUrl}/api/bill-transactions/admin-reject/${txToProcess}`;
        successMessage = "Request rejected";
      } else if (confirmAction === "mark-received") {
        endpoint = `${backendUrl}/api/bill-transactions/admin-mark-received/${txToProcess}`;
        successMessage = "Marked as received – credited to admin";
      }

      await axios.post(endpoint, {}, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(successMessage);
      fetchTransactions();
    } catch (error) {
      console.error(`Error ${confirmAction}:`, error);
      toast.error(`Failed to ${confirmAction.replace("-", " ")}`);
    } finally {
      setProcessingId(null);
      setTxToProcess(null);
      setConfirmAction(null);
    }
  };

  const confirmBulkAction = async () => {
    setShowBulkModal(false);
    setBulkProcessing(true);

    try {
      const token = localStorage.getItem("token");
      let success = 0, fail = 0;
      const selected = bulkAction === "mark-received" ? selectedNotSent : selectedPending;

      for (const txId of selected) {
        const tx = transactions.find(t => t._id === txId);
        if (!tx) continue;

        if (bulkAction === "mark-received" && tx.status !== "received") continue;
        if ((bulkAction === "accept" || bulkAction === "reject") && tx.status !== "pending") continue;

        try {
          let endpoint = "";
          if (bulkAction === "accept") {
            endpoint = `${backendUrl}/api/bill-transactions/admin-accept/${txId}`;
          } else if (bulkAction === "reject") {
            endpoint = `${backendUrl}/api/bill-transactions/admin-reject/${txId}`;
          } else if (bulkAction === "mark-received") {
            endpoint = `${backendUrl}/api/bill-transactions/admin-mark-received/${txId}`;
          }

          await axios.post(endpoint, {}, { headers: { Authorization: `Bearer ${token}` } });
          success++;
        } catch (err) {
          fail++;
        }
      }

      if (success > 0) {
        toast.success(`${success} transaction(s) ${bulkAction === "mark-received" ? "marked as received" : bulkAction + "ed"}`);
      }
      if (fail > 0) toast.error(`${fail} failed`);
      fetchTransactions();
    } catch (err) {
      toast.error("Bulk operation failed");
    } finally {
      setBulkProcessing(false);
      setSelectedNotSent([]);
      setSelectedPending([]);
      setSelectAllNotSent(false);
      setSelectAllPending(false);
      setBulkAction(null);
    }
  };

  // Totals
  const adminCollectedTotal = (list) =>
    list.filter(t => t.status === "paid_to_admin").reduce((sum, t) => sum + t.amount, 0);

  const cashCollected = adminCollectedTotal(cashTx);
  const chequeCollected = adminCollectedTotal(chequeTx);
  const grandCollected = cashCollected + chequeCollected;

  const pendingTotal = (list) =>
    list.filter(t => t.status === "pending").reduce((sum, t) => sum + t.amount, 0);

  const cashPending = pendingTotal(cashTx);
  const chequePending = pendingTotal(chequeTx);
  const grandPending = cashPending + chequePending;

  const receivedNotSentTotal = (list) =>
    list.filter(t => t.status === "received").reduce((sum, t) => sum + t.amount, 0);

  const cashReceivedNotSent = receivedNotSentTotal(cashTx);
  const chequeReceivedNotSent = receivedNotSentTotal(chequeTx);

  if (!user) return <div className="loading">Loading...</div>;

  return (
    <div className="bill-wallet-layout">
      <Header sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} user={user} />
      <Sidebar isOpen={sidebarOpen} activeItem={activeItem} onSetActiveItem={setActiveItem} onClose={() => setSidebarOpen(false)} user={user} />
      
      <main className={`bill-wallet-main ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="bill-wallet-container">
          <h2 className="page-title">Bill Wallet – Delivery/Sales Payments</h2>

          {/* Summary Cards */}
          <div className="summary-cards">
            <div className="summary-card grand">
              <h4>Total Collected by Admin</h4>
              <div className="amount">
                <img src={DirhamSymbol} alt="AED" width={32} />
                <span>{grandCollected.toFixed(2)}</span>
              </div>
            </div>
            <div className="summary-card pending">
              <h4>Pending Approval (Sent by Delivery/Sales)</h4>
              <div className="amount">
                <img src={DirhamSymbol} alt="AED" width={24} />
                <span>{grandPending.toFixed(2)}</span>
              </div>
            </div>
            <div className="summary-card received-not-sent">
              <h4>Received (Not Yet Sent by Delivery/Sales)</h4>
              <div className="amount">
                <img src={DirhamSymbol} alt="AED" width={24} />
                <span>{(cashReceivedNotSent + chequeReceivedNotSent).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Shared Search Bar */}
          <div className="search-box-wrapper">
            <input
              type="text"
              placeholder="Search by customer, bill ID, or delivery/sales..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="search-input"
            />
            {searchQuery && (
              <button className="search-clear" onClick={() => setSearchQuery("")}>✕</button>
            )}
          </div>

          {/* ─── Table 1: Received (Not Yet Sent) ──────────────────────────────── */}
          <div className="table-section">
            <h3>Received (Not Yet Sent by Delivery/Sales)</h3>

            {selectedNotSent.length > 0 && (
              <div className="bulk-action-bar">
                <span>{selectedNotSent.length} selected</span>
                <button className="bulk-mark-btn" onClick={handleBulkMarkReceived} disabled={bulkProcessing}>
                  {bulkProcessing ? "Processing..." : "Mark Selected as Received"}
                </button>
                <button className="bulk-clear-btn" onClick={() => {
                  setSelectedNotSent([]);
                  setSelectAllNotSent(false);
                }}>
                  Clear
                </button>
              </div>
            )}

            {loading ? (
              <div className="loading">Loading...</div>
            ) : notSentTx.length === 0 ? (
              <div className="no-data">No received (not sent) transactions</div>
            ) : (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="checkbox-col">
                        <input
                          type="checkbox"
                          checked={selectAllNotSent}
                          onChange={handleSelectAllNotSent}
                        />
                      </th>
                      <th>No</th>
                      <th>Delivery/Sales</th>
                      <th>Customer</th>
                      <th>Bill ID</th>
                      <th>Amount (AED)</th>
                      <th>Method</th>
                      <th>Cheque Details</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notSentTx.map((tx, idx) => (
                      <tr key={tx._id} className={selectedNotSent.includes(tx._id) ? "selected-row" : "received-row"}>
                        <td className="checkbox-col">
                          <input
                            type="checkbox"
                            checked={selectedNotSent.includes(tx._id)}
                            onChange={() => handleNotSentSelect(tx._id)}
                          />
                        </td>
                        <td>{idx + 1}</td>
                        <td>{tx.recipient?.username || "N/A"} ({tx.recipientType})</td>
                        <td>{tx.customer?.name || "N/A"}</td>
                        <td>{tx.bill?._id?.slice(-8) || "N/A"}</td>
                        <td>{tx.amount.toFixed(2)}</td>
                        <td>{tx.method.charAt(0).toUpperCase() + tx.method.slice(1)}</td>
                        <td>
                          {tx.method === "cheque" && tx.chequeDetails ? (
                            <div className="cheque-info">
                              <div><strong>No:</strong> {tx.chequeDetails.number || "-"}</div>
                              <div><strong>Bank:</strong> {tx.chequeDetails.bank || "-"}</div>
                              <div><strong>Date:</strong> {tx.chequeDetails.date ? new Date(tx.chequeDetails.date).toLocaleDateString() : "-"}</div>
                            </div>
                          ) : "-"}
                        </td>
                        <td>{new Date(tx.createdAt).toLocaleDateString()}</td>
                        <td>
                          <span className="status-badge status-received">Received (Not Sent)</span>
                        </td>
                        <td>
                          <button 
                            className="mark-received-btn" 
                            onClick={() => handleMarkReceivedClick(tx._id)} 
                            disabled={processingId === tx._id}
                          >
                            Mark as Received
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ─── Table 2: Pending Approval (Sent by Delivery/Sales) ──────────────── */}
          <div className="table-section">
            <h3>Pending Approval (Sent by Delivery/Sales)</h3>

            {selectedPending.length > 0 && (
              <div className="bulk-action-bar">
                <span>{selectedPending.length} selected</span>
                <button className="bulk-accept-btn" onClick={handleBulkAccept} disabled={bulkProcessing}>
                  {bulkProcessing ? "Processing..." : "Accept Selected"}
                </button>
                <button className="bulk-reject-btn" onClick={handleBulkReject} disabled={bulkProcessing}>
                  {bulkProcessing ? "Processing..." : "Reject Selected"}
                </button>
                <button className="bulk-clear-btn" onClick={() => {
                  setSelectedPending([]);
                  setSelectAllPending(false);
                }}>
                  Clear
                </button>
              </div>
            )}

            {loading ? (
              <div className="loading">Loading...</div>
            ) : pendingTx.length === 0 ? (
              <div className="no-data">No pending approval requests</div>
            ) : (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="checkbox-col">
                        <input
                          type="checkbox"
                          checked={selectAllPending}
                          onChange={handleSelectAllPending}
                        />
                      </th>
                      <th>No</th>
                      <th>Delivery/Sales</th>
                      <th>Customer</th>
                      <th>Bill ID</th>
                      <th>Amount (AED)</th>
                      <th>Method</th>
                      <th>Cheque Details</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingTx.map((tx, idx) => (
                      <tr key={tx._id} className={selectedPending.includes(tx._id) ? "selected-row" : "pending-row"}>
                        <td className="checkbox-col">
                          <input
                            type="checkbox"
                            checked={selectedPending.includes(tx._id)}
                            onChange={() => handlePendingSelect(tx._id)}
                          />
                        </td>
                        <td>{idx + 1}</td>
                        <td>{tx.recipient?.username || "N/A"} ({tx.recipientType})</td>
                        <td>{tx.customer?.name || "N/A"}</td>
                        <td>{tx.bill?._id?.slice(-8) || "N/A"}</td>
                        <td>{tx.amount.toFixed(2)}</td>
                        <td>{tx.method.charAt(0).toUpperCase() + tx.method.slice(1)}</td>
                        <td>
                          {tx.method === "cheque" && tx.chequeDetails ? (
                            <div className="cheque-info">
                              <div><strong>No:</strong> {tx.chequeDetails.number || "-"}</div>
                              <div><strong>Bank:</strong> {tx.chequeDetails.bank || "-"}</div>
                              <div><strong>Date:</strong> {tx.chequeDetails.date ? new Date(tx.chequeDetails.date).toLocaleDateString() : "-"}</div>
                            </div>
                          ) : "-"}
                        </td>
                        <td>{new Date(tx.createdAt).toLocaleDateString()}</td>
                        <td>
                          <span className="status-badge status-pending">Pending Approval</span>
                        </td>
                        <td>
                          <div className="action-buttons">
                            <button className="accept-btn" onClick={() => handleAcceptClick(tx._id)} disabled={processingId === tx._id}>
                              Accept
                            </button>
                            <button className="reject-btn" onClick={() => handleRejectClick(tx._id)} disabled={processingId === tx._id}>
                              Reject
                            </button>
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

      {/* Single Action Confirmation Modal */}
      {showConfirmModal && (
        <div className="confirm-overlay">
          <div className="confirm-modal">
            <h3>
              {confirmAction === "accept" ? "Accept Payment" :
               confirmAction === "reject" ? "Reject Payment" :
               "Mark as Received"}
            </h3>
            <p>
              {confirmAction === "accept"
                ? "Are you sure you received this amount? It will be credited to admin wallet."
                : confirmAction === "reject"
                ? "Are you sure you want to reject? Delivery/sales can resend."
                : "Are you sure you received this amount directly? It will be credited to admin wallet."}
            </p>
            <div className="actions">
              <button className="cancel" onClick={() => setShowConfirmModal(false)}>Cancel</button>
              <button
                className={
                  confirmAction === "accept" ? "confirm-accept" :
                  confirmAction === "reject" ? "confirm-reject" :
                  "confirm-mark-received"
                }
                onClick={confirmActionHandler}
                disabled={processingId === txToProcess}
              >
                {processingId === txToProcess ? "Processing..." :
                 confirmAction === "accept" ? "Yes, Accept" :
                 confirmAction === "reject" ? "Yes, Reject" :
                 "Yes, Mark as Received"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Action Confirmation Modal */}
      {showBulkModal && (
        <div className="confirm-overlay">
          <div className="confirm-modal bulk-modal">
            <h3>
              {bulkAction === "accept" ? "Accept Selected?" :
               bulkAction === "reject" ? "Reject Selected?" :
               "Mark Selected as Received?"}
            </h3>
            <p>
              Are you sure you want to {bulkAction} the selected {bulkAction === "mark-received" ? selectedNotSent.length : selectedPending.length} transaction(s)?
            </p>
            <div className="actions">
              <button className="cancel" onClick={() => setShowBulkModal(false)}>Cancel</button>
              <button
                className="confirm-confirm"
                onClick={confirmBulkAction}
                disabled={bulkProcessing}
              >
                {bulkProcessing ? "Processing..." : "Yes, Proceed"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillWallet;