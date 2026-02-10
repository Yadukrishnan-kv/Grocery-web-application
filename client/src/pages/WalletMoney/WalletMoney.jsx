// src/pages/Admin/WalletMoney.jsx
import React, { useState, useEffect, useCallback } from "react";
import Header from "../../components/layout/Header/Header";
import Sidebar from "../../components/layout/Sidebar/Sidebar";
import "./WalletMoney.css";
import axios from "axios";
import toast from 'react-hot-toast';

const WalletMoney = () => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState("Wallet Money");
  const [user, setUser] = useState(null);
  const [markingTxId, setMarkingTxId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");

  // NEW: Confirmation modal states
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [txToMark, setTxToMark] = useState(null);

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
      setTransactions(response.data);
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

  const handleMarkReceivedClick = (transactionId) => {
    setTxToMark(transactionId);
    setShowConfirmModal(true);
  };

  const confirmMarkReceived = async () => {
    if (!txToMark) return;

    setShowConfirmModal(false);
    setMarkingTxId(txToMark);

    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${backendUrl}/api/wallet/admin/mark-received`,
        { transactionId: txToMark },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success("Transaction marked as received successfully.");
      fetchWalletMoney();
    } catch (error) {
      console.error("Error marking received:", error);
      toast.error("Failed to update transaction status");
    } finally {
      setMarkingTxId(null);
      setTxToMark(null);
    }
  };

  const filteredTransactions = transactions.filter(tx => {
    if (statusFilter === "all") return true;
    return tx.status === statusFilter;
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
            <h2 className="wallet-money-page-title">Wallet Money (All Transactions)</h2>

            <div className="wallet-money-filter">
              <label>Filter by Status: </label>
              <select 
                value={statusFilter} 
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All</option>
                <option value="received">Pending from Delivery</option>
                <option value="paid_to_admin">Received by Admin</option>
              </select>
            </div>

            {loading ? (
              <div className="wallet-money-loading">Loading transactions...</div>
            ) : filteredTransactions.length === 0 ? (
              <div className="wallet-money-no-data">
                No transactions found {statusFilter !== "all" ? `with status "${statusFilter}"` : ""}
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
                    {filteredTransactions.map((tx, index) => (
                      <tr key={tx._id}>
                        <td>{index + 1}</td>
                        <td>{tx.deliveryMan?.username || "N/A"}</td>
                        <td>{tx.order?.customer?.name || "N/A"}</td>
                        <td>{tx.order?._id?.slice(-8) || "N/A"}</td>
                        <td>{tx.amount.toFixed(2)}</td>
                        <td>{tx.method === "cash" ? "Cash" : "Cheque"}</td>
                        <td>
                          {tx.method === "cheque" && tx.chequeDetails ? (
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
                            {tx.status === "received" ? "Pending from Delivery" : "Received by Admin"}
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

      {/* Confirmation Modal for Mark as Received */}
      {showConfirmModal && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal">
            <h3 className="confirm-title">Confirm Receipt</h3>
            <p className="confirm-text">
              Have you received this amount from the delivery partner?
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
                onClick={confirmMarkReceived}
                disabled={markingTxId === txToMark}
              >
                {markingTxId === txToMark ? "Processing..." : "Yes, Received"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WalletMoney;