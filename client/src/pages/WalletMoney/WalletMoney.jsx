// src/pages/Admin/WalletMoney.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import Header from "../../components/layout/Header/Header";
import Sidebar from "../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../Assets/aed-symbol.png";
import toast from "react-hot-toast";
import axios from "axios";
import "./WalletMoney.css";

const WalletMoney = () => {
  const [cashTransactions, setCashTransactions] = useState([]);
  const [chequeTransactions, setChequeTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState("Wallet Money");
  const [user, setUser] = useState(null);

  // Processing states (used on buttons)
  const [processingId, setProcessingId] = useState(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // Filters
  const [cashStatusFilter, setCashStatusFilter] = useState("all");
  const [chequeStatusFilter, setChequeStatusFilter] = useState("all");

  // Search
  const [cashSearch, setCashSearch] = useState("");
  const [chequeSearch, setChequeSearch] = useState("");

  // Selection
  const [selectedCashTx, setSelectedCashTx] = useState([]);
  const [selectedChequeTx, setSelectedChequeTx] = useState([]);
  const [selectAllCash, setSelectAllCash] = useState(false);
  const [selectAllCheque, setSelectAllCheque] = useState(false);

  // Single action modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [txToMark, setTxToMark] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null); // "accept", "reject", "mark-received"

  // Bulk action modal
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkActionType, setBulkActionType] = useState(null); // "mark-received", "accept", "reject"

  const backendUrl = process.env.REACT_APP_BACKEND_IP;

  const fetchCurrentUser = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        window.location.href = "/login";
        return;
      }
      const res = await axios.get(`${backendUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(res.data.user || res.data);
    } catch (err) {
      console.error("Failed to load user", err);
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
  }, [backendUrl]);

  const fetchWalletMoney = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");

      const res = await axios.get(`${backendUrl}/api/wallet/admin/wallet-money`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const allTx = res.data;

      setCashTransactions(allTx.filter(tx => tx.method === "cash"));
      setChequeTransactions(allTx.filter(tx => tx.method === "cheque"));

      setSelectedCashTx([]);
      setSelectedChequeTx([]);
      setSelectAllCash(false);
      setSelectAllCheque(false);
    } catch (err) {
      console.error("Fetch wallet error:", err);
      toast.error("Failed to load wallet data");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchWalletMoney();
  }, [fetchCurrentUser, fetchWalletMoney]);

  // Filtered cash
  const filteredCash = useMemo(() => {
    return cashTransactions.filter(tx => {
      if (cashStatusFilter !== "all" && tx.status !== cashStatusFilter) return false;
      if (cashSearch.trim()) {
        const term = cashSearch.toLowerCase();
        return (
          tx.order?.customer?.name?.toLowerCase().includes(term) ||
          tx.deliveryMan?.username?.toLowerCase().includes(term) ||
          tx.order?._id?.toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [cashTransactions, cashStatusFilter, cashSearch]);

  // Filtered cheque
  const filteredCheque = useMemo(() => {
    return chequeTransactions.filter(tx => {
      if (chequeStatusFilter !== "all" && tx.status !== chequeStatusFilter) return false;
      if (chequeSearch.trim()) {
        const term = chequeSearch.toLowerCase();
        return (
          tx.order?.customer?.name?.toLowerCase().includes(term) ||
          tx.deliveryMan?.username?.toLowerCase().includes(term) ||
          tx.order?._id?.toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [chequeTransactions, chequeStatusFilter, chequeSearch]);

  // Filtered totals (displayed when searching)
  const cashFilteredTotal = useMemo(() => 
    filteredCash.reduce((sum, tx) => sum + tx.amount, 0), 
    [filteredCash]
  );

  const chequeFilteredTotal = useMemo(() => 
    filteredCheque.reduce((sum, tx) => sum + tx.amount, 0), 
    [filteredCheque]
  );

  // Selected totals (displayed in bulk bar)
  const cashSelectedTotal = useMemo(() => 
    cashTransactions.filter(tx => selectedCashTx.includes(tx._id))
      .reduce((sum, tx) => sum + tx.amount, 0), 
    [cashTransactions, selectedCashTx]
  );

  const chequeSelectedTotal = useMemo(() => 
    chequeTransactions.filter(tx => selectedChequeTx.includes(tx._id))
      .reduce((sum, tx) => sum + tx.amount, 0), 
    [chequeTransactions, selectedChequeTx]
  );

  // Selection handlers - Cash
  const toggleCashSelect = (id) => {
    setSelectedCashTx(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleAllCash = () => {
    const eligible = filteredCash.filter(tx => 
      tx.status === "received" || tx.status === "pending"
    );
    if (selectAllCash) {
      setSelectedCashTx([]);
    } else {
      setSelectedCashTx(eligible.map(tx => tx._id));
    }
    setSelectAllCash(!selectAllCash);
  };

  useEffect(() => {
    const eligible = filteredCash.filter(tx => 
      tx.status === "received" || tx.status === "pending"
    );
    setSelectAllCash(eligible.length > 0 && selectedCashTx.length === eligible.length);
  }, [filteredCash, selectedCashTx]);

  // Selection handlers - Cheque
  const toggleChequeSelect = (id) => {
    setSelectedChequeTx(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleAllCheque = () => {
    const eligible = filteredCheque.filter(tx => 
      tx.status === "received" || tx.status === "pending"
    );
    if (selectAllCheque) {
      setSelectedChequeTx([]);
    } else {
      setSelectedChequeTx(eligible.map(tx => tx._id));
    }
    setSelectAllCheque(!selectAllCheque);
  };

  useEffect(() => {
    const eligible = filteredCheque.filter(tx => 
      tx.status === "received" || tx.status === "pending"
    );
    setSelectAllCheque(eligible.length > 0 && selectedChequeTx.length === eligible.length);
  }, [filteredCheque, selectedChequeTx]);

  // Collected totals (paid_to_admin only)
  const cashCollected = useMemo(() => 
    cashTransactions.filter(tx => tx.status === "paid_to_admin")
      .reduce((sum, tx) => sum + tx.amount, 0), 
    [cashTransactions]
  );

  const chequeCollected = useMemo(() => 
    chequeTransactions.filter(tx => tx.status === "paid_to_admin")
      .reduce((sum, tx) => sum + tx.amount, 0), 
    [chequeTransactions]
  );

  const grandTotal = cashCollected + chequeCollected;

  // Action handlers
  const handleAccept = (txId) => {
    setTxToMark(txId);
    setConfirmAction("accept");
    setShowConfirmModal(true);
  };

  const handleReject = (txId) => {
    setTxToMark(txId);
    setConfirmAction("reject");
    setShowConfirmModal(true);
  };

  const handleMarkReceived = (txId) => {
    setTxToMark(txId);
    setConfirmAction("mark-received");
    setShowConfirmModal(true);
  };

  // Bulk action trigger
  const handleBulkAction = (type) => {
    const totalSelected = selectedCashTx.length + selectedChequeTx.length;
    if (totalSelected === 0) {
      return toast.error("No transactions selected");
    }
    setBulkActionType(type);
    setShowBulkModal(true);
  };

  const confirmSingle = async () => {
    if (!txToMark) return;
    setShowConfirmModal(false);
    setProcessingId(txToMark);

    try {
      const token = localStorage.getItem("token");
      let endpoint = "";
      let msg = "";

      switch (confirmAction) {
        case "accept":
          endpoint = `${backendUrl}/api/wallet/admin/accept-payment`;
          msg = "Accepted and received";
          break;
        case "reject":
          endpoint = `${backendUrl}/api/wallet/admin/reject-payment`;
          msg = "Rejected";
          break;
        case "mark-received":
          endpoint = `${backendUrl}/api/wallet/admin/mark-received`;
          msg = "Marked as received";
          break;
        default:
          return;
      }

      await axios.post(endpoint, { transactionId: txToMark }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      toast.success(msg);
      fetchWalletMoney();
    } catch (err) {
      toast.error("Action failed");
    } finally {
      setProcessingId(null);
      setTxToMark(null);
      setConfirmAction(null);
    }
  };

  const confirmBulk = async () => {
    setShowBulkModal(false);
    setBulkProcessing(true);

    try {
      const token = localStorage.getItem("token");
      let success = 0, fail = 0;

      const allIds = [...selectedCashTx, ...selectedChequeTx];

      for (const id of allIds) {
        const tx = [...cashTransactions, ...chequeTransactions].find(t => t._id === id);
        if (!tx) continue;

        if (
          (bulkActionType === "mark-received" && tx.status !== "received") ||
          ((bulkActionType === "accept" || bulkActionType === "reject") && tx.status !== "pending")
        ) continue;

        try {
          let ep = "";
          if (bulkActionType === "mark-received") ep = `${backendUrl}/api/wallet/admin/mark-received`;
          else if (bulkActionType === "accept") ep = `${backendUrl}/api/wallet/admin/accept-payment`;
          else ep = `${backendUrl}/api/wallet/admin/reject-payment`;

          await axios.post(ep, { transactionId: id }, {
            headers: { Authorization: `Bearer ${token}` },
          });
          success++;
        } catch {
          fail++;
        }
      }

      toast.success(`${success} processed`);
      if (fail) toast.error(`${fail} failed`);
      fetchWalletMoney();
    } catch (err) {
      toast.error("Bulk failed");
    } finally {
      setBulkProcessing(false);
      setSelectedCashTx([]);
      setSelectedChequeTx([]);
      setSelectAllCash(false);
      setSelectAllCheque(false);
      setBulkActionType(null);
    }
  };

  const renderCheque = (d) => {
    if (!d) return "—";
    try {
      const data = typeof d === "string" ? JSON.parse(d) : d;
      return (
        <div className="cheque-info">
          <div>No: {data.number || "—"}</div>
          <div>Bank: {data.bank || "—"}</div>
          <div>Date: {data.date ? new Date(data.date).toLocaleDateString() : "—"}</div>
        </div>
      );
    } catch {
      return "Invalid";
    }
  };

  if (!user) return <div className="loading">Loading...</div>;

  return (
    <div className="wallet-money-layout">
      <Header sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} user={user} />
      <Sidebar 
        isOpen={sidebarOpen} 
        activeItem={activeItem} 
        onSetActiveItem={setActiveItem} 
        onClose={() => setSidebarOpen(false)} 
        user={user} 
      />
      
      <main className={`wallet-money-main ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="wallet-container">
          <h2>Admin Wallet Overview</h2>

          <div className="summary-cards">
            <div className="summary-card grand">
              <h4>Total Collected</h4>
              <div className="amount">
                <img src={DirhamSymbol} alt="AED" width={32} />
                <span>{grandTotal.toFixed(2)}</span>
              </div>
            </div>
            <div className="summary-card cash">
              <h4>Cash Collected</h4>
              <div className="amount">
                <img src={DirhamSymbol} alt="AED" width={28} />
                <span>{cashCollected.toFixed(2)}</span>
              </div>
            </div>
            <div className="summary-card cheque">
              <h4>Cheque Collected</h4>
              <div className="amount">
                <img src={DirhamSymbol} alt="AED" width={28} />
                <span>{chequeCollected.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Cash Section */}
          <div className="wallet-section">
            <div className="section-header">
              <h3>Cash Transactions</h3>
              <div className="search-box">
                <input
                  type="text"
                  placeholder="Search customer, delivery, order ID..."
                  value={cashSearch}
                  onChange={(e) => setCashSearch(e.target.value)}
                  className="search-input"
                />
                {cashSearch && <button onClick={() => setCashSearch("")} className="search-clear">✕</button>}
              </div>
            </div>

            {cashSearch.trim() && (
              <div className="filtered-summary">
                Showing <strong>{filteredCash.length}</strong> cash transaction(s) — 
                Total: <strong>AED {cashFilteredTotal.toFixed(2)}</strong>
              </div>
            )}

            <div className="filter-bar">
              <label>Filter by Status: </label>
              <select value={cashStatusFilter} onChange={(e) => setCashStatusFilter(e.target.value)}>
                <option value="all">All</option>
                <option value="received">Received (Not Sent)</option>
                <option value="pending">Pending Approval</option>
                <option value="paid_to_admin">Collected</option>
              </select>
            </div>

            {selectedCashTx.length > 0 && (
              <div className="bulk-action-bar">
                <span>
                  {selectedCashTx.length} selected — Total:{" "}
                  <strong>AED {cashSelectedTotal.toFixed(2)}</strong>
                </span>
                <button 
                  className="bulk-mark-btn" 
                  onClick={() => handleBulkAction("mark-received")}
                  disabled={bulkProcessing}
                >
                  {bulkProcessing ? "Processing..." : "Mark Selected as Received"}
                </button>
                <button 
                  className="bulk-accept-btn" 
                  onClick={() => handleBulkAction("accept")}
                  disabled={bulkProcessing}
                >
                  {bulkProcessing ? "Processing..." : "Accept Selected"}
                </button>
                <button 
                  className="bulk-reject-btn" 
                  onClick={() => handleBulkAction("reject")}
                  disabled={bulkProcessing}
                >
                  {bulkProcessing ? "Processing..." : "Reject Selected"}
                </button>
                <button 
                  className="bulk-clear-btn" 
                  onClick={() => { setSelectedCashTx([]); setSelectAllCash(false); }}
                >
                  Clear
                </button>
              </div>
            )}

            {loading ? (
              <div className="loading">Loading cash transactions...</div>
            ) : filteredCash.length === 0 ? (
              <div className="no-data">No cash transactions found</div>
            ) : (
              <div className="table-responsive">
                <table className="requests-table">
                  <thead>
                    <tr>
                      <th className="checkbox-col">
                        <input 
                          type="checkbox" 
                          checked={selectAllCash} 
                          onChange={toggleAllCash} 
                        />
                      </th>
                      <th>No</th>
                      <th>Delivery</th>
                      <th>Customer</th>
                      <th>Order ID</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCash.map((tx, idx) => {
                      const isProcessing = processingId === tx._id;
                      const isReceivable = tx.status === "received" || tx.status === "pending";
                      return (
                        <tr key={tx._id} className={selectedCashTx.includes(tx._id) ? "selected-row" : ""}>
                          <td className="checkbox-col">
                            <input 
                              type="checkbox" 
                              checked={selectedCashTx.includes(tx._id)} 
                              onChange={() => toggleCashSelect(tx._id)} 
                              disabled={!isReceivable || bulkProcessing}
                            />
                          </td>
                          <td>{idx + 1}</td>
                          <td>{tx.deliveryMan?.username || "—"}</td>
                          <td>{tx.order?.customer?.name || "—"}</td>
                          <td>{tx.order?._id?.slice(-8) || "N/A"}</td>
                          <td>{tx.amount.toFixed(2)}</td>
                          <td>
                            <span className={`status-badge status-${tx.status}`}>
                              {tx.status === "received" ? "Received (Not Sent)" :
                               tx.status === "pending" ? "Pending Approval" :
                               "Collected"}
                            </span>
                          </td>
                          <td>{new Date(tx.createdAt).toLocaleDateString()}</td>
                          <td>
                            {tx.status === "received" && (
                              <button 
                                className="mark-received-btn" 
                                onClick={() => handleMarkReceived(tx._id)}
                                disabled={processingId || bulkProcessing}
                              >
                                {isProcessing ? "Processing..." : "Mark Received"}
                              </button>
                            )}
                            {tx.status === "pending" && (
                              <div className="action-buttons">
                                <button 
                                  className="accept-btn" 
                                  onClick={() => handleAccept(tx._id)}
                                  disabled={processingId || bulkProcessing}
                                >
                                  Accept
                                </button>
                                <button 
                                  className="reject-btn" 
                                  onClick={() => handleReject(tx._id)}
                                  disabled={processingId || bulkProcessing}
                                >
                                  Reject
                                </button>
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

          {/* Cheque Section */}
          <div className="wallet-section">
            <div className="section-header">
              <h3>Cheque Transactions</h3>
              <div className="search-box">
                <input
                  type="text"
                  placeholder="Search customer, delivery, order ID..."
                  value={chequeSearch}
                  onChange={(e) => setChequeSearch(e.target.value)}
                  className="search-input"
                />
                {chequeSearch && <button onClick={() => setChequeSearch("")} className="search-clear">✕</button>}
              </div>
            </div>

            {chequeSearch.trim() && (
              <div className="filtered-summary">
                Showing <strong>{filteredCheque.length}</strong> cheque transaction(s) — 
                Total: <strong>AED {chequeFilteredTotal.toFixed(2)}</strong>
              </div>
            )}

            <div className="filter-bar">
              <label>Filter by Status: </label>
              <select value={chequeStatusFilter} onChange={(e) => setChequeStatusFilter(e.target.value)}>
                <option value="all">All</option>
                <option value="received">Received (Not Sent)</option>
                <option value="pending">Pending Approval</option>
                <option value="paid_to_admin">Collected</option>
              </select>
            </div>

            {selectedChequeTx.length > 0 && (
              <div className="bulk-action-bar">
                <span>
                  {selectedChequeTx.length} selected — Total:{" "}
                  <strong>AED {chequeSelectedTotal.toFixed(2)}</strong>
                </span>
                <button 
                  className="bulk-mark-btn" 
                  onClick={() => handleBulkAction("mark-received")}
                  disabled={bulkProcessing}
                >
                  {bulkProcessing ? "Processing..." : "Mark Selected as Received"}
                </button>
                <button 
                  className="bulk-accept-btn" 
                  onClick={() => handleBulkAction("accept")}
                  disabled={bulkProcessing}
                >
                  {bulkProcessing ? "Processing..." : "Accept Selected"}
                </button>
                <button 
                  className="bulk-reject-btn" 
                  onClick={() => handleBulkAction("reject")}
                  disabled={bulkProcessing}
                >
                  {bulkProcessing ? "Processing..." : "Reject Selected"}
                </button>
                <button 
                  className="bulk-clear-btn" 
                  onClick={() => { setSelectedChequeTx([]); setSelectAllCheque(false); }}
                >
                  Clear
                </button>
              </div>
            )}

            {loading ? (
              <div className="loading">Loading cheque transactions...</div>
            ) : filteredCheque.length === 0 ? (
              <div className="no-data">No cheque transactions found</div>
            ) : (
              <div className="table-responsive">
                <table className="requests-table">
                  <thead>
                    <tr>
                      <th className="checkbox-col">
                        <input 
                          type="checkbox" 
                          checked={selectAllCheque} 
                          onChange={toggleAllCheque} 
                        />
                      </th>
                      <th>No</th>
                      <th>Delivery</th>
                      <th>Customer</th>
                      <th>Order ID</th>
                      <th>Amount</th>
                      <th>Cheque Details</th>
                      <th>Status</th>
                      <th>Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCheque.map((tx, idx) => {
                      const isProcessing = processingId === tx._id;
                      const isReceivable = tx.status === "received" || tx.status === "pending";
                      return (
                        <tr key={tx._id} className={selectedChequeTx.includes(tx._id) ? "selected-row" : ""}>
                          <td className="checkbox-col">
                            <input 
                              type="checkbox" 
                              checked={selectedChequeTx.includes(tx._id)} 
                              onChange={() => toggleChequeSelect(tx._id)} 
                              disabled={!isReceivable || bulkProcessing}
                            />
                          </td>
                          <td>{idx + 1}</td>
                          <td>{tx.deliveryMan?.username || "—"}</td>
                          <td>{tx.order?.customer?.name || "—"}</td>
                          <td>{tx.order?._id?.slice(-8) || "N/A"}</td>
                          <td>{tx.amount.toFixed(2)}</td>
                          <td>{renderCheque(tx.chequeDetails)}</td>
                          <td>
                            <span className={`status-badge status-${tx.status}`}>
                              {tx.status === "received" ? "Received (Not Sent)" :
                               tx.status === "pending" ? "Pending Approval" :
                               "Collected"}
                            </span>
                          </td>
                          <td>{new Date(tx.createdAt).toLocaleDateString()}</td>
                          <td>
                            {tx.status === "received" && (
                              <button 
                                className="mark-received-btn" 
                                onClick={() => handleMarkReceived(tx._id)}
                                disabled={processingId || bulkProcessing}
                              >
                                {isProcessing ? "Processing..." : "Mark Received"}
                              </button>
                            )}
                            {tx.status === "pending" && (
                              <div className="action-buttons">
                                <button 
                                  className="accept-btn" 
                                  onClick={() => handleAccept(tx._id)}
                                  disabled={processingId || bulkProcessing}
                                >
                                  Accept
                                </button>
                                <button 
                                  className="reject-btn" 
                                  onClick={() => handleReject(tx._id)}
                                  disabled={processingId || bulkProcessing}
                                >
                                  Reject
                                </button>
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
      </main>

      {/* Single Confirmation Modal */}
      {showConfirmModal && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal">
            <h3>
              {confirmAction === "accept" ? "Accept Payment?" :
               confirmAction === "reject" ? "Reject Payment?" :
               "Mark as Received?"}
            </h3>
            <p>Are you sure you want to proceed?</p>
            <div className="confirm-actions">
              <button className="confirm-cancel" onClick={() => setShowConfirmModal(false)}>
                Cancel
              </button>
              <button 
                className={`confirm-${confirmAction}`}
                onClick={confirmSingle}
                disabled={processingId}
              >
                {processingId ? "Processing..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Confirmation Modal */}
      {showBulkModal && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal bulk-modal">
            <h3>
              {bulkActionType === "mark-received" ? "Mark Selected as Received?" :
               bulkActionType === "accept" ? "Accept Selected?" :
               "Reject Selected?"}
            </h3>
            <p>Are you sure? This will affect {selectedCashTx.length + selectedChequeTx.length} transaction(s).</p>
            <div className="confirm-actions">
              <button className="confirm-cancel" onClick={() => setShowBulkModal(false)}>
                Cancel
              </button>
              <button 
                className="confirm-confirm"
                onClick={confirmBulk}
                disabled={bulkProcessing}
              >
                {bulkProcessing ? "Processing..." : "Yes, Proceed"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WalletMoney;