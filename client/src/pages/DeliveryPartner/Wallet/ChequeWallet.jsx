// src/pages/Delivery/ChequeWallet.jsx
import React, { useState, useEffect, useCallback } from "react";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../../Assets/aed-symbol.png";
import toast from "react-hot-toast";
import "./Wallet.css";
import axios from "axios";

// 💎 Animated Icons
const ChequeIcon = () => (
  <svg className="icon-cheque" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M7 8h10M7 12h6M7 16h4" />
    <path d="M17 16l2 2" />
  </svg>
);

const SearchIcon = () => (
  <svg className="icon-search" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
);

const PrintIcon = () => (
  <svg className="icon-print" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 9V2h12v7" />
    <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" rx="1" />
  </svg>
);

const SendIcon = () => (
  <svg className="icon-send" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 2L11 13" />
    <path d="M22 2L15 22L11 13L2 9L22 2Z" />
  </svg>
);

const BankIcon = () => (
  <svg className="icon-bank" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" />
  </svg>
);

const ChequeWallet = () => {
  const [walletData, setWalletData] = useState({ totalAmount: 0, transactions: [] });
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState("Cheque Wallet");
  const [user, setUser] = useState(null);
  const [payingTxId, setPayingTxId] = useState(null);
  const [printingTxId, setPrintingTxId] = useState(null);
  const [selectedTxIds, setSelectedTxIds] = useState([]);
  const [searchCustomer, setSearchCustomer] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [txToConfirm, setTxToConfirm] = useState(null);
  const [isBulkRequest, setIsBulkRequest] = useState(false);

  const backendUrl = process.env.REACT_APP_BACKEND_IP;

  const fetchCurrentUser = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return (window.location.href = "/login");
      const response = await axios.get(`${backendUrl}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      setUser(response.data.user || response.data);
    } catch (error) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
  }, [backendUrl]);

  const fetchChequeWallet = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const response = await axios.get(`${backendUrl}/api/wallet/delivery/cheque-wallet`, { headers: { Authorization: `Bearer ${token}` } });
      setWalletData(response.data);
    } catch (error) {
      console.error("Error fetching cheque wallet:", error);
      toast.error("Failed to load cheque wallet details");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchChequeWallet();
  }, [fetchCurrentUser, fetchChequeWallet]);

  const handleRequestPayChequeToAdmin = (transactionId = null, isBulk = false) => {
    setIsBulkRequest(isBulk);
    setTxToConfirm(transactionId);
    setShowConfirmModal(true);
  };

  const confirmRequestPayChequeToAdmin = async () => {
    const idsToProcess = isBulkRequest ? selectedTxIds : [txToConfirm];
    if (idsToProcess.length === 0) return;

    setShowConfirmModal(false);
    setPayingTxId(isBulkRequest ? 'bulk' : txToConfirm);

    try {
      const token = localStorage.getItem("token");
      for (const id of idsToProcess) {
        await axios.post(`${backendUrl}/api/wallet/delivery/request-pay-cheque-to-admin`, { transactionId: id }, { headers: { Authorization: `Bearer ${token}` } });
      }
      toast.success(`${idsToProcess.length > 1 ? '✅ Bulk requests' : '✅ Request'} sent to admin!`);
      fetchChequeWallet();
      setSelectedTxIds([]);
    } catch (error) {
      console.error("Error:", error);
      toast.error(error.response?.data?.message || "Failed to send request(s)");
    } finally {
      setPayingTxId(null);
      setTxToConfirm(null);
      setIsBulkRequest(false);
    }
  };

  const handlePrintReceipt = async (transactionId = null, isBulk = false) => {
    const idsToPrint = isBulk ? selectedTxIds : [transactionId];
    if (idsToPrint.length === 0) return;

    try {
      setPrintingTxId(isBulk ? 'bulk' : transactionId);
      const token = localStorage.getItem("token");
      if (!token) { toast.error("Please login again"); return; }

      const response = await axios.post(`${backendUrl}/api/wallet/receipt/bulk`, { transactionIds: idsToPrint }, { headers: { Authorization: `Bearer ${token}` }, responseType: "blob" });
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const newWindow = window.open(url, "_blank");
      
      if (!newWindow) {
        const link = document.createElement("a");
        link.href = url;
        link.download = `cheque-receipts-${isBulk ? 'bulk' : transactionId?.slice(-8)}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.info("📄 Receipt downloaded!");
      }
      setTimeout(() => window.URL.revokeObjectURL(url), 10000);
      if (isBulk) setSelectedTxIds([]);
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

  const handleSelectAll = (e) => setSelectedTxIds(e.target.checked ? filteredTransactions.map(tx => tx._id) : []);
  const handleSelectTx = (id) => setSelectedTxIds(prev => prev.includes(id) ? prev.filter(txId => txId !== id) : [...prev, id]);

  const filteredTransactions = walletData.transactions.filter(tx =>
    !searchCustomer.trim() || tx.order?.customer?.name?.toLowerCase().includes(searchCustomer.toLowerCase())
  );

  const totalSelected = selectedTxIds.reduce((sum, id) => {
    const tx = walletData.transactions.find(t => t._id === id);
    return sum + (tx?.amount || 0);
  }, 0);

  const renderChequeDetails = (details) => {
    if (!details || typeof details !== 'object') return <span className="text-muted">—</span>;
    return (
      <div className="cheque-details-mini">
        <div className="cheque-detail-row"><BankIcon /><span>{details.bank || "N/A"}</span></div>
        <div className="cheque-detail-row"><span>#{details.number || "N/A"}</span><span>{details.date ? new Date(details.date).toLocaleDateString('en-GB') : ""}</span></div>
      </div>
    );
  };

  if (!user) return <div className="wallet-loading">Loading...</div>;

  return (
    <div className="wallet-layout">
      <Header sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} user={user} />
      <Sidebar isOpen={sidebarOpen} activeItem={activeItem} onSetActiveItem={setActiveItem} onClose={() => setSidebarOpen(false)} user={user} />
      
      <main className={`wallet-main-content ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="wallet-container-wrapper">
          <div className="wallet-container">
            
            {/* ✨ Header Section */}
            <div className="wallet-header">
              <div className="wallet-header-content">
                <div className="wallet-header-icon cheque">
                  <ChequeIcon />
                </div>
                <div>
                  <h1 className="wallet-page-title">Cheque Wallet</h1>
                  <p className="wallet-page-subtitle">Manage your collected cheque payments</p>
                </div>
              </div>
              <button className="wallet-refresh-btn" onClick={fetchChequeWallet} disabled={loading}>
                <span className="btn-icon">⟳</span>
                {loading ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            {/* ✨ Summary Card */}
            <div className="wallet-summary-card cheque">
              <div className="summary-card-content">
                <div className="summary-card-icon">
                  <img src={DirhamSymbol} alt="AED" className="dirham-icon-large" />
                </div>
                <div className="summary-card-details">
                  <span className="summary-card-label">Total Cheque Collected</span>
                  <span className="summary-card-amount">
                    AED {walletData.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
              <div className="summary-card-glow" />
            </div>

            {/* ✨ Search Bar */}
            <div className="wallet-search-wrapper">
              <div className="search-input-group">
                <SearchIcon />
                <input type="text" className="search-input" placeholder="Search by customer name..." value={searchCustomer} onChange={(e) => setSearchCustomer(e.target.value)} />
                {searchCustomer && <button className="search-clear-btn" onClick={() => setSearchCustomer("")} title="Clear search">✕</button>}
              </div>
              <span className="search-results-count">{filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''} found</span>
            </div>

            {/* ✨ Bulk Actions Bar */}
            {selectedTxIds.length > 0 && (
              <div className="bulk-actions-bar animate-slide-down">
                <div className="bulk-selection-info">
                  <span className="bulk-count-badge">{selectedTxIds.length}</span>
                  <span>selected • Total: <strong>AED {totalSelected.toFixed(2)}</strong></span>
                </div>
                <div className="bulk-actions-buttons">
                  <button className="btn btn-primary btn-sm" onClick={() => handleRequestPayChequeToAdmin(null, true)} disabled={payingTxId === 'bulk'}>
                    <SendIcon /> {payingTxId === 'bulk' ? "Sending..." : "Send to Admin"}
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => handlePrintReceipt(null, true)} disabled={printingTxId === 'bulk'}>
                    <PrintIcon /> {printingTxId === 'bulk' ? "Generating..." : "Print Receipts"}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setSelectedTxIds([])}>Clear</button>
                </div>
              </div>
            )}

            {/* ✨ Transactions Table */}
            {loading ? (
              <div className="wallet-skeleton">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="skeleton-row">
                    <div className="skeleton-cell skeleton-checkbox" />
                    <div className="skeleton-cell skeleton-text short" />
                    <div className="skeleton-cell skeleton-text" />
                    <div className="skeleton-cell skeleton-text short" />
                    <div className="skeleton-cell skeleton-text short" />
                    <div className="skeleton-cell skeleton-cheque" />
                    <div className="skeleton-cell skeleton-badge" />
                    <div className="skeleton-cell skeleton-button" />
                  </div>
                ))}
              </div>
            ) : filteredTransactions.length === 0 ? (
              <div className="wallet-empty-state">
                <div className="empty-state-icon">📄</div>
                <h3>No cheque transactions found</h3>
                <p>{searchCustomer ? "Try adjusting your search" : "Cheque payments will appear here once received"}</p>
              </div>
            ) : (
              <div className="wallet-table-container">
                <table className="wallet-data-table">
                  <thead>
                    <tr>
                      <th className="col-checkbox"><input type="checkbox" checked={selectedTxIds.length === filteredTransactions.length && filteredTransactions.length > 0} onChange={handleSelectAll} className="checkbox-custom" /></th>
                      <th className="col-index">No</th>
                      <th className="col-customer">Customer</th>
                      <th className="col-order">Order ID</th>
                      <th className="col-amount">Amount</th>
                      <th className="col-cheque">Cheque Details</th>
                      <th className="col-date">Date</th>
                      <th className="col-status">Status</th>
                      <th className="col-actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.map((tx, index) => (
                      <tr key={tx._id} className={`tx-row ${selectedTxIds.includes(tx._id) ? 'selected' : ''} ${tx.status}`}>
                        <td className="col-checkbox"><input type="checkbox" checked={selectedTxIds.includes(tx._id)} onChange={() => handleSelectTx(tx._id)} className="checkbox-custom" disabled={tx.status !== 'received'} /></td>
                        <td className="col-index">{index + 1}</td>
                        <td className="col-customer">
                          <div className="customer-cell">
                            <div className="customer-avatar">{tx.order?.customer?.name?.charAt(0)?.toUpperCase() || '?'}</div>
                            <span className="customer-name">{tx.order?.customer?.name || "N/A"}</span>
                          </div>
                        </td>
                        <td className="col-order"><code className="order-id">#{tx.order?._id?.slice(-8)}</code></td>
                        <td className="col-amount">
                          <div className="amount-cell">
                            <img src={DirhamSymbol} alt="AED" className="dirham-icon-small" />
                            <span className="amount-value">{tx.amount.toFixed(2)}</span>
                          </div>
                        </td>
                        <td className="col-cheque">{renderChequeDetails(tx.chequeDetails)}</td>
                        <td className="col-date">{new Date(tx.date).toLocaleDateString('en-GB')}</td>
                        <td className="col-status">
                          <span className={`status-badge status-${tx.status}`}>
                            {tx.status === "received" && <span className="status-dot pulse" />}
                            {tx.status === "received" ? "Ready to Send" : tx.status === "pending" ? "Pending Approval" : "Paid to Admin"}
                          </span>
                        </td>
                        <td className="col-actions">
                          <div className="action-buttons">
                            {tx.status === "received" && (
                              <button className="btn-action btn-send" onClick={() => handleRequestPayChequeToAdmin(tx._id)} disabled={payingTxId === tx._id} title="Request Pay to Admin">
                                {payingTxId === tx._id ? "⏳" : <SendIcon />}
                              </button>
                            )}
                            {tx.status === "pending" && <span className="btn-action btn-disabled" title="Awaiting admin approval">⏳</span>}
                            <button className="btn-action btn-print" onClick={() => handlePrintReceipt(tx._id)} disabled={printingTxId === tx._id} title="Print Receipt">
                              {printingTxId === tx._id ? "⏳" : <PrintIcon />}
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

      {/* ✨ Confirmation Modal */}
      {showConfirmModal && (
        <div className="modal-backdrop animate-fade-in">
          <div className="modal-content animate-scale-in">
            <div className="modal-header">
              <div className="modal-icon confirm-icon">⚠️</div>
              <h3 className="modal-title">{isBulkRequest ? `Confirm Bulk Cheque Request` : "Confirm Cheque Request"}</h3>
            </div>
            <div className="modal-body">
              <p className="modal-text">
                {isBulkRequest ? `You're about to request admin approval for handing over ` : `You're about to request approval for handing over the cheque of `}
                <strong className="amount-highlight">AED {(isBulkRequest ? totalSelected : walletData.transactions.find(t => t._id === txToConfirm)?.amount)?.toFixed(2)}</strong>
                {isBulkRequest ? ` from ${selectedTxIds.length} transaction${selectedTxIds.length !== 1 ? 's' : ''}` : ''} to the admin.
              </p>
              <div className="modal-info-box">
                <span className="info-icon">ℹ️</span>
                <span>Ensure the physical cheque is ready for handover. Status will change to "Pending Approval" upon submission.</span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowConfirmModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmRequestPayChequeToAdmin} disabled={payingTxId}>
                {payingTxId ? "Processing..." : "✅ Yes, Request Approval"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChequeWallet;