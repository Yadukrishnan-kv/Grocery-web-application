// src/pages/Delivery/PaymentRequestsDelivery.jsx
import React, { useState, useEffect, useCallback } from "react";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../../Assets/aed-symbol.png";
import toast from "react-hot-toast";
import axios from "axios";
import '../../DeliveryPartner/PaymentRequestsDelivery/PaymentRequests.css' // create or reuse existing CSS

const PaymentRequestsSales = () => {
  const [requests, setRequests] = useState([]);              // Incoming customer requests
  const [cashRequests, setCashRequests] = useState([]);
  const [chequeRequests, setChequeRequests] = useState([]);

  const [billTransactions, setBillTransactions] = useState([]); // Accepted payments (bill wallet)
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

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");

      // 1. Incoming customer payment requests
      const reqRes = await axios.get(`${backendUrl}/api/payment-requests/my-requests`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const allReq = reqRes.data;
      const myRequests = allReq.filter(r => r.recipientType === "sales");
      setRequests(myRequests);
      setCashRequests(myRequests.filter(r => r.method === "cash"));
      setChequeRequests(myRequests.filter(r => r.method === "cheque"));

      // 2. Accepted bill transactions (my bill wallet - for paying to admin)
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

  // ─── Handlers ──────────────────────────────────────────────────────────────

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

      if (confirmAction === "accept") {
        endpoint = `${backendUrl}/api/payment-requests/accept/${itemToProcess}`;
        successMessage = "Payment request accepted successfully";
      } else if (confirmAction === "reject") {
        endpoint = `${backendUrl}/api/payment-requests/reject/${itemToProcess}`;
        successMessage = "Payment request rejected";
      } else if (confirmAction === "pay-admin") {
        endpoint = `${backendUrl}/api/bill-transactions/pay-to-admin/${itemToProcess}`;
        successMessage = "Payment request sent to admin";
      }

      await axios.post(endpoint, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });

      toast.success(successMessage);
      fetchData();
    } catch (error) {
      console.error(`Error ${confirmAction}:`, error);
      toast.error(`Failed to ${confirmAction.replace("-", " ")}`);
    } finally {
      setProcessingId(null);
      setItemToProcess(null);
      setConfirmAction(null);
    }
  };

  // ─── Totals ────────────────────────────────────────────────────────────────
  const calculateTotal = (list, status = ["accepted", "received"]) =>
    list.filter(item => status.includes(item.status)).reduce((sum, item) => sum + item.amount, 0);

  const cashTotalRequests   = calculateTotal(cashRequests, ["accepted"]);
  const chequeTotalRequests = calculateTotal(chequeRequests, ["accepted"]);

  const cashTotalWallet     = calculateTotal(cashTx, ["received"]);
  const chequeTotalWallet   = calculateTotal(chequeTx, ["received"]);

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
          <h2 className="requests-page-title">Payment Requests</h2>

          {/* ─── Summary ──────────────────────────────────────────────────────── */}
          <div className="requests-summary">
            <div className="summary-card">
              <h4>Total Accepted Cash (from Customers)</h4>
              <div className="amount">
                <img src={DirhamSymbol} alt="AED" width={24} />
                <span>{cashTotalRequests.toFixed(2)}</span>
              </div>
            </div>
            <div className="summary-card">
              <h4>Total Accepted Cheque (from Customers)</h4>
              <div className="amount">
                <img src={DirhamSymbol} alt="AED" width={24} />
                <span>{chequeTotalRequests.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* ─── My Bill Wallet – Accepted Payments (Pay to Admin) ─────────────── */}
          <div className="requests-section wallet-section">
            <h3>My Bill Wallet – Accepted Payments</h3>

            <div className="requests-summary small">
              <div className="summary-card small">
                <h4>Cash to Pay to Admin</h4>
                <div className="amount">
                  <img src={DirhamSymbol} alt="AED" width={20} />
                  <span>{cashTotalWallet.toFixed(2)}</span>
                </div>
              </div>
              <div className="summary-card small">
                <h4>Cheque to Pay to Admin</h4>
                <div className="amount">
                  <img src={DirhamSymbol} alt="AED" width={20} />
                  <span>{chequeTotalWallet.toFixed(2)}</span>
                </div>
              </div>
            </div>

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
                  <tr key={tx._id}>
                    <td>{index + 1}</td>
                    <td>{tx.customer?.name || "N/A"}</td>
                    <td>{tx.bill?._id?.slice(-8) || "N/A"}</td>
                    <td>{tx.amount.toFixed(2)}</td>
                    <td>{tx.method.charAt(0).toUpperCase() + tx.method.slice(1)}</td>
                    <td>{new Date(tx.createdAt).toLocaleDateString()}</td>
                    <td>
                      <span className={`status-badge status-${tx.status}`}>
                        {tx.status === "received" ? "Pending to Admin" : "Paid to Admin"}
                      </span>
                    </td>
                    <td>
                      {tx.status === "received" && (
                        <button
                          className="pay-admin-btn"
                          onClick={() => handlePayToAdminClick(tx._id)}
                          disabled={processingId === tx._id}
                        >
                          {processingId === tx._id ? "Sending..." : "Pay to Admin"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ─── Incoming Customer Requests ───────────────────────────────────── */}
          {loading ? (
            <div className="requests-loading">Loading payment requests...</div>
          ) : requests.length === 0 ? (
            <div className="requests-no-data">No payment requests received yet</div>
          ) : (
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
               "Confirm Pay to Admin"}
            </h3>
            <p>
              {confirmAction === "accept" ? "Are you sure you received this payment?" :
               confirmAction === "reject" ? "Are you sure you want to reject?" :
               "Have you handed over this amount to admin?"}
            </p>
            <div className="confirm-actions">
              <button className="cancel-btn" onClick={() => setShowConfirmModal(false)}>
                Cancel
              </button>
              <button
                className={
                  confirmAction === "accept" ? "accept-btn" :
                  confirmAction === "reject" ? "reject-btn" :
                  "pay-admin-btn"
                }
                onClick={confirmActionHandler}
                disabled={processingId === itemToProcess}
              >
                {processingId === itemToProcess ? "Processing..." :
                 confirmAction === "accept" ? "Accept" :
                 confirmAction === "reject" ? "Reject" : "Yes, Pay to Admin"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentRequestsSales;