// src/pages/Admin/WalletMoney.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
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
  const [bulkProcessing, setBulkProcessing] = useState(false);
  
  // Separate filters for cash and cheque
  const [cashStatusFilter, setCashStatusFilter] = useState("all");
  const [chequeStatusFilter, setChequeStatusFilter] = useState("all");

  // ✅ NEW: Search states
  const [cashSearch, setCashSearch] = useState("");
  const [chequeSearch, setChequeSearch] = useState("");

  // ✅ NEW: Selection states
  const [selectedCashTx, setSelectedCashTx] = useState([]);
  const [selectedChequeTx, setSelectedChequeTx] = useState([]);
  const [selectAllCash, setSelectAllCash] = useState(false);
  const [selectAllCheque, setSelectAllCheque] = useState(false);

  // Confirmation modal states (shared for both)
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [txToMark, setTxToMark] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null); // "accept", "reject", or "mark-received"

  // ✅ NEW: Bulk action modal
  const [showBulkModal, setShowBulkModal] = useState(false);

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
      
      // ✅ Reset selections after refresh
      setSelectedCashTx([]);
      setSelectedChequeTx([]);
      setSelectAllCash(false);
      setSelectAllCheque(false);
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
  // ✅ Filter cash transactions by search + status
  // ────────────────────────────────────────────────
  const filteredCashTransactions = useMemo(() => {
    return cashTransactions.filter(tx => {
      // Status filter
      if (cashStatusFilter !== "all" && tx.status !== cashStatusFilter) return false;
      
      // Search filter
      if (cashSearch.trim()) {
        const term = cashSearch.toLowerCase();
        const matchesCustomer = tx.order?.customer?.name?.toLowerCase().includes(term);
        const matchesDelivery = tx.deliveryMan?.username?.toLowerCase().includes(term);
        const matchesOrder = tx.order?._id?.toLowerCase().includes(term);
        if (!matchesCustomer && !matchesDelivery && !matchesOrder) return false;
      }
      return true;
    });
  }, [cashTransactions, cashStatusFilter, cashSearch]);

  // ✅ Filter cheque transactions by search + status
  const filteredChequeTransactions = useMemo(() => {
    return chequeTransactions.filter(tx => {
      // Status filter
      if (chequeStatusFilter !== "all" && tx.status !== chequeStatusFilter) return false;
      
      // Search filter
      if (chequeSearch.trim()) {
        const term = chequeSearch.toLowerCase();
        const matchesCustomer = tx.order?.customer?.name?.toLowerCase().includes(term);
        const matchesDelivery = tx.deliveryMan?.username?.toLowerCase().includes(term);
        const matchesOrder = tx.order?._id?.toLowerCase().includes(term);
        if (!matchesCustomer && !matchesDelivery && !matchesOrder) return false;
      }
      return true;
    });
  }, [chequeTransactions, chequeStatusFilter, chequeSearch]);

  // ────────────────────────────────────────────────
  // ✅ Checkbox handlers for Cash
  // ────────────────────────────────────────────────
  const handleCashTxSelect = (txId) => {
    setSelectedCashTx(prev => 
      prev.includes(txId) 
        ? prev.filter(id => id !== txId) 
        : [...prev, txId]
    );
  };

  const handleSelectAllCash = () => {
    const receivableTx = filteredCashTransactions.filter(tx => tx.status === "received");
    if (selectAllCash) {
      setSelectedCashTx([]);
    } else {
      setSelectedCashTx(receivableTx.map(tx => tx._id));
    }
    setSelectAllCash(!selectAllCash);
  };

  // ✅ Checkbox handlers for Cheque
  const handleChequeTxSelect = (txId) => {
    setSelectedChequeTx(prev => 
      prev.includes(txId) 
        ? prev.filter(id => id !== txId) 
        : [...prev, txId]
    );
  };

  const handleSelectAllCheque = () => {
    const receivableTx = filteredChequeTransactions.filter(tx => tx.status === "received");
    if (selectAllCheque) {
      setSelectedChequeTx([]);
    } else {
      setSelectedChequeTx(receivableTx.map(tx => tx._id));
    }
    setSelectAllCheque(!selectAllCheque);
  };

  // ✅ Auto-sync selectAll states
  useEffect(() => {
    const receivableCash = filteredCashTransactions.filter(tx => tx.status === "received");
    if (receivableCash.length > 0 && 
        selectedCashTx.length === receivableCash.length) {
      setSelectAllCash(true);
    } else {
      setSelectAllCash(false);
    }
  }, [filteredCashTransactions, selectedCashTx]);

  useEffect(() => {
    const receivableCheque = filteredChequeTransactions.filter(tx => tx.status === "received");
    if (receivableCheque.length > 0 && 
        selectedChequeTx.length === receivableCheque.length) {
      setSelectAllCheque(true);
    } else {
      setSelectAllCheque(false);
    }
  }, [filteredChequeTransactions, selectedChequeTx]);

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

  // ✅ NEW: Handle Bulk Mark as Received
  const handleBulkMarkReceived = (type) => {
    const selected = type === "cash" ? selectedCashTx : selectedChequeTx;
    const filtered = type === "cash" ? filteredCashTransactions : filteredChequeTransactions;
    
    const receivableSelected = selected.filter(id => 
      filtered.find(tx => tx._id === id)?.status === "received"
    );
    
    if (receivableSelected.length === 0) {
      toast.error(`Please select at least one 'Pending from Delivery' ${type} transaction`);
      return;
    }
    setShowBulkModal(true);
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

  // ✅ NEW: Confirm Bulk Mark as Received
  const confirmBulkMarkReceived = async () => {
    setShowBulkModal(false);
    setBulkProcessing(true);

    try {
      const token = localStorage.getItem("token");
      let cashSuccess = 0, cashFail = 0;
      let chequeSuccess = 0, chequeFail = 0;

      // Process Cash transactions
      for (const txId of selectedCashTx) {
        const tx = filteredCashTransactions.find(t => t._id === txId);
        if (!tx || tx.status !== "received") continue;
        try {
          await axios.post(
            `${backendUrl}/api/wallet/admin/mark-received`,
            { transactionId: txId },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          cashSuccess++;
        } catch (error) {
          console.error(`Failed to mark cash ${txId}:`, error);
          cashFail++;
        }
      }

      // Process Cheque transactions
      for (const txId of selectedChequeTx) {
        const tx = filteredChequeTransactions.find(t => t._id === txId);
        if (!tx || tx.status !== "received") continue;
        try {
          await axios.post(
            `${backendUrl}/api/wallet/admin/mark-received`,
            { transactionId: txId },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          chequeSuccess++;
        } catch (error) {
          console.error(`Failed to mark cheque ${txId}:`, error);
          chequeFail++;
        }
      }

      // Show summary
      const totalSuccess = cashSuccess + chequeSuccess;
      const totalFail = cashFail + chequeFail;
      
      if (totalSuccess > 0) {
        toast.success(`✅ ${totalSuccess} transaction(s) marked as received!`);
      }
      if (totalFail > 0) {
        toast.error(`⚠️ ${totalFail} transaction(s) failed`);
      }
      
      fetchWalletMoney();
    } catch (error) {
      console.error("❌ Bulk mark received error:", error);
      toast.error("Bulk operation failed");
    } finally {
      setBulkProcessing(false);
      setSelectedCashTx([]);
      setSelectedChequeTx([]);
      setSelectAllCash(false);
      setSelectAllCheque(false);
    }
  };

  // ────────────────────────────────────────────────
  // Render helper for cheque details
  // ────────────────────────────────────────────────
  const renderChequeDetails = (chequeDetails) => {
    if (!chequeDetails) return "-";
    
    try {
      const data = typeof chequeDetails === "string" ? JSON.parse(chequeDetails) : chequeDetails;
      return (
        <div className="cheque-info">
          <div><strong>No:</strong> {data.number || "-"}</div>
          <div><strong>Bank:</strong> {data.bank || "-"}</div>
          <div><strong>Date:</strong> {data.date ? new Date(data.date).toLocaleDateString() : "-"}</div>
        </div>
      );
    } catch (e) {
      return <span style={{ color: "#ef4444" }}>Invalid data</span>;
    }
  };

  if (!user) {
    return <div className="wallet-money-loading">Loading...</div>;
  }

  return (
    <div className="wallet-money-layout">
      <Header sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} user={user} />
      <Sidebar isOpen={sidebarOpen} activeItem={activeItem} onSetActiveItem={setActiveItem} onClose={() => setSidebarOpen(false)} user={user} />
      
      <main className={`wallet-money-main-content ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="wallet-money-container-wrapper">
          <div className="wallet-money-container">
            <h2 className="wallet-money-page-title">Admin Wallet Overview</h2>

            {/* ──────────────────────────────
                GRAND TOTAL + SUMMARY CARDS
            ────────────────────────────── */}
            <div className="wallet-summary-cards">
              <div className="summary-card grand-total">
                <div className="summary-icon">💰</div>
                <h4>Total Money Collected</h4>
                <div className="summary-amount grand">
                  <img src={DirhamSymbol} alt="AED" width={36} height={36} />
                  <span>{grandTotal.toFixed(2)}</span>
                </div>
              </div>
              <div className="summary-card cash">
                <div className="summary-icon">💵</div>
                <h4>Total Cash Collected</h4>
                <div className="summary-amount">
                  <img src={DirhamSymbol} alt="AED" width={28} height={28} />
                  <span>{cashTotal.toFixed(2)}</span>
                </div>
              </div>
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
              <div className="section-header-with-actions">
                <h3 className="section-title">Cash Payments Received</h3>
                
                {/* ✅ Search Box for Cash */}
                <div className="search-box">
                  <input
                    type="text"
                    placeholder="Search customer, delivery, or order ID..."
                    value={cashSearch}
                    onChange={(e) => setCashSearch(e.target.value)}
                    className="search-input"
                  />
                  {cashSearch && (
                    <button className="search-clear" onClick={() => setCashSearch("")} title="Clear search">✕</button>
                  )}
                </div>
              </div>

              <div className="wallet-money-filter">
                <label>Filter Cash by Status: </label>
                <select value={cashStatusFilter} onChange={(e) => setCashStatusFilter(e.target.value)}>
                  <option value="all">All Cash</option>
                  <option value="received">Pending from Delivery</option>
                  <option value="pending">Pending Approval</option>
                  <option value="paid_to_admin">Received by Admin</option>
                </select>
              </div>

              {/* ✅ Bulk Action Bar for Cash */}
              {selectedCashTx.length > 0 && (
                <div className="bulk-action-bar">
                  <span className="bulk-selection-count">
                    {selectedCashTx.filter(id => 
                      filteredCashTransactions.find(tx => tx._id === id)?.status === "received"
                    ).length} transaction(s) selected
                  </span>
                  <button 
                    className="bulk-mark-btn" 
                    onClick={() => handleBulkMarkReceived("cash")} 
                    disabled={bulkProcessing}
                  >
                    {bulkProcessing ? "Processing..." : "Mark Selected as Received"}
                  </button>
                  <button 
                    className="bulk-clear-btn" 
                    onClick={() => { setSelectedCashTx([]); setSelectAllCash(false); }}
                  >
                    Clear Selection
                  </button>
                </div>
              )}

              {loading ? (
                <div className="wallet-money-loading">Loading cash transactions...</div>
              ) : filteredCashTransactions.length === 0 ? (
                <div className="wallet-money-no-data">
                  No cash transactions found {cashStatusFilter !== "all" || cashSearch ? "matching your filters" : ""}
                </div>
              ) : (
                <div className="wallet-money-table-wrapper">
                  <table className="wallet-money-data-table">
                    <thead>
                      <tr>
                        {/* ✅ Select All Checkbox */}
                        <th className="checkbox-col">
                          <input
                            type="checkbox"
                            checked={selectAllCash && filteredCashTransactions.filter(tx => tx.status === "received").length > 0}
                            onChange={handleSelectAllCash}
                            className="select-all-checkbox"
                            title="Select all 'Pending from Delivery' cash transactions"
                          />
                        </th>
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
                      {filteredCashTransactions.map((tx, index) => {
                        const isReceivable = tx.status === "received";
                        return (
                          <tr 
                            key={tx._id}
                            className={selectedCashTx.includes(tx._id) ? "selected-row" : ""}
                          >
                            {/* ✅ Individual Checkbox */}
                            <td className="checkbox-col">
                              <input
                                type="checkbox"
                                checked={selectedCashTx.includes(tx._id)}
                                onChange={() => handleCashTxSelect(tx._id)}
                                className="bill-checkbox"
                                disabled={!isReceivable}
                                title={isReceivable ? "Select for bulk action" : `Status: ${tx.status}`}
                              />
                            </td>
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
                              {isReceivable && (
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
                                  <button className="wallet-money-accept-btn" onClick={() => handleAcceptClick(tx._id)} disabled={markingTxId === tx._id}>✓</button>
                                  <button className="wallet-money-reject-btn" onClick={() => handleRejectClick(tx._id)} disabled={markingTxId === tx._id}>✗</button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ──────────────────────────────
                CHEQUE TRANSACTIONS TABLE
            ────────────────────────────── */}
            <div className="wallet-section">
              <div className="section-header-with-actions">
                <h3 className="section-title">Cheque Payments Received</h3>
                
                {/* ✅ Search Box for Cheque */}
                <div className="search-box">
                  <input
                    type="text"
                    placeholder="Search customer, delivery, or order ID..."
                    value={chequeSearch}
                    onChange={(e) => setChequeSearch(e.target.value)}
                    className="search-input"
                  />
                  {chequeSearch && (
                    <button className="search-clear" onClick={() => setChequeSearch("")} title="Clear search">✕</button>
                  )}
                </div>
              </div>

              <div className="wallet-money-filter">
                <label>Filter Cheque by Status: </label>
                <select value={chequeStatusFilter} onChange={(e) => setChequeStatusFilter(e.target.value)}>
                  <option value="all">All Cheque</option>
                  <option value="received">Pending from Delivery</option>
                  <option value="pending">Pending Approval</option>
                  <option value="paid_to_admin">Received by Admin</option>
                </select>
              </div>

              {/* ✅ Bulk Action Bar for Cheque */}
              {selectedChequeTx.length > 0 && (
                <div className="bulk-action-bar">
                  <span className="bulk-selection-count">
                    {selectedChequeTx.filter(id => 
                      filteredChequeTransactions.find(tx => tx._id === id)?.status === "received"
                    ).length} transaction(s) selected
                  </span>
                  <button 
                    className="bulk-mark-btn" 
                    onClick={() => handleBulkMarkReceived("cheque")} 
                    disabled={bulkProcessing}
                  >
                    {bulkProcessing ? "Processing..." : "Mark Selected as Received"}
                  </button>
                  <button 
                    className="bulk-clear-btn" 
                    onClick={() => { setSelectedChequeTx([]); setSelectAllCheque(false); }}
                  >
                    Clear Selection
                  </button>
                </div>
              )}

              {loading ? (
                <div className="wallet-money-loading">Loading cheque transactions...</div>
              ) : filteredChequeTransactions.length === 0 ? (
                <div className="wallet-money-no-data">
                  No cheque transactions found {chequeStatusFilter !== "all" || chequeSearch ? "matching your filters" : ""}
                </div>
              ) : (
                <div className="wallet-money-table-wrapper">
                  <table className="wallet-money-data-table">
                    <thead>
                      <tr>
                        {/* ✅ Select All Checkbox */}
                        <th className="checkbox-col">
                          <input
                            type="checkbox"
                            checked={selectAllCheque && filteredChequeTransactions.filter(tx => tx.status === "received").length > 0}
                            onChange={handleSelectAllCheque}
                            className="select-all-checkbox"
                            title="Select all 'Pending from Delivery' cheque transactions"
                          />
                        </th>
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
                      {filteredChequeTransactions.map((tx, index) => {
                        const isReceivable = tx.status === "received";
                        return (
                          <tr 
                            key={tx._id}
                            className={selectedChequeTx.includes(tx._id) ? "selected-row" : ""}
                          >
                            {/* ✅ Individual Checkbox */}
                            <td className="checkbox-col">
                              <input
                                type="checkbox"
                                checked={selectedChequeTx.includes(tx._id)}
                                onChange={() => handleChequeTxSelect(tx._id)}
                                className="bill-checkbox"
                                disabled={!isReceivable}
                                title={isReceivable ? "Select for bulk action" : `Status: ${tx.status}`}
                              />
                            </td>
                            <td>{index + 1}</td>
                            <td>{tx.deliveryMan?.username || "N/A"}</td>
                            <td>{tx.order?.customer?.name || "N/A"}</td>
                            <td>{tx.order?._id?.slice(-8) || "N/A"}</td>
                            <td>{tx.amount.toFixed(2)}</td>
                            <td>Cheque</td>
                            <td>{renderChequeDetails(tx.chequeDetails)}</td>
                            <td>{new Date(tx.date).toLocaleDateString()}</td>
                            <td>
                              <span className={`wallet-money-status-badge wallet-money-status-${tx.status}`}>
                                {tx.status === "received" ? "Pending from Delivery" : 
                                 tx.status === "pending" ? "Pending Approval" : 
                                 "Received by Admin"}
                              </span>
                            </td>
                            <td>
                              {isReceivable && (
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
                                  <button className="wallet-money-accept-btn" onClick={() => handleAcceptClick(tx._id)} disabled={markingTxId === tx._id}>✓</button>
                                  <button className="wallet-money-reject-btn" onClick={() => handleRejectClick(tx._id)} disabled={markingTxId === tx._id}>✗</button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Single Action Confirmation Modal */}
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
              <button className="confirm-cancel" onClick={() => setShowConfirmModal(false)}>Cancel</button>
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

      {/* ✅ NEW: Bulk Action Confirmation Modal */}
      {showBulkModal && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal bulk-modal">
            <h3 className="confirm-title">Mark Selected Transactions as Received?</h3>
            <p className="confirm-text">
              Are you sure you have received these amounts from delivery partners? 
              They will be credited to the admin wallet.
            </p>
            <p className="text-muted small">
              <strong>Cash:</strong> {selectedCashTx.filter(id => 
                filteredCashTransactions.find(tx => tx._id === id)?.status === "received"
              ).length} transaction(s) • 
              <strong>Cheque:</strong> {selectedChequeTx.filter(id => 
                filteredChequeTransactions.find(tx => tx._id === id)?.status === "received"
              ).length} transaction(s)
            </p>
            <p className="text-muted small">
              <strong>Total Amount:</strong> AED {(
                [...selectedCashTx, ...selectedChequeTx]
                  .map(id => [...filteredCashTransactions, ...filteredChequeTransactions].find(tx => tx._id === id))
                  .filter(tx => tx?.status === "received")
                  .reduce((sum, tx) => sum + (tx?.amount || 0), 0)
              ).toFixed(2)}
            </p>
            <div className="confirm-actions">
              <button className="confirm-cancel" onClick={() => setShowBulkModal(false)}>Cancel</button>
              <button
                className="confirm-confirm bulk-confirm"
                onClick={confirmBulkMarkReceived}
                disabled={bulkProcessing}
              >
                {bulkProcessing ? "Processing..." : "Yes, Mark All as Received"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WalletMoney;