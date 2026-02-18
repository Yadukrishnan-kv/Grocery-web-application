// src/pages/Admin/BillWallet.jsx
import React, { useState, useEffect, useCallback } from "react";
import Header from "../../components/layout/Header/Header";
import Sidebar from "../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../Assets/aed-symbol.png";
import toast from "react-hot-toast";
import axios from "axios";
import "./BillWallet.css";

const BillWallet = () => {
  const [transactions, setTransactions] = useState([]); // All BillTransaction records
  const [cashTx, setCashTx] = useState([]);
  const [chequeTx, setChequeTx] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState("Bill Wallet");
  const [user, setUser] = useState(null);
  const [processingId, setProcessingId] = useState(null);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [txToProcess, setTxToProcess] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null); // "accept" or "reject"

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

  // Fetch ALL bill transactions for admin view
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

  // Accept pending transaction
  const handleAcceptClick = (txId) => {
    setTxToProcess(txId);
    setConfirmAction("accept");
    setShowConfirmModal(true);
  };

  // Reject pending transaction (allow resend)
  const handleRejectClick = (txId) => {
    setTxToProcess(txId);
    setConfirmAction("reject");
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
  // ✅ Use transactionId in URL
  endpoint = `${backendUrl}/api/bill-transactions/admin-accept/${txToProcess}`;
  successMessage = "Payment accepted – amount credited to admin";
} else if (confirmAction === "reject") {
  endpoint = `${backendUrl}/api/bill-transactions/admin-reject/${txToProcess}`;
  successMessage = "Request rejected – delivery/sales can resend";
}

      await axios.post(endpoint, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });

      toast.success(successMessage);
      fetchTransactions(); // Refresh list & totals
    } catch (error) {
      console.error(`Error ${confirmAction}:`, error);
      toast.error(`Failed to ${confirmAction} request`);
    } finally {
      setProcessingId(null);
      setTxToProcess(null);
      setConfirmAction(null);
    }
  };

  // ✅ Totals: Admin collected (ONLY "paid_to_admin" status)
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

  if (!user) return <div className="loading">Loading...</div>;

  return (
    <div className="bill-wallet-layout">
      <Header
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        user={user}
      />
      <Sidebar
        isOpen={sidebarOpen}
        activeItem={activeItem}
        onSetActiveItem={setActiveItem}
        onClose={() => setSidebarOpen(false)}
        user={user}
      />
      <main className={`bill-wallet-main ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="bill-wallet-container">
          <h2 className="page-title">Bill Wallet – Delivery/Sales Payments</h2>

          {/* Summary Cards – Collected + Pending */}
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
              <h4>Total Pending Approval</h4>
              <div className="amount">
                <img src={DirhamSymbol} alt="AED" width={24} />
                <span>{grandPending.toFixed(2)}</span>
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
                      className={tx.status === "pending" ? "pending-row" : 
                                 tx.status === "paid_to_admin" ? "paid-row" : ""}
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
    {tx.status === "received" ? "Received" :
     tx.status === "pending" ? "Pending Approval" :
     tx.status === "paid_to_admin" ? "Paid to Admin" : "Unknown"}
  </span>
</td>
                      <td>
                        {tx.status === "pending" && (
                          <div className="action-buttons">
                            <button
                              className="accept-btn"
                              onClick={() => handleAcceptClick(tx._id)}
                              disabled={processingId === tx._id}
                            >
                              Accept
                            </button>
                            <button
                              className="reject-btn"
                              onClick={() => handleRejectClick(tx._id)}
                              disabled={processingId === tx._id}
                            >
                              Reject
                            </button>
                          </div>
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

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="confirm-overlay">
          <div className="confirm-modal">
            <h3>
              {confirmAction === "accept" ? "Accept Payment" : "Reject Payment"}
            </h3>
            <p>
              {confirmAction === "accept"
                ? "Are you sure you received this amount? It will be credited to admin wallet."
                : "Are you sure you want to reject? Delivery/sales can resend the request."}
            </p>
            <div className="actions">
              <button className="cancel" onClick={() => setShowConfirmModal(false)}>
                Cancel
              </button>
              <button
                className={confirmAction === "accept" ? "confirm-accept" : "confirm-reject"}
                onClick={confirmActionHandler}
                disabled={processingId === txToProcess}
              >
                {processingId === txToProcess ? "Processing..." :
                 confirmAction === "accept" ? "Yes, Accept" : "Yes, Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillWallet;