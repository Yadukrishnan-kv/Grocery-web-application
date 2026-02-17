// src/pages/Admin/WalletMoney.jsx
import React, { useState, useEffect, useCallback } from "react";
import Header from "../../components/layout/Header/Header";
import Sidebar from "../../components/layout/Sidebar/Sidebar";
import "./WalletMoney.css";
import axios from "axios";
import toast from 'react-hot-toast';
import DirhamSymbol from "../../Assets/aed-symbol.png";

const WalletMoney = () => {
  const [cashTransactions, setCashTransactions] = useState([]);
  const [chequeTransactions, setChequeTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState("Wallet Money");
  const [user, setUser] = useState(null);
  const [markingTxId, setMarkingTxId] = useState(null);
  
  // Separate filters for cash and cheque
  const [cashStatusFilter, setCashStatusFilter] = useState("all");
  const [chequeStatusFilter, setChequeStatusFilter] = useState("all");

  // Confirmation modal states (shared for both)
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [txToMark, setTxToMark] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null); // "accept", "reject", or "mark-received"

  const backendUrl = process.env.REACT_APP_BACKEND_IP;

  const fetchCurrentUser = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        window.location.href = "/login";
        return;
      }
      const response = await axios.get(`${backendUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(response.data.user || response.data);
    } catch (error) {
      console.error("Failed to load user", error);
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
  }, [backendUrl]);

  const fetchWalletMoney = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");

      const response = await axios.get(`${backendUrl}/api/wallet/admin/wallet-money`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const allTx = response.data;

      // Separate cash and cheque
      setCashTransactions(allTx.filter(tx => tx.method === "cash"));
      setChequeTransactions(allTx.filter(tx => tx.method === "cheque"));
    } catch (error) {
      console.error("Error fetching wallet money:", error);
      toast.error("Failed to load wallet transactions");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchWalletMoney();
  }, [fetchCurrentUser, fetchWalletMoney]);

  // ────────────────────────────────────────────────
  // Calculate totals (only "paid_to_admin" transactions)
  // ────────────────────────────────────────────────
  const cashTotal = cashTransactions
    .filter(tx => tx.status === "paid_to_admin")
    .reduce((sum, tx) => sum + tx.amount, 0);

  const chequeTotal = chequeTransactions
    .filter(tx => tx.status === "paid_to_admin")
    .reduce((sum, tx) => sum + tx.amount, 0);

  const grandTotal = cashTotal + chequeTotal;

  // ────────────────────────────────────────────────
  // Handle clicks for Accept / Reject / Mark Received
  // ────────────────────────────────────────────────
  const handleAcceptClick = (transactionId) => {
    setTxToMark(transactionId);
    setConfirmAction("accept");
    setShowConfirmModal(true);
  };

  const handleRejectClick = (transactionId) => {
    setTxToMark(transactionId);
    setConfirmAction("reject");
    setShowConfirmModal(true);
  };

  const handleMarkReceivedClick = (transactionId) => {
    setTxToMark(transactionId);
    setConfirmAction("mark-received");
    setShowConfirmModal(true);
  };

  const confirmActionHandler = async () => {
    if (!txToMark) return;

    setShowConfirmModal(false);
    setMarkingTxId(txToMark);

    try {
      const token = localStorage.getItem("token");
      let endpoint = "";
      let successMessage = "";

      if (confirmAction === "accept") {
        endpoint = `${backendUrl}/api/wallet/admin/accept-payment`;
        successMessage = "Payment accepted and marked as received.";
      } else if (confirmAction === "reject") {
        endpoint = `${backendUrl}/api/wallet/admin/reject-payment`;
        successMessage = "Payment request rejected.";
      } else if (confirmAction === "mark-received") {
        endpoint = `${backendUrl}/api/wallet/admin/mark-received`;
        successMessage = "Transaction marked as received successfully.";
      }

      await axios.post(
        endpoint,
        { transactionId: txToMark },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success(successMessage);
      fetchWalletMoney();
    } catch (error) {
      console.error(`Error ${confirmAction}ing payment:`, error);
      toast.error(`Failed to ${confirmAction.replace("-", " ")} payment`);
    } finally {
      setMarkingTxId(null);
      setTxToMark(null);
      setConfirmAction(null);
    }
  };

  // Filter cash transactions
  const filteredCashTransactions = cashTransactions.filter(tx => {
    if (cashStatusFilter === "all") return true;
    return tx.status === cashStatusFilter;
  });

  // Filter cheque transactions
  const filteredChequeTransactions = chequeTransactions.filter(tx => {
    if (chequeStatusFilter === "all") return true;
    return tx.status === chequeStatusFilter;
  });

  if (!user) {
    return <div className="wallet-money-loading">Loading...</div>;
  }

  return (
    <div className="wallet-money-layout">
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
      <main className={`wallet-money-main-content ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="wallet-money-container-wrapper">
          <div className="wallet-money-container">
            <h2 className="wallet-money-page-title">Admin Wallet Overview</h2>

            {/* ──────────────────────────────
                GRAND TOTAL + SUMMARY CARDS
            ────────────────────────────── */}
            <div className="wallet-summary-cards">
              {/* Grand Total */}
              <div className="summary-card grand-total">
                <div className="summary-icon">💰</div>
                <h4>Total Money Collected</h4>
                <div className="summary-amount grand">
                  <img src={DirhamSymbol} alt="AED" width={36} height={36} />
                  <span>{grandTotal.toFixed(2)}</span>
                </div>
              </div>

              {/* Cash Total */}
              <div className="summary-card cash">
                <div className="summary-icon">💵</div>
                <h4>Total Cash Collected</h4>
                <div className="summary-amount">
                  <img src={DirhamSymbol} alt="AED" width={28} height={28} />
                  <span>{cashTotal.toFixed(2)}</span>
                </div>
              </div>

              {/* Cheque Total */}
              <div className="summary-card cheque">
                <div className="summary-icon">📄</div>
                <h4>Total Cheque Collected</h4>
                <div className="summary-amount">
                  <img src={DirhamSymbol} alt="AED" width={28} height={28} />
                  <span>{chequeTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* ──────────────────────────────
                CASH TRANSACTIONS TABLE
            ────────────────────────────── */}
            <div className="wallet-section">
              <h3 className="section-title">Cash Payments Received</h3>

              <div className="wallet-money-filter">
                <label>Filter Cash by Status: </label>
                <select 
                  value={cashStatusFilter} 
                  onChange={(e) => setCashStatusFilter(e.target.value)}
                >
                  <option value="all">All Cash</option>
                  <option value="received">Pending from Delivery</option>
                  <option value="pending">Pending Approval</option>
                  <option value="paid_to_admin">Received by Admin</option>
                </select>
              </div>

              {loading ? (
                <div className="wallet-money-loading">Loading cash transactions...</div>
              ) : filteredCashTransactions.length === 0 ? (
                <div className="wallet-money-no-data">
                  No cash transactions found {cashStatusFilter !== "all" ? `with status "${cashStatusFilter}"` : ""}
                </div>
              ) : (
                <div className="wallet-money-table-wrapper">
                  <table className="wallet-money-data-table">
                    <thead>
                      <tr>
                        <th>No</th>
                        <th>Delivery Partner</th>
                        <th>Customer</th>
                        <th>Order ID</th>
                        <th>Amount (AED)</th>
                        <th>Method</th>
                        <th>Date</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCashTransactions.map((tx, index) => (
                        <tr key={tx._id}>
                          <td>{index + 1}</td>
                          <td>{tx.deliveryMan?.username || "N/A"}</td>
                          <td>{tx.order?.customer?.name || "N/A"}</td>
                          <td>{tx.order?._id?.slice(-8) || "N/A"}</td>
                          <td>{tx.amount.toFixed(2)}</td>
                          <td>Cash</td>
                          <td>{new Date(tx.date).toLocaleDateString()}</td>
                          <td>
                            <span className={`wallet-money-status-badge wallet-money-status-${tx.status}`}>
                              {tx.status === "received" ? "Pending from Delivery" : 
                               tx.status === "pending" ? "Pending Approval" : 
                               "Received by Admin"}
                            </span>
                          </td>
                          <td>
                            {tx.status === "received" && (
                              <button
                                className="wallet-money-receive-btn"
                                onClick={() => handleMarkReceivedClick(tx._id)}
                                disabled={markingTxId === tx._id}
                              >
                                {markingTxId === tx._id ? "Processing..." : "Mark as Received"}
                              </button>
                            )}
                            {tx.status === "pending" && (
                              <div className="wallet-money-action-icons">
                                <button 
                                  className="wallet-money-accept-btn" 
                                  onClick={() => handleAcceptClick(tx._id)}
                                  disabled={markingTxId === tx._id}
                                  aria-label="Accept"
                                >
                                  ✓
                                </button>
                                <button 
                                  className="wallet-money-reject-btn" 
                                  onClick={() => handleRejectClick(tx._id)}
                                  disabled={markingTxId === tx._id}
                                  aria-label="Reject"
                                >
                                  ✗
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

            {/* ──────────────────────────────
                CHEQUE TRANSACTIONS TABLE
            ────────────────────────────── */}
            <div className="wallet-section">
              <h3 className="section-title">Cheque Payments Received</h3>

              <div className="wallet-money-filter">
                <label>Filter Cheque by Status: </label>
                <select 
                  value={chequeStatusFilter} 
                  onChange={(e) => setChequeStatusFilter(e.target.value)}
                >
                  <option value="all">All Cheque</option>
                  <option value="received">Pending from Delivery</option>
                  <option value="pending">Pending Approval</option>
                  <option value="paid_to_admin">Received by Admin</option>
                </select>
              </div>

              {loading ? (
                <div className="wallet-money-loading">Loading cheque transactions...</div>
              ) : filteredChequeTransactions.length === 0 ? (
                <div className="wallet-money-no-data">
                  No cheque transactions found {chequeStatusFilter !== "all" ? `with status "${chequeStatusFilter}"` : ""}
                </div>
              ) : (
                <div className="wallet-money-table-wrapper">
                  <table className="wallet-money-data-table">
                    <thead>
                      <tr>
                        <th>No</th>
                        <th>Delivery Partner</th>
                        <th>Customer</th>
                        <th>Order ID</th>
                        <th>Amount (AED)</th>
                        <th>Method</th>
                        <th>Cheque Details</th>
                        <th>Date</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredChequeTransactions.map((tx, index) => (
                        <tr key={tx._id}>
                          <td>{index + 1}</td>
                          <td>{tx.deliveryMan?.username || "N/A"}</td>
                          <td>{tx.order?.customer?.name || "N/A"}</td>
                          <td>{tx.order?._id?.slice(-8) || "N/A"}</td>
                          <td>{tx.amount.toFixed(2)}</td>
                          <td>Cheque</td>
                          <td>
                            {tx.chequeDetails ? (
                              (() => {
                                if (typeof tx.chequeDetails === "object" && tx.chequeDetails !== null) {
                                  const data = tx.chequeDetails;
                                  return (
                                    <div className="cheque-info">
                                      <div><strong>Number:</strong> {data.number || "-"}</div>
                                      <div><strong>Bank:</strong> {data.bank || "-"}</div>
                                      <div><strong>Date:</strong> {data.date ? new Date(data.date).toLocaleDateString() : "-"}</div>
                                    </div>
                                  );
                                }

                                try {
                                  const data = JSON.parse(tx.chequeDetails);
                                  return (
                                    <div className="cheque-info">
                                      <div><strong>Number:</strong> {data.number || "-"}</div>
                                      <div><strong>Bank:</strong> {data.bank || "-"}</div>
                                      <div><strong>Date:</strong> {data.date ? new Date(data.date).toLocaleDateString() : "-"}</div>
                                    </div>
                                  );
                                } catch (e) {
                                  return <span style={{ color: "#ef4444" }}>{tx.chequeDetails || "Invalid data"}</span>;
                                }
                              })()
                            ) : "-"}
                          </td>
                          <td>{new Date(tx.date).toLocaleDateString()}</td>
                          <td>
                            <span className={`wallet-money-status-badge wallet-money-status-${tx.status}`}>
                              {tx.status === "received" ? "Pending from Delivery" : 
                               tx.status === "pending" ? "Pending Approval" : 
                               "Received by Admin"}
                            </span>
                          </td>
                          <td>
                            {tx.status === "received" && (
                              <button
                                className="wallet-money-receive-btn"
                                onClick={() => handleMarkReceivedClick(tx._id)}
                                disabled={markingTxId === tx._id}
                              >
                                {markingTxId === tx._id ? "Processing..." : "Mark as Received"}
                              </button>
                            )}
                            {tx.status === "pending" && (
                              <div className="wallet-money-action-icons">
                                <button 
                                  className="wallet-money-accept-btn" 
                                  onClick={() => handleAcceptClick(tx._id)}
                                  disabled={markingTxId === tx._id}
                                  aria-label="Accept"
                                >
                                  ✓
                                </button>
                                <button 
                                  className="wallet-money-reject-btn" 
                                  onClick={() => handleRejectClick(tx._id)}
                                  disabled={markingTxId === tx._id}
                                  aria-label="Reject"
                                >
                                  ✗
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
          </div>
        </div>
      </main>

      {/* Confirmation Modal for Accept/Reject/Mark Received */}
      {showConfirmModal && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal">
            <h3 className="confirm-title">
              {confirmAction === "accept" ? "Confirm Accept Payment" :
               confirmAction === "reject" ? "Confirm Reject Payment" :
               "Confirm Mark as Received"}
            </h3>
            <p className="confirm-text">
              {confirmAction === "accept" 
                ? "Are you sure you want to accept this payment and mark it as received?"
                : confirmAction === "reject" 
                ? "Are you sure you want to reject this payment request?"
                : "Are you sure you have received this amount from the delivery partner?"}
            </p>
            <div className="confirm-actions">
              <button
                className="confirm-cancel"
                onClick={() => setShowConfirmModal(false)}
              >
                Cancel
              </button>
              <button
                className="confirm-confirm"
                onClick={confirmActionHandler}
                disabled={markingTxId === txToMark}
              >
                {markingTxId === txToMark ? "Processing..." : 
                 confirmAction === "accept" ? "Yes, Accept" :
                 confirmAction === "reject" ? "Yes, Reject" :
                 "Yes, Received"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WalletMoney;