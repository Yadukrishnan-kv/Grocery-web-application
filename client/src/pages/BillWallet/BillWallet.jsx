// src/pages/Admin/BillWallet.jsx
import React, { useState, useEffect, useCallback } from "react";
import Header from "../../components/layout/Header/Header";
import Sidebar from "../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../Assets/aed-symbol.png";
import toast from "react-hot-toast";
import axios from "axios";
import "./BillWallet.css";

const BillWallet = () => {
  const [transactions, setTransactions] = useState([]);
  const [cashTx, setCashTx] = useState([]);
  const [chequeTx, setChequeTx] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState("Bill Wallet");
  const [user, setUser] = useState(null);
  const [processingId, setProcessingId] = useState(null);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [txToProcess, setTxToProcess] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null); // "accept", "reject", OR "mark-received"

  const backendUrl = process.env.REACT_APP_BACKEND_IP;

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

  const fetchTransactions = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const res = await axios.get(`${backendUrl}/api/bill-transactions/admin-all`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const allTx = res.data;
      setTransactions(allTx);
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

  // Handle Accept (for pending transactions sent by delivery)
  const handleAcceptClick = (txId) => {
    setTxToProcess(txId);
    setConfirmAction("accept");
    setShowConfirmModal(true);
  };

  // Handle Reject (for pending transactions sent by delivery)
  const handleRejectClick = (txId) => {
    setTxToProcess(txId);
    setConfirmAction("reject");
    setShowConfirmModal(true);
  };

  // ✅ NEW: Handle Mark as Received (for received transactions NOT yet sent)
  const handleMarkReceivedClick = (txId) => {
    setTxToProcess(txId);
    setConfirmAction("mark-received");
    setShowConfirmModal(true);
  };

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
        successMessage = "Payment accepted – amount credited to admin";
      } else if (confirmAction === "reject") {
        endpoint = `${backendUrl}/api/bill-transactions/admin-reject/${txToProcess}`;
        successMessage = "Request rejected – delivery/sales can resend";
      } else if (confirmAction === "mark-received") {
        // ✅ NEW: Direct mark as received
        endpoint = `${backendUrl}/api/bill-transactions/admin-mark-received/${txToProcess}`;
        successMessage = "Payment marked as received – amount credited to admin";
      }

      await axios.post(endpoint, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });

      toast.success(successMessage);
      fetchTransactions(); // Refresh list & totals
    } catch (error) {
      console.error(`Error ${confirmAction}:`, error);
      toast.error(`Failed to ${confirmAction.replace("-", " ")}`);
    } finally {
      setProcessingId(null);
      setTxToProcess(null);
      setConfirmAction(null);
    }
  };

  // Totals: Admin collected (ONLY "paid_to_admin" status)
  const adminCollectedTotal = (list) =>
    list.filter(t => t.status === "paid_to_admin").reduce((sum, t) => sum + t.amount, 0);

  const cashCollected = adminCollectedTotal(cashTx);
  const chequeCollected = adminCollectedTotal(chequeTx);
  const grandCollected = cashCollected + chequeCollected;

  // Pending totals (for display only)
  const pendingTotal = (list) =>
    list.filter(t => t.status === "pending").reduce((sum, t) => sum + t.amount, 0);

  const cashPending = pendingTotal(cashTx);
  const chequePending = pendingTotal(chequeTx);
  const grandPending = cashPending + chequePending;

  // ✅ NEW: Received but not yet sent totals (for admin direct mark)
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
            <div className="summary-card cash">
              <h4>Cash Collected</h4>
              <div className="amount">
                <img src={DirhamSymbol} alt="AED" width={24} />
                <span>{cashCollected.toFixed(2)}</span>
              </div>
            </div>
            <div className="summary-card cheque">
              <h4>Cheque Collected</h4>
              <div className="amount">
                <img src={DirhamSymbol} alt="AED" width={24} />
                <span>{chequeCollected.toFixed(2)}</span>
              </div>
            </div>
            <div className="summary-card pending">
              <h4>Pending Approval (Sent by Delivery)</h4>
              <div className="amount">
                <img src={DirhamSymbol} alt="AED" width={24} />
                <span>{grandPending.toFixed(2)}</span>
              </div>
            </div>
            {/* ✅ NEW: Received but not yet sent */}
            <div className="summary-card received-not-sent">
              <h4>Received (Not Yet Sent by Delivery)</h4>
              <div className="amount">
                <img src={DirhamSymbol} alt="AED" width={24} />
                <span>{(cashReceivedNotSent + chequeReceivedNotSent).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="loading">Loading payments...</div>
          ) : transactions.length === 0 ? (
            <div className="no-data">No payments received yet</div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
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
                  {transactions.map((tx, idx) => (
                    <tr 
                      key={tx._id}
                      className={
                        tx.status === "pending" ? "pending-row" : 
                        tx.status === "paid_to_admin" ? "paid-row" :
                        tx.status === "received" ? "received-row" : ""
                      }
                    >
                      <td>{idx + 1}</td>
                      <td>
                        {tx.recipient?.username || "N/A"} <br />
                        <small>({tx.recipientType})</small>
                      </td>
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
                        <span className={`status-badge status-${tx.status}`}>
                          {tx.status === "received" ? "Received (Not Sent)" :
                           tx.status === "pending" ? "Pending Approval" :
                           tx.status === "paid_to_admin" ? "Paid to Admin" : "Unknown"}
                        </span>
                      </td>
                      <td>
                        {/* ✅ TWO ACTION PATHS */}
                        {tx.status === "pending" ? (
                          // Path 1: Delivery sent request → Admin Accept/Reject
                          <div className="action-buttons">
                            <button className="accept-btn" onClick={() => handleAcceptClick(tx._id)} disabled={processingId === tx._id}>
                              Accept
                            </button>
                            <button className="reject-btn" onClick={() => handleRejectClick(tx._id)} disabled={processingId === tx._id}>
                              Reject
                            </button>
                          </div>
                        ) : tx.status === "received" ? (
                          // Path 2: Delivery has money but hasn't sent → Admin can mark directly
                          <div className="action-buttons">
                            <button 
                              className="mark-received-btn" 
                              onClick={() => handleMarkReceivedClick(tx._id)} 
                              disabled={processingId === tx._id}
                              title="Mark as received (bypass delivery request)"
                            >
                              Mark as Received
                            </button>
                          </div>
                        ) : (
                          <span className="text-muted small">No action needed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Confirmation Modal – Supports 3 actions */}
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
                ? "Are you sure you want to reject? Delivery/sales can resend the request."
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
    </div>
  );
};

export default BillWallet;