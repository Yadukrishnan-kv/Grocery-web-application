// src/pages/DeliveryPartner/Wallet/Wallet.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../../Assets/aed-symbol.png";
import toast from "react-hot-toast";
import axios from "axios";
import "./Wallet.css";

// Icons (unchanged)
const CashIcon = () => (
  <svg
    className="icon-cash"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="3" />
    <path d="M6 12h.01M18 12h.01" />
  </svg>
);

const SearchIcon = () => (
  <svg
    className="icon-search"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
);

const PrintIcon = () => (
  <svg
    className="icon-print"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M6 9V2h12v7" />
    <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" rx="1" />
  </svg>
);

const SendIcon = () => (
  <svg
    className="icon-send"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M22 2L11 13" />
    <path d="M22 2L15 22L11 13L2 9L22 2Z" />
  </svg>
);

const Wallet = () => {
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

  // Selection
  const [selectedTxIds, setSelectedTxIds] = useState([]);
  const [selectAll, setSelectAll] = useState(false);

  const [searchCustomer, setSearchCustomer] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [txToConfirm, setTxToConfirm] = useState(null);
  const [isBulkRequest, setIsBulkRequest] = useState(false);

  const backendUrl = process.env.REACT_APP_BACKEND_IP;

  const fetchCurrentUser = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return (window.location.href = "/login");
      const res = await axios.get(`${backendUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(res.data.user || res.data);
    } catch (err) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
  }, [backendUrl]);

  const fetchCashWallet = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const res = await axios.get(
        `${backendUrl}/api/wallet/delivery/cash-wallet`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setWalletData(res.data);
      setSelectedTxIds([]);
      setSelectAll(false);
    } catch (err) {
      toast.error("Failed to load cash wallet");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchCashWallet();
  }, [fetchCurrentUser, fetchCashWallet]);

  // Filtered + totals
  const filteredTransactions = useMemo(() => {
    if (!searchCustomer.trim()) return walletData.transactions;
    const term = searchCustomer.toLowerCase();
    return walletData.transactions.filter((tx) =>
      tx.order?.customer?.name?.toLowerCase().includes(term),
    );
  }, [walletData.transactions, searchCustomer]);

  const filteredTotal = useMemo(
    () => filteredTransactions.reduce((sum, tx) => sum + tx.amount, 0),
    [filteredTransactions],
  );

  const selectedTotal = useMemo(
    () =>
      walletData.transactions
        .filter((tx) => selectedTxIds.includes(tx._id))
        .reduce((sum, tx) => sum + tx.amount, 0),
    [walletData.transactions, selectedTxIds],
  );

  // Selection handlers
  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedTxIds([]);
    } else {
      setSelectedTxIds(filteredTransactions.map((tx) => tx._id));
    }
    setSelectAll(!selectAll);
  };

  const handleSelectTx = (id) => {
    setSelectedTxIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  // Request Pay to Admin
  const handleRequestPayToAdmin = (txId = null, isBulk = false) => {
    setIsBulkRequest(isBulk);
    setTxToConfirm(txId);
    setShowConfirmModal(true);
  };

  const confirmRequestPayToAdmin = async () => {
    const ids = isBulkRequest ? selectedTxIds : [txToConfirm];
    if (ids.length === 0) return;

    setShowConfirmModal(false);
    setPayingTxId(isBulkRequest ? "bulk" : txToConfirm);

    try {
      const token = localStorage.getItem("token");
      for (const id of ids) {
        await axios.post(
          `${backendUrl}/api/wallet/delivery/request-pay-cash-to-admin`,
          { transactionId: id },
          { headers: { Authorization: `Bearer ${token}` } },
        );
      }
      toast.success(
        isBulkRequest ? "Bulk requests sent!" : "Request sent to admin!",
      );
      fetchCashWallet();
      setSelectedTxIds([]);
    } catch (err) {
      toast.error("Failed to send request");
    } finally {
      setPayingTxId(null);
      setTxToConfirm(null);
      setIsBulkRequest(false);
    }
  };

  // Print Receipt (with single receipt number for same customer/day)
 const handlePrintReceipt = async (txId = null, isBulk = false) => {
  const ids = isBulk ? selectedTxIds : [txId];
  if (ids.length === 0) return;

  setPrintingTxId(isBulk ? "bulk" : txId);

  try {
    const token = localStorage.getItem("token");
    const selectedTxs = walletData.transactions.filter((t) =>
      ids.includes(t._id),
    );

    // ✅ Get correct invoice number for filename using displayInvoiceNumber
    const firstTx = selectedTxs[0];
    const firstInvoiceNumber = 
      firstTx.displayInvoiceNumber || 
      firstTx.invoiceNumber || 
      firstTx.order?.invoiceNumber || 
      "N/A";

    const res = await axios.post(
      `${backendUrl}/api/wallet/receipt/bulk`,
      {
        transactionIds: ids,
        // ✅ Pass invoice numbers array so backend can use them
        invoiceNumbers: selectedTxs.map(tx => 
          tx.displayInvoiceNumber || tx.invoiceNumber || tx.order?.invoiceNumber
        ),
      },
      {
        headers: { Authorization: `Bearer ${token}` },
        responseType: "blob",
      },
    );

    const blob = new Blob([res.data], { type: "application/pdf" });
    const url = window.URL.createObjectURL(blob);

    // ✅ Use correct invoice number in filename
    const filename = selectedTxs.length === 1
      ? `receipt-${firstInvoiceNumber}.pdf`
      : `bulk-receipt-${Date.now()}.pdf`;

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    document.body.removeChild(link);

    setTimeout(() => window.URL.revokeObjectURL(url), 10000);
    toast.success("Receipt ready!");
    if (isBulk) setSelectedTxIds([]);
  } catch (err) {
    toast.error("Failed to generate receipt");
  } finally {
    setPrintingTxId(null);
  }
};

const downloadSingleReceipt = async (txId, invoiceNumber) => {
  try {
    const token = localStorage.getItem("token");
    const response = await fetch(`${backendUrl}/api/wallet/receipt/${txId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    if (!response.ok) throw new Error("Failed to generate receipt");
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `receipt-${invoiceNumber}.pdf`;
    link.click();
    window.URL.revokeObjectURL(url);
    toast.success("Receipt downloaded");
  } catch (err) {
    toast.error("Failed to download receipt");
  }
};

  if (!user) return <div className="wallet-loading">Loading...</div>;

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
            <div className="wallet-header">
              <div className="wallet-header-content">
                <div className="wallet-header-icon">
                  <CashIcon />
                </div>
                <div>
                  <h1 className="wallet-page-title">Cash Wallet</h1>
                  <p className="wallet-page-subtitle">
                    Manage your collected cash payments
                  </p>
                </div>
              </div>
              <button
                className="wallet-refresh-btn"
                onClick={fetchCashWallet}
                disabled={loading}
              >
                {loading ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            <div className="wallet-summary-card">
              <div className="summary-card-content">
                <img
                  src={DirhamSymbol}
                  alt="AED"
                  className="dirham-icon-large"
                />
                <div>
                  <span className="summary-card-label">
                    Total Cash Collected
                  </span>
                  <span className="summary-card-amount">
                    AED{" "}
                    {walletData.totalAmount.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>
            </div>

            <div className="wallet-search-wrapper">
              <div className="search-input-group">
                <SearchIcon />
                <input
                  type="text"
                  placeholder="Search by customer name..."
                  value={searchCustomer}
                  onChange={(e) => setSearchCustomer(e.target.value)}
                />
                {searchCustomer && (
                  <button
                    onClick={() => setSearchCustomer("")}
                    className="search-clear"
                  >
                    ✕
                  </button>
                )}
              </div>

              {searchCustomer.trim() && (
                <div className="filtered-info">
                  Showing {filteredTransactions.length} transaction
                  {filteredTransactions.length !== 1 ? "s" : ""} — Total:{" "}
                  <strong>AED {filteredTotal.toFixed(2)}</strong>
                </div>
              )}
            </div>

            {selectedTxIds.length > 0 && (
              <div className="bulk-actions-bar">
                <span>
                  {selectedTxIds.length} selected — Total:{" "}
                  <strong>AED {selectedTotal.toFixed(2)}</strong>
                </span>
                <div className="bulk-buttons">
                  <button
                    className="btn btn-primary"
                    onClick={() => handleRequestPayToAdmin(null, true)}
                    disabled={payingTxId === "bulk"}
                  >
                    <SendIcon />{" "}
                    {payingTxId === "bulk" ? "Sending..." : "Send to Admin"}
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => handlePrintReceipt(null, true)}
                    disabled={printingTxId === "bulk"}
                  >
                    <PrintIcon />{" "}
                    {printingTxId === "bulk"
                      ? "Generating..."
                      : "Print Receipts"}
                  </button>
                  <button onClick={() => setSelectedTxIds([])}>Clear</button>
                </div>
              </div>
            )}

            {loading ? (
              <div className="loading">Loading...</div>
            ) : filteredTransactions.length === 0 ? (
              <div className="no-data">No cash transactions found</div>
            ) : (
              <table className="wallet-data-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={selectAll}
                        onChange={handleSelectAll}
                      />
                    </th>
                    <th>No</th>
                    <th>Customer</th>
                    <th>Invoice #</th>
                    <th>Amount</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((tx, idx) => (
                    <tr key={tx._id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedTxIds.includes(tx._id)}
                          onChange={() => handleSelectTx(tx._id)}
                          disabled={tx.status !== "received"}
                        />
                      </td>
                      <td>{idx + 1}</td>
                      <td>{tx.order?.customer?.name || "N/A"}</td>
                      <td>
  {/* ✅ Use displayInvoiceNumber from backend, fallback to order.invoiceNumber */}
  {tx.displayInvoiceNumber || tx.order?.invoiceNumber || tx.invoiceNumber || "N/A"}
</td>
                      <td>AED {tx.amount.toFixed(2)}</td>
                      <td>{new Date(tx.date).toLocaleDateString()}</td>
                      <td>{tx.status}</td>
                      <td>
                        {tx.status === "received" && (
                          <button
                            onClick={() => handleRequestPayToAdmin(tx._id)}
                          >
                            Send to Admin
                          </button>
                        )}
                       <button onClick={() => downloadSingleReceipt(tx._id, tx.displayInvoiceNumber || tx.order?.invoiceNumber)}>
  Print Receipt
</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>

      {/* Confirm Modal */}
      {showConfirmModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h3>Confirm {isBulkRequest ? "Bulk " : ""}Request</h3>
            <p>
              Send{" "}
              {isBulkRequest ? selectedTxIds.length + " items" : "this item"}
              worth{" "}
              <strong>
                AED{" "}
                {(isBulkRequest
                  ? selectedTotal
                  : walletData.transactions.find((t) => t._id === txToConfirm)
                      ?.amount || 0
                ).toFixed(2)}
              </strong>{" "}
              to admin?
            </p>
            <div className="modal-actions">
              <button onClick={() => setShowConfirmModal(false)}>Cancel</button>
              <button onClick={confirmRequestPayToAdmin} disabled={payingTxId}>
                {payingTxId ? "Sending..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Wallet;
