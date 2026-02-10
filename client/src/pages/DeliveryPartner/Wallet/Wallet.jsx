// src/pages/Delivery/Wallet.jsx
import React, { useState, useEffect, useCallback } from "react";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../../Assets/aed-symbol.png";
import toast from "react-hot-toast"; // NEW: for toasts
import "./Wallet.css";
import axios from "axios";

const Wallet = () => {
  const [walletData, setWalletData] = useState({
    totalAmount: 0,
    transactions: [],
  });
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState("Wallet");
  const [user, setUser] = useState(null);
  const [payingTxId, setPayingTxId] = useState(null);

  // NEW: Confirmation modal for Pay to Admin
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [txToConfirm, setTxToConfirm] = useState(null);

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

  const fetchWallet = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const response = await axios.get(`${backendUrl}/api/wallet/delivery/wallet`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setWalletData(response.data);
    } catch (error) {
      console.error("Error fetching wallet:", error);
      toast.error("Failed to load wallet details");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchWallet();
  }, [fetchCurrentUser, fetchWallet]);

  const handlePayToAdmin = (transactionId) => {
    setTxToConfirm(transactionId);
    setShowConfirmModal(true);
  };

  const confirmPayToAdmin = async () => {
    if (!txToConfirm) return;

    setShowConfirmModal(false);
    setPayingTxId(txToConfirm);

    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${backendUrl}/api/wallet/delivery/pay-to-admin`,
        { transactionId: txToConfirm },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Success toast instead of alert
      toast.success("Payment successfully handed over to admin!");

      fetchWallet(); // Refresh to update status & hide button
    } catch (error) {
      console.error("Error paying to admin:", error);
      toast.error("Failed to update payment status. Please try again.");
    } finally {
      setPayingTxId(null);
      setTxToConfirm(null);
    }
  };

  if (!user) {
    return <div className="wallet-loading">Loading...</div>;
  }

  return (
    <div className="wallet-layout">
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
      <main
        className={`wallet-main-content ${sidebarOpen ? "sidebar-open" : ""}`}
      >
        <div className="wallet-container-wrapper">
          <div className="wallet-container">
            <h2 className="wallet-page-title">My Wallet</h2>

            <div className="wallet-summary">
              <div className="wallet-total">
                <h3>Total Collected</h3>
                <div className="total-amount">
                  <img src={DirhamSymbol} alt="AED" width={30} height={30} style={{marginTop:"5px"}}/>
                  <span>{walletData.totalAmount.toFixed(2)}</span>
                </div>
              </div>
              <button
                className="wallet-refresh-btn"
                onClick={fetchWallet}
                disabled={loading}
              >
                {loading ? "Refreshing..." : "Refresh Wallet"}
              </button>
            </div>

            {loading ? (
              <div className="wallet-loading">Loading transactions...</div>
            ) : walletData.transactions.length === 0 ? (
              <div className="wallet-no-data">No payments received yet</div>
            ) : (
              <div className="wallet-table-wrapper">
                <table className="wallet-data-table">
                  <thead>
                    <tr>
                      <th>No</th>
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
                    {walletData.transactions.map((tx, index) => (
                      <tr key={tx._id}>
                        <td>{index + 1}</td>
                        <td>{tx.order?.customer?.name || "N/A"}</td>
                        <td>{tx.order?._id?.slice(-8) || "N/A"}</td>
                        <td>{tx.amount.toFixed(2)}</td>
                        <td>{tx.method === "cash" ? "Cash" : "Cheque"}</td>
                        <td>
                          {tx.method === "cheque" && tx.chequeDetails ? (
                            typeof tx.chequeDetails === "object" &&
                            tx.chequeDetails !== null ? (
                              <div className="cheque-info">
                                <div><strong>Number:</strong> {tx.chequeDetails.number || "-"}</div>
                                <div><strong>Bank:</strong> {tx.chequeDetails.bank || "-"}</div>
                                <div><strong>Date:</strong> {tx.chequeDetails.date ? new Date(tx.chequeDetails.date).toLocaleDateString() : "-"}</div>
                              </div>
                            ) : (
                              <span style={{ color: "#ef4444" }}>
                                {tx.chequeDetails || "Invalid data"}
                              </span>
                            )
                          ) : "-"}
                        </td>
                        <td>{new Date(tx.date).toLocaleDateString()}</td>
                        <td>
                          <span
                            className={`wallet-status-badge wallet-status-${tx.status}`}
                          >
                            {tx.status === "received" ? "Pending" : "Paid to Admin"}
                          </span>
                        </td>
                        <td>
                          {tx.status === "received" && (
                            <button
                              className="wallet-pay-admin-btn"
                              onClick={() => handlePayToAdmin(tx._id)}
                              disabled={payingTxId === tx._id}
                            >
                              {payingTxId === tx._id ? "Processing..." : "Pay to Admin"}
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

      {/* Confirmation Modal for Pay to Admin */}
      {showConfirmModal && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal">
            <h3 className="confirm-title">Confirm Payment to Admin</h3>
            <p className="confirm-text">
              Have you handed over AED {walletData.transactions.find(t => t._id === txToConfirm)?.amount?.toFixed(2) || "0.00"} to the admin?
            </p>
            <div className="confirm-actions">
              <button
                className="confirm-cancel"
                onClick={() => setShowConfirmModal(false)}
              >
                No, Cancel
              </button>
              <button
                className="confirm-confirm"
                onClick={confirmPayToAdmin}
                disabled={payingTxId === txToConfirm}
              >
                {payingTxId === txToConfirm ? "Processing..." : "Yes, Pay"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Wallet;