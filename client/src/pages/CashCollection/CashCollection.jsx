// src/pages/CashCollection/CashCollection.jsx
import React, { useState, useEffect, useCallback } from "react";
import Header from "../../components/layout/Header/Header";
import Sidebar from "../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../Assets/aed-symbol.png";
import TableScrollSync from "../../components/common/TableScrollSync";
import "./CashCollection.css";
import axios from "axios";
import toast from "../../utils/toast";
import { useAppSettings } from "../../context/AppSettingsContext";
import { usePaginatedData } from "../../hooks/usePagination";
import Pagination from "../../components/common/Pagination";

const CashCollection = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState("CashCollection");
  const [user, setUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [payTarget, setPayTarget] = useState(null); // { customerId, customerName, totalDue }
  const [payAmount, setPayAmount] = useState("");
  const [paySubmitting, setPaySubmitting] = useState(false);

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

  const fetchCashCollectionList = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${backendUrl}/api/bills/cash-collection-list`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setRows(response.data);
    } catch (error) {
      console.error("Error fetching cash collection list:", error);
      toast.error("Failed to load cash collection list");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  useEffect(() => {
    if (user) fetchCashCollectionList();
  }, [user, fetchCashCollectionList]);

  const filteredRows = rows.filter((row) =>
    !searchQuery.trim() ||
    row.customerName?.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  const clearSearch = () => setSearchQuery("");

  const { entriesPerPage } = useAppSettings();
  const pagination = usePaginatedData(
    filteredRows,
    entriesPerPage,
    `${searchQuery}`
  );

  const openPayModal = (row) => {
    setPayTarget(row);
    setPayAmount("");
  };

  const closePayModal = () => {
    if (paySubmitting) return;
    setPayTarget(null);
    setPayAmount("");
  };

  const downloadReceipt = async (transactionIds) => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(
        `${backendUrl}/api/bill-transactions/bulk-receipt`,
        { transactionIds },
        { headers: { Authorization: `Bearer ${token}` }, responseType: "blob" }
      );
      const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = blobUrl;
      link.setAttribute("download", `cash-collection-receipt-${Date.now()}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Error downloading receipt:", error);
      toast.error("Payment recorded, but the receipt download failed");
    }
  };

  const handlePaySubmit = async (e) => {
    e.preventDefault();
    if (!payTarget) return;

    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (amount > payTarget.totalDue + 0.01) {
      toast.error(`Amount exceeds total due of AED ${payTarget.totalDue.toFixed(2)}`);
      return;
    }

    setPaySubmitting(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(
        `${backendUrl}/api/bills/cash-collection/${payTarget.customerId}/pay`,
        { amount },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success(
        `AED ${response.data.totalApplied.toFixed(2)} collected from ${payTarget.customerName}. Remaining due: AED ${response.data.remainingDue.toFixed(2)}`
      );

      if (response.data.transactionIds?.length) {
        await downloadReceipt(response.data.transactionIds);
      }

      setPayTarget(null);
      setPayAmount("");
      fetchCashCollectionList();
    } catch (error) {
      console.error("Error recording cash collection:", error);
      toast.error(error.response?.data?.message || "Failed to record payment");
    } finally {
      setPaySubmitting(false);
    }
  };

  if (!user) {
    return <div className="cash-collection-loading">Loading...</div>;
  }

  return (
    <div className="cash-collection-layout">
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
      <main className={`cash-collection-main-content ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="cash-collection-container-wrapper">
          <div className="cash-collection-container">
            <div className="cash-collection-header-section">
              <h2 className="cash-collection-page-title">Cash Collection</h2>

              <div className="cash-collection-controls-group">
                <div className="cash-collection-search-container">
                  <input
                    type="text"
                    className="cash-collection-search-input"
                    placeholder="Search by customer name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="Search customers"
                  />
                  {searchQuery && (
                    <button
                      className="cash-collection-search-clear"
                      onClick={clearSearch}
                      aria-label="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            </div>

            {loading ? (
              <div className="cash-collection-loading">Loading dues...</div>
            ) : filteredRows.length === 0 ? (
              <div className="cash-collection-no-data">
                No customers with outstanding dues{searchQuery.trim() ? ` matching "${searchQuery}"` : ""}
              </div>
            ) : (
              <>
                <TableScrollSync>
                  <div className="cash-collection-table-wrapper">
                    <table className="cash-collection-data-table">
                      <thead>
                        <tr>
                          <th scope="col">No</th>
                          <th scope="col">Customer Name</th>
                          <th scope="col">Total Dues</th>
                          <th scope="col">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagination.pageData.map((row, index) => (
                          <tr key={row.customerId}>
                            <td>{pagination.showingFrom + index}</td>
                            <td>{row.customerName}</td>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <img src={DirhamSymbol} alt="AED" width={15} height={15} />
                                <span>{row.totalDue.toFixed(2)}</span>
                              </div>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="cash-collection-pay-button"
                                onClick={() => openPayModal(row)}
                              >
                                Pay
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </TableScrollSync>

                <Pagination
                  page={pagination.page}
                  totalPages={pagination.totalPages}
                  totalRecords={pagination.totalRecords}
                  showingFrom={pagination.showingFrom}
                  showingTo={pagination.showingTo}
                  canPrev={pagination.canPrev}
                  canNext={pagination.canNext}
                  onPrev={pagination.goPrev}
                  onNext={pagination.goNext}
                />
              </>
            )}
          </div>
        </div>
      </main>

      {/* Pay Modal */}
      {payTarget && (
        <div className="confirm-modal-overlay">
          <div className="cash-collection-pay-modal">
            <h3 className="confirm-title">Collect Payment</h3>
            <p className="confirm-text">
              Customer: <strong>{payTarget.customerName}</strong>
            </p>
            <p className="confirm-text">
              Total Due:{" "}
              <strong>AED {payTarget.totalDue.toFixed(2)}</strong>
            </p>

            <form onSubmit={handlePaySubmit}>
              <div className="cash-collection-form-group">
                <label htmlFor="payAmount">Amount to Pay (AED)</label>
                <input
                  id="payAmount"
                  type="number"
                  min="0.01"
                  max={payTarget.totalDue}
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="cash-collection-amount-input"
                  autoFocus
                  required
                />
              </div>

              <p className="cash-collection-hint">
                The amount is applied to this customer's oldest unpaid invoice first;
                any remainder rolls over to the next invoice automatically.
              </p>

              <div className="confirm-actions">
                <button
                  type="button"
                  className="confirm-cancel"
                  onClick={closePayModal}
                  disabled={paySubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="cash-collection-confirm-pay"
                  disabled={paySubmitting}
                >
                  {paySubmitting ? "Processing..." : "Confirm Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashCollection;
