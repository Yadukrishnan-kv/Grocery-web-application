// src/pages/Delivery/PaymentRequestsDelivery.jsx
import React, { useState, useEffect, useCallback } from "react";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../../Assets/aed-symbol.png";
import toast from "react-hot-toast";
import axios from "axios";
import "./PaymentRequests.css";

const PaymentRequestsDelivery = () => {
  const [requests, setRequests] = useState([]);              // Incoming customer payment requests
  const [cashRequests, setCashRequests] = useState([]);
  const [chequeRequests, setChequeRequests] = useState([]);

  const [billTransactions, setBillTransactions] = useState([]); // My accepted payments (bill wallet)
  const [cashTx, setCashTx] = useState([]);
  const [chequeTx, setChequeTx] = useState([]);

  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState("Payment Requests");
  const [user, setUser] = useState(null);
  const [processingId, setProcessingId] = useState(null);

  // Confirmation modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [itemToProcess, setItemToProcess] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null); // "accept", "reject", "pay-admin"

  const backendUrl = process.env.REACT_APP_BACKEND_IP;

  // Fetch user
  const fetchCurrentUser = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return window.location.href = "/login";
      const response = await axios.get(`${backendUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(response.data.user || response.data);
    } catch (error) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
  }, [backendUrl]);

  // Fetch all data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");

      // 1. Incoming payment requests from customers
      const reqRes = await axios.get(`${backendUrl}/api/payment-requests/my-requests`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const allReq = reqRes.data;
      const myRequests = allReq.filter(r => r.recipientType === "delivery");
      setRequests(myRequests);
      setCashRequests(myRequests.filter(r => r.method === "cash"));
      setChequeRequests(myRequests.filter(r => r.method === "cheque"));

      // 2. My bill transactions (accepted from customers)
      const txRes = await axios.get(`${backendUrl}/api/bill-transactions/my-transactions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const myTx = txRes.data;
      setBillTransactions(myTx);
      setCashTx(myTx.filter(t => t.method === "cash"));
      setChequeTx(myTx.filter(t => t.method === "cheque"));

    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchData();
  }, [fetchCurrentUser, fetchData]);

  // Handlers for actions
  const handleAcceptClick = (reqId) => {
    setItemToProcess(reqId);
    setConfirmAction("accept");
    setShowConfirmModal(true);
  };

  const handleRejectClick = (reqId) => {
    setItemToProcess(reqId);
    setConfirmAction("reject");
    setShowConfirmModal(true);
  };

  const handlePayToAdminClick = (txId) => {
    setItemToProcess(txId);
    setConfirmAction("pay-admin");
    setShowConfirmModal(true);
  };

  const confirmActionHandler = async () => {
    if (!itemToProcess) return;

    setShowConfirmModal(false);
    setProcessingId(itemToProcess);

    try {
      const token = localStorage.getItem("token");
      let endpoint = "";
      let successMessage = "";

      switch (confirmAction) {
        case "accept":
          endpoint = `${backendUrl}/api/payment-requests/accept/${itemToProcess}`;
          successMessage = "Payment request accepted successfully";
          break;
        case "reject":
          endpoint = `${backendUrl}/api/payment-requests/reject/${itemToProcess}`;
          successMessage = "Payment request rejected";
          break;
        case "pay-admin":
          endpoint = `${backendUrl}/api/bill-transactions/pay-to-admin/${itemToProcess}`;
          successMessage = "Payment request sent to admin";
          break;
        default:
          return;
      }

      await axios.post(endpoint, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });

      toast.success(successMessage);
      fetchData(); // Refresh everything
    } catch (error) {
      console.error(`Error ${confirmAction}:`, error);
      toast.error(`Failed to ${confirmAction.replace("-", " ")}`);
    } finally {
      setProcessingId(null);
      setItemToProcess(null);
      setConfirmAction(null);
    }
  };

  // ✅ KEY FIX: Calculate totals including "pending" (sent to admin but not yet approved)
  const calculateTotal = (list, statusFilter = ["received", "pending"]) =>
    list.filter(item => statusFilter.includes(item.status))
        .reduce((sum, item) => sum + item.amount, 0);

  const cashTotalWallet = calculateTotal(cashTx, ["received", "pending"]);
  const chequeTotalWallet = calculateTotal(chequeTx, ["received", "pending"]);

  if (!user) return <div className="requests-loading">Loading...</div>;

  return (
    <div className="requests-layout">
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
      <main className={`requests-main-content ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="requests-container">
          <h2 className="requests-page-title">Payment Requests (Delivery Man)</h2>

          {/* ─── My Bill Wallet – Accepted Payments ─────────────────────────────── */}
          <div className="requests-section wallet-section">
            <h3>My Accepted Payments (Bill Wallet)</h3>

            <div className="requests-summary small">
              <div className="summary-card small">
                <h4>Cash Ready to Send</h4>
                <div className="amount">
                  <img src={DirhamSymbol} alt="AED" width={20} />
                  <span>{cashTotalWallet.toFixed(2)}</span>
                </div>
              </div>
              <div className="summary-card small">
                <h4>Cheque Ready to Send</h4>
                <div className="amount">
                  <img src={DirhamSymbol} alt="AED" width={20} />
                  <span>{chequeTotalWallet.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="loading">Loading...</div>
            ) : billTransactions.length === 0 ? (
              <div className="no-data">No accepted payments yet</div>
            ) : (
              <table className="requests-table">
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Customer</th>
                    <th>Bill ID</th>
                    <th>Amount (AED)</th>
                    <th>Method</th>
                    <th>Received Date</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {billTransactions.map((tx, index) => (
                    <tr 
                      key={tx._id}
                      className={tx.status === "pending" ? "pending-row" : 
                                 tx.status === "paid_to_admin" ? "paid-row" : ""}
                    >
                      <td>{index + 1}</td>
                      <td>{tx.customer?.name || "N/A"}</td>
                      <td>{tx.bill?._id?.slice(-8) || "N/A"}</td>
                      <td>{tx.amount.toFixed(2)}</td>
                      <td>{tx.method.charAt(0).toUpperCase() + tx.method.slice(1)}</td>
                      <td>{new Date(tx.createdAt).toLocaleDateString()}</td>
                      <td>
  <span className={`status-badge status-${tx.status}`}>
    {tx.status === "received" ? "Ready to Pay" :
     tx.status === "pending" ? "Sent to Admin" :
     tx.status === "paid_to_admin" ? "Paid to Admin" : "Unknown"}
  </span>
</td>
                      <td>
                        {tx.status === "received" ? (
                          <button
                            className="pay-admin-btn"
                            onClick={() => handlePayToAdminClick(tx._id)}
                            disabled={processingId === tx._id}
                          >
                            {processingId === tx._id ? "Sending..." : "Pay to Admin"}
                          </button>
                        ) : tx.status === "pending" ? (
                          <span className="text-muted small">Awaiting admin approval</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ─── Incoming Customer Requests ───────────────────────────────────── */}
          {loading ? null : requests.length === 0 ? null : (
            <>
              <div className="requests-section">
                <h3>Cash Payment Requests from Customers</h3>
                <table className="requests-table">
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>Customer</th>
                      <th>Bill ID</th>
                      <th>Amount (AED)</th>
                      <th>Method</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashRequests.map((req, index) => (
                      <tr key={req._id}>
                        <td>{index + 1}</td>
                        <td>{req.customer?.name || "N/A"}</td>
                        <td>{req.bill?._id?.slice(-8) || "N/A"}</td>
                        <td>{req.amount.toFixed(2)}</td>
                        <td>Cash</td>
                        <td>{new Date(req.createdAt).toLocaleDateString()}</td>
                        <td>
                          <span className={`status-badge status-${req.status}`}>
                            {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                          </span>
                        </td>
                        <td>
                          {req.status === "pending" && (
                            <div className="action-buttons">
                              <button
                                className="accept-btn"
                                onClick={() => handleAcceptClick(req._id)}
                                disabled={processingId === req._id}
                              >
                                Accept
                              </button>
                              <button
                                className="reject-btn"
                                onClick={() => handleRejectClick(req._id)}
                                disabled={processingId === req._id}
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

              <div className="requests-section">
                <h3>Cheque Payment Requests from Customers</h3>
                <table className="requests-table">
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>Customer</th>
                      <th>Bill ID</th>
                      <th>Amount (AED)</th>
                      <th>Method</th>
                      <th>Cheque Details</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chequeRequests.map((req, index) => (
                      <tr key={req._id}>
                        <td>{index + 1}</td>
                        <td>{req.customer?.name || "N/A"}</td>
                        <td>{req.bill?._id?.slice(-8) || "N/A"}</td>
                        <td>{req.amount.toFixed(2)}</td>
                        <td>Cheque</td>
                        <td>
                          {req.chequeDetails ? (
                            <div className="cheque-info">
                              <div>Number: {req.chequeDetails.number || "-"}</div>
                              <div>Bank: {req.chequeDetails.bank || "-"}</div>
                              <div>Date: {req.chequeDetails.date ? new Date(req.chequeDetails.date).toLocaleDateString() : "-"}</div>
                            </div>
                          ) : "-"}
                        </td>
                        <td>{new Date(req.createdAt).toLocaleDateString()}</td>
                        <td>
                          <span className={`status-badge status-${req.status}`}>
                            {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                          </span>
                        </td>
                        <td>
                          {req.status === "pending" && (
                            <div className="action-buttons">
                              <button
                                className="accept-btn"
                                onClick={() => handleAcceptClick(req._id)}
                                disabled={processingId === req._id}
                              >
                                Accept
                              </button>
                              <button
                                className="reject-btn"
                                onClick={() => handleRejectClick(req._id)}
                                disabled={processingId === req._id}
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
            </>
          )}
        </div>
      </main>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal">
            <h3>
              {confirmAction === "accept" ? "Accept Payment Request" :
               confirmAction === "reject" ? "Reject Payment Request" :
               "Send Payment to Admin"}
            </h3>
            <p>
              {confirmAction === "accept" ? "Are you sure you received this payment?" :
               confirmAction === "reject" ? "Are you sure you want to reject?" :
               "Have you handed over this amount to the admin?"}
            </p>
            <div className="confirm-actions">
              <button className="confirm-cancel" onClick={() => setShowConfirmModal(false)}>
                Cancel
              </button>
              <button
                className={
                  confirmAction === "accept" ? "confirm-accept" :
                  confirmAction === "reject" ? "confirm-reject" :
                  "confirm-pay-admin"
                }
                onClick={confirmActionHandler}
                disabled={processingId === itemToProcess}
              >
                {processingId === itemToProcess ? "Processing..." :
                 confirmAction === "accept" ? "Yes, Accept" :
                 confirmAction === "reject" ? "Yes, Reject" :
                 "Yes, Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentRequestsDelivery;