// src/pages/Delivery/CashWallet.jsx
import React, { useState, useEffect, useCallback } from "react";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../../Assets/aed-symbol.png";
import toast from "react-hot-toast";
import "./Wallet.css";
import axios from "axios";

const CashWallet = () => {
  const [walletData, setWalletData] = useState({
    totalAmount: 0,
    transactions: [],
  });
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState("Cash Wallet");
  const [user, setUser] = useState(null);
  const [payingTxId, setPayingTxId] = useState(null);
  const [printingTxId, setPrintingTxId] = useState(null);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [txToConfirm, setTxToConfirm] = useState(null);

  const backendUrl = process.env.REACT_APP_BACKEND_IP;

  const fetchCurrentUser = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return (window.location.href = "/login");
      const response = await axios.get(`${backendUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(response.data.user || response.data);
    } catch (error) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
  }, [backendUrl]);

  const fetchCashWallet = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${backendUrl}/api/wallet/delivery/cash-wallet`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setWalletData(response.data);
    } catch (error) {
      console.error("Error fetching cash wallet:", error);
      toast.error("Failed to load cash wallet details");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchCashWallet();
  }, [fetchCurrentUser, fetchCashWallet]);

  const handleRequestPayCashToAdmin = (transactionId) => {
    setTxToConfirm(transactionId);
    setShowConfirmModal(true);
  };

  const confirmRequestPayCashToAdmin = async () => {
    if (!txToConfirm) return;

    setShowConfirmModal(false);
    setPayingTxId(txToConfirm);

    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${backendUrl}/api/wallet/delivery/request-pay-cash-to-admin`,
        { transactionId: txToConfirm },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success("Request sent to admin for cash payment approval!");
      fetchCashWallet();
    } catch (error) {
      console.error("Error requesting pay cash to admin:", error);
      toast.error(error.response?.data?.message || "Failed to send request");
    } finally {
      setPayingTxId(null);
      setTxToConfirm(null);
    }
  };

  const handlePrintReceipt = async (transactionId) => {
    try {
      setPrintingTxId(transactionId);
      const token = localStorage.getItem("token");
      if (!token) {
        toast.error("Please login again to print receipt");
        return;
      }

      const response = await axios.get(
        `${backendUrl}/api/wallet/receipt/${transactionId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: "blob",
        }
      );

      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);

      const newWindow = window.open(url, "_blank");
      if (newWindow) {
        newWindow.focus();
      } else {
        // Fallback: download if popup blocked
        const link = document.createElement("a");
        link.href = url;
        link.download = `cash-receipt-${transactionId.slice(-8)}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.info("Popup blocked → receipt downloaded instead");
      }

      setTimeout(() => window.URL.revokeObjectURL(url), 10000);
    } catch (err) {
      console.error("Receipt error:", err);
      if (err.response?.status === 401) {
        toast.error("Session expired. Please login again.");
        localStorage.removeItem("token");
        window.location.href = "/login";
      } else {
        toast.error("Failed to generate receipt");
      }
    } finally {
      setPrintingTxId(null);
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
      <main className={`wallet-main-content ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="wallet-container-wrapper">
          <div className="wallet-container">
            <h2 className="wallet-page-title">Cash Wallet</h2>

            <div className="wallet-summary">
              <div className="wallet-total">
                <h3>Total Cash Collected</h3>
                <div className="total-amount">
                  <img src={DirhamSymbol} alt="AED" width={30} height={30} style={{ marginTop: "5px" }} />
                  <span>{walletData.totalAmount.toFixed(2)}</span>
                </div>
              </div>
              <button
                className="wallet-refresh-btn"
                onClick={fetchCashWallet}
                disabled={loading}
              >
                {loading ? "Refreshing..." : "Refresh Cash Wallet"}
              </button>
            </div>

            {loading ? (
              <div className="wallet-loading">Loading cash transactions...</div>
            ) : walletData.transactions.length === 0 ? (
              <div className="wallet-no-data">No cash payments received yet</div>
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
                        <td>Cash</td>
                        <td>{new Date(tx.date).toLocaleDateString()}</td>
                        <td>
                          <span className={`wallet-status-badge wallet-status-${tx.status}`}>
                            {tx.status === "received"
                              ? "Pending"
                              : tx.status === "pending"
                              ? "Pending Approval"
                              : "Paid to Admin"}
                          </span>
                        </td>
                        <td>
                          {tx.status === "received" && (
                            <button
                              className="wallet-pay-admin-btn"
                              onClick={() => handleRequestPayCashToAdmin(tx._id)}
                              disabled={payingTxId === tx._id}
                            >
                              {payingTxId === tx._id ? "Processing..." : "Request Pay to Admin"}
                            </button>
                          )}
                          {tx.status === "pending" && (
                            <button className="wallet-pay-admin-btn pending" disabled>
                              Pending
                            </button>
                          )}
                          <button
                            className="wallet-print-receipt-btn"
                            onClick={() => handlePrintReceipt(tx._id)}
                            disabled={printingTxId === tx._id}
                          >
                            {printingTxId === tx._id ? "Generating..." : "Print Receipt"}
                          </button>
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

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal">
            <h3 className="confirm-title">Confirm Cash Payment Request to Admin</h3>
            <p className="confirm-text">
              Are you sure you want to request approval for handing over AED{" "}
              {walletData.transactions.find((t) => t._id === txToConfirm)?.amount?.toFixed(2) || "0.00"} cash to
              the admin?
            </p>
            <div className="confirm-actions">
              <button className="confirm-cancel" onClick={() => setShowConfirmModal(false)}>
                No, Cancel
              </button>
              <button
                className="confirm-confirm"
                onClick={confirmRequestPayCashToAdmin}
                disabled={payingTxId === txToConfirm}
              >
                {payingTxId === txToConfirm ? "Processing..." : "Yes, Request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashWallet;