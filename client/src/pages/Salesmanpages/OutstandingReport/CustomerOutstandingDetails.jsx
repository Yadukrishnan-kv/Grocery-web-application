// src/pages/salesman/CustomerOutstandingDetails.jsx
import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../../Assets/aed-symbol.png";
import "./CustomerOutstandingDetails.css";
import axios from "axios";
import toast from "react-hot-toast";

const CustomerOutstandingDetails = () => {
  const { customerId } = useParams();
  const navigate = useNavigate();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [summary, setSummary] = useState(null);
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const fetchOutstandingDetails = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${backendUrl}/api/customers/outstanding/${customerId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCustomer(response.data.customer);
      setSummary(response.data.summary);
      setBills(response.data.bills);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching outstanding details:", error);
      toast.error(error.response?.data?.message || "Failed to load details");
      setLoading(false);
    }
  }, [backendUrl, customerId]);

  useEffect(() => {
    fetchCurrentUser();
    fetchOutstandingDetails();
  }, [fetchCurrentUser, fetchOutstandingDetails]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const getDaysStatus = (days) => {
    if (days === null || days === undefined) return { text: "N/A", className: "status-neutral" };
    if (days < 0) return { text: `${Math.abs(days)} days overdue`, className: "status-overdue" };
    if (days === 0) return { text: "Due today", className: "status-warning" };
    if (days <= 5) return { text: `${days} days left`, className: "status-warning" };
    return { text: `${days} days left`, className: "status-ok" };
  };

  const getStatusBadge = (status) => {
    const map = {
      pending: { label: "Pending", class: "badge-pending" },
      overdue: { label: "Overdue", class: "badge-overdue" },
      partial: { label: "Partial", class: "badge-partial" },
      pending_payment: { label: "Pending Payment", class: "badge-pending" },
      paid: { label: "Paid", class: "badge-paid" },
    };
    return map[status] || { label: status, class: "badge-neutral" };
  };

  if (loading || !user) {
    return <div className="order-list-loading">Loading...</div>;
  }

  if (!customer) {
    return (
      <div className="customer-outstanding-layout">
        <div className="customer-outstanding-error">
          <h2>Customer Not Found</h2>
          <Link to="/sales/outstanding-report" className="btn-back">← Back to Report</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="customer-outstanding-layout">
      <Header
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        user={user}
      />
      <Sidebar
        isOpen={sidebarOpen}
        activeItem="Outstanding"
        onSetActiveItem={() => {}}
        onClose={() => setSidebarOpen(false)}
        user={user}
      />
      <main className={`customer-outstanding-main ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="customer-outstanding-wrapper">
          <div className="customer-outstanding-container">
            {/* Header Section */}
            <div className="customer-outstanding-header">
              <button className="btn-back" onClick={() => navigate(-1)}>
                ← Back
              </button>
              <div className="customer-info">
                <h2 className="customer-name">{customer.name}</h2>
                <p className="customer-meta">
                  {customer.email} • {customer.phoneNumber} • {customer.address}, {customer.pincode}
                </p>
                <div className="customer-badges">
                  <span className={`billing-badge ${customer.billingType === "Cash" ? "cash" : "credit"}`}>
                    {customer.billingType}
                  </span>
                  {customer.statementType && (
                    <span className="statement-badge">{customer.statementType}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Summary Cards */}
            {summary && (
              <div className="summary-cards">
                <div className="summary-card card-outstanding">
                  <span className="card-label">Total Outstanding</span>
                  <div className="card-value">
                    <img src={DirhamSymbol} alt="AED" width={18} height={18} />
                    {formatCurrency(summary.totalOutstanding)}
                  </div>
                </div>
                <div className="summary-card card-credit">
                  <span className="card-label">Available Credit</span>
                  <div className="card-value">
                    <img src={DirhamSymbol} alt="AED" width={18} height={18} />
                    {formatCurrency(summary.availableCredit)}
                  </div>
                </div>
                <div className="summary-card card-bills">
                  <span className="card-label">Pending Bills</span>
                  <div className="card-value">{summary.totalBills}</div>
                </div>
                <div className="summary-card card-overdue">
                  <span className="card-label">Overdue Bills</span>
                  <div className="card-value">{summary.overdueBills}</div>
                </div>
              </div>
            )}

            {/* Credit Limit Progress */}
            {customer.creditLimit > 0 && (
              <div className="credit-progress-section">
                <div className="progress-header">
                  <span>Credit Utilization</span>
                  <span>{formatCurrency(customer.usedCredit)} / {formatCurrency(customer.creditLimit)} used</span>
                </div>
                <div className="progress-bar">
                  <div
                    className={`progress-fill ${
                      customer.usedCredit / customer.creditLimit > 0.9
                        ? "critical"
                        : customer.usedCredit / customer.creditLimit > 0.7
                        ? "warning"
                        : ""
                    }`}
                    style={{ width: `${Math.min(100, (customer.usedCredit / customer.creditLimit) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Bills List */}
            <div className="bills-section">
              <h3 className="section-title">Pending Bills ({bills.length})</h3>

              {bills.length === 0 ? (
                <div className="no-bills">No pending bills found</div>
              ) : (
                <div className="bills-list">
                  {bills.map((bill) => {
                    const statusBadge = getStatusBadge(bill.status);
                    const daysStatus = getDaysStatus(bill.daysLeft);

                    return (
                      <div key={bill._id} className="bill-card">
                        {/* Bill Header */}
                        <div className="bill-header">
                          <div className="bill-main-info">
                            <div className="bill-invoice">
                              <span className="invoice-number">{bill.invoiceNumber}</span>
                              {bill.isOpeningBalance && (
                                <span className="opening-badge">Opening Balance</span>
                              )}
                            </div>
                            <div className="bill-dates">
                              <span>{formatDate(bill.cycleStart)} → {formatDate(bill.cycleEnd)}</span>
                            </div>
                          </div>

                          <div className="bill-stats">
                            <div className="bill-amount">
                              <img src={DirhamSymbol} alt="AED" width={14} height={14} />
                              <span className="amount-due">{formatCurrency(bill.remainingDue)}</span>
                              <span className="amount-total">of {formatCurrency(bill.amountDue)}</span>
                            </div>
                            <div className="bill-due">
                              <span className={`due-badge ${daysStatus.className}`}>
                                {daysStatus.text}
                              </span>
                              <small className="due-date">Due: {formatDate(bill.dueDate)}</small>
                            </div>
                            <span className={`status-badge ${statusBadge.class}`}>
                              {statusBadge.label}
                            </span>
                          </div>
                        </div>

                        {/* Bill Details */}
                        <div className="bill-details">
                          {/* Payment Progress */}
                          <div className="payment-progress">
                            <div className="progress-label">
                              <span>Paid: {formatCurrency(bill.paidAmount)}</span>
                              <span>Remaining: {formatCurrency(bill.remainingDue)}</span>
                            </div>
                            <div className="progress-track">
                              <div
                                className="progress-paid"
                                style={{ width: `${(bill.paidAmount / bill.amountDue) * 100}%` }}
                              />
                            </div>
                          </div>

                          {/* Orders Table - Using original full-width table style */}
                          {bill.orders?.length > 0 && (
                            <div className="orders-list">
                              <div className="orders-table-wrapper-full">
                                <table className="orders-table-full">
                                  <thead>
                                    <tr>
                                      <th style={{ minWidth: "130px" }}>Invoice #</th>
                                      <th style={{ minWidth: "110px" }}>Date</th>
                                      <th style={{ minWidth: "220px" }}>Items</th>
                                      <th style={{ minWidth: "110px", textAlign: "right" }}>Amount</th>
                                      <th style={{ minWidth: "120px" }}>Status</th>
                                      <th style={{ minWidth: "100px" }}>Payment</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {bill.orders.map((order) => (
                                      <tr key={order._id}>
                                        <td>{order.invoiceNumber || "-"}</td>
                                        <td>{formatDate(order.orderDate)}</td>
                                        <td>
                                          <div
                                            className="order-items-preview-full"
                                            title={order.items?.map((i) => `${i.product} × ${i.quantity}`).join(", ")}
                                          >
                                            {order.items?.slice(0, 3).map((item, idx) => (
                                              <span key={idx} className="item-chip-full">
                                                {item.product} × {item.quantity}
                                              </span>
                                            ))}
                                            {order.items?.length > 3 && (
                                              <span
                                                className="item-more-full"
                                                title={`${order.items.length - 3} more items`}
                                              >
                                                +{order.items.length - 3}
                                              </span>
                                            )}
                                          </div>
                                        </td>
                                        <td className="order-amount-full" style={{ textAlign: "right" }}>
                                          <img src={DirhamSymbol} alt="AED" width={12} height={12} />
                                          {formatCurrency(order.totalAmount)}
                                        </td>
                                        <td>
                                          <span
                                            className={`order-status status-${order.status?.replace(/\s+/g, "_")}`}
                                          >
                                            {order.status?.replace("_", " ") || "Unknown"}
                                          </span>
                                        </td>
                                        <td>
                                          <span className={`payment-badge ${order.payment}`}>
                                            {order.payment}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default CustomerOutstandingDetails;