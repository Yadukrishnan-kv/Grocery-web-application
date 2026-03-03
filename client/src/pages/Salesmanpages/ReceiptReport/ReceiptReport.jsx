// src/pages/salesman/ReceiptReport.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../../Assets/aed-symbol.png";
import "./ReceiptReport.css";
import axios from "axios";
import toast from "react-hot-toast";

const ReceiptReport = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("all");

  const navigate = useNavigate();
  const backendUrl = process.env.REACT_APP_BACKEND_IP;

  // Fetch current user
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

  // Fetch receipts
  const fetchReceipts = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${backendUrl}/api/customers/receipts`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setReceipts(response.data || []);
    } catch (error) {
      console.error("Error fetching receipts:", error);
      toast.error("Failed to load receipts");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchReceipts();
  }, [fetchCurrentUser, fetchReceipts]);

  const clearSearch = () => setSearchTerm("");

  // Filter receipts
  const filteredReceipts = useMemo(() => {
    return receipts.filter((receipt) => {
      const matchesSearch =
        !searchTerm.trim() ||
        receipt.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        receipt.customer?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        receipt.invoiceNumber?.toLowerCase().includes(searchTerm.toLowerCase());

      if (dateFilter === "all") return matchesSearch;

      const paidDate = new Date(receipt.paidDate);
      const now = new Date();
      const daysAgo = Math.floor((now - paidDate) / (1000 * 60 * 60 * 24));

      if (dateFilter === "today") return matchesSearch && daysAgo === 0;
      if (dateFilter === "7days") return matchesSearch && daysAgo <= 7;
      if (dateFilter === "30days") return matchesSearch && daysAgo <= 30;

      return matchesSearch;
    });
  }, [receipts, searchTerm, dateFilter]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  };

  const handleRowClick = (receiptId) => {
    navigate(`/sales/receipts/${receiptId}`);
  };

  if (!user) {
    return <div className="order-list-loading">Loading...</div>;
  }

  return (
    <div className="order-list-layout">
      <Header
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        user={user}
      />
      <Sidebar
        isOpen={sidebarOpen}
        activeItem="ReceiptReport"
        onSetActiveItem={() => {}}
        onClose={() => setSidebarOpen(false)}
        user={user}
      />
      <main className={`order-list-main-content ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="order-list-container-wrapper">
          <div className="order-list-container">
            
            {/* Page Header */}
            <div className="order-list-header-section">
              <h2 className="order-list-page-title">Receipt Report</h2>
              <p className="sub">Payment receipts and settled bills of your customers</p>
            </div>

            {/* Controls */}
            <div className="order-list-controls-group">
              {/* Search */}
              <div className="order-list-search-container">
                <input
                  type="text"
                  className="order-list-search-input"
                  placeholder="Search by customer, email, or invoice..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button
                    className="order-list-search-clear"
                    onClick={clearSearch}
                    aria-label="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Date Filter */}
              <div className="order-list-filter-group">
                <label htmlFor="dateFilter" className="order-list-filter-label">
                  Date:
                </label>
                <select
                  id="dateFilter"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="order-list-filter-select"
                >
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="7days">Last 7 Days</option>
                  <option value="30days">Last 30 Days</option>
                </select>
              </div>
            </div>

            {/* Loading / Empty / Table */}
            {loading ? (
              <div className="order-list-loading">Loading receipts...</div>
            ) : filteredReceipts.length === 0 ? (
              <div className="order-list-no-data">
                No receipts found
                {searchTerm.trim() ? ` matching "${searchTerm}"` : ""}
                {dateFilter !== "all" ? ` with selected filter` : ""}
              </div>
            ) : (
              <div className="order-list-table-wrapper">
                <table className="order-list-data-table">
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>Invoice #</th>
                      <th>Customer</th>
                      <th>Amount Paid</th>
                      <th>Bill Period</th>
                      <th>Paid Date</th>
                      <th>Orders</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReceipts.map((receipt, idx) => (
                      <tr 
                        key={receipt._id} 
                        className="clickable-row"
                        onClick={() => handleRowClick(receipt._id)}
                        style={{ cursor: 'pointer' }}
                        title="View receipt details"
                      >
                        <td>{idx + 1}</td>
                        <td>
                          <span className="invoice-badge">{receipt.invoiceNumber}</span>
                          {receipt.isOpeningBalance && (
                            <span className="opening-badge-small">OB</span>
                          )}
                        </td>
                        <td>
                          <div className="customer-cell">
                            <span className="customer-name">{receipt.customer?.name}</span>
                            <small className="customer-email">{receipt.customer?.email}</small>
                          </div>
                        </td>
                        <td className="amount-paid">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <img src={DirhamSymbol} alt="AED" width={14} height={14} />
                            <span>{formatCurrency(receipt.paidAmount)}</span>
                          </div>
                        </td>
                        <td>
                          <small>{formatDate(receipt.cycleStart)}</small>
                          <br />
                          <small>→ {formatDate(receipt.cycleEnd)}</small>
                        </td>
                        <td>{formatDate(receipt.paidDate)}</td>
                        <td>
                          <span className="orders-count">{receipt.orderCount} order(s)</span>
                        </td>
                        <td>
                          <span className="status-badge status-paid">Paid</span>
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
    </div>
  );
};

export default ReceiptReport;