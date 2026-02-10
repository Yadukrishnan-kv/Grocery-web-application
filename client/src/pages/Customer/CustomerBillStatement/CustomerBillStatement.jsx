// src/pages/Customer/Bills/CustomerBillStatement.jsx
import React, { useState, useEffect, useCallback } from "react";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../../Assets/aed-symbol.png";
import "./CustomerBillStatement.css";
import axios from "axios";
import toast from "react-hot-toast";

// Helper: Format date to DD/MM/YYYY
const formatDate = (dateString) => {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const CustomerBillStatement = () => {
  const [bills, setBills] = useState([]);
  const [config, setConfig] = useState({
    billingType: "",
    statementType: "",
    dueDays: "",
  });
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState("Bill Statement");
  const [user, setUser] = useState(null);

  // Payment modal states
  const [showPayModal, setShowPayModal] = useState(false);
  const [billToPay, setBillToPay] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState("");

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

  const fetchCustomerBills = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${backendUrl}/api/bills/customer-bills`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setBills(response.data);
    } catch (error) {
      console.error("Error fetching customer bills:", error);
      toast.error("Failed to load bills");
    }
  }, [backendUrl]);

  const fetchBillingConfig = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${backendUrl}/api/customers/my-profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setConfig({
        billingType: response.data.billingType,
        statementType: response.data.statementType,
        dueDays: response.data.dueDays,
      });
    } catch (error) {
      console.error("Error fetching billing config:", error);
    }
  }, [backendUrl]);

  useEffect(() => {
    const loadAllData = async () => {
      setLoading(true);
      try {
        await Promise.all([
          fetchCurrentUser(),
          fetchCustomerBills(),
          fetchBillingConfig(),
        ]);
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadAllData();
  }, [fetchCurrentUser, fetchCustomerBills, fetchBillingConfig]);

  // Calculate days remaining until due date
  const getDaysRemaining = (dueDate) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    const diffTime = due - today;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  // Format text and style for Days Remaining column
  const getDaysRemainingDisplay = (bill) => {
    const { dueDate, status } = bill;

    if (status === "paid") {
      return { text: "—", className: "days-neutral" };
    }

    const days = getDaysRemaining(dueDate);

    if (config.statementType === "monthly") {
      if (days > 7) {
        return {
          text: `Due on ${formatDate(dueDate)}`,
          className: "days-neutral",
        };
      } else if (days > 0) {
        return {
          text: `${days} days left`,
          className: days > 3 ? "days-green" : "days-yellow",
        };
      } else if (days === 0) {
        return { text: "Due today", className: "days-yellow" };
      } else {
        return {
          text: `Overdue by ${Math.abs(days)} days`,
          className: "days-red",
        };
      }
    }

    if (days > 5) {
      return { text: `${days} days left`, className: "days-green" };
    } else if (days > 0) {
      return { text: `${days} days left`, className: "days-yellow" };
    } else if (days === 0) {
      return { text: "Due today", className: "days-yellow" };
    } else {
      return {
        text: `Overdue by ${Math.abs(days)} days`,
        className: "days-red",
      };
    }
  };

  // Open payment modal
  const handlePayBill = (billId, amountDue) => {
    setBillToPay({ id: billId, amountDue });
    setPaymentAmount("");
    setShowPayModal(true);
  };

  // Confirm and process payment
  const confirmPayBill = async () => {
    const amount = parseFloat(paymentAmount);

    if (isNaN(amount) || amount <= 0 || amount > billToPay.amountDue) {
      toast.error(
        `Please enter a valid amount between 0.01 and ${billToPay.amountDue.toFixed(2)}`
      );
      return;
    }

    setShowPayModal(false);

    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${backendUrl}/api/bills/paybill/${billToPay.id}`,
        { paymentAmount: amount },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success(`Payment of AED ${amount.toFixed(2)} processed successfully!`, {
        duration: 5000,
      });

      fetchCustomerBills(); // refresh bills
    } catch (error) {
      console.error("Error paying bill:", error);
      toast.error("Failed to process payment. Please try again.");
    } finally {
      setBillToPay(null);
      setPaymentAmount("");
    }
  };

  if (!user) {
    return <div className="customer-bills-loading">Loading...</div>;
  }

  return (
    <div className="customer-bills-layout">
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
        className={`customer-bills-main-content ${sidebarOpen ? "sidebar-open" : ""}`}
      >
        <div className="customer-bills-container-wrapper">
          <div className="customer-bills-container">
            <div className="customer-bills-header-section">
              <h2 className="customer-bills-page-title">Bill Statements</h2>
            </div>

            <div className="billing-config-section">
              <h3>Your Billing Configuration</h3>
              <p>
                <strong>Billing Type:</strong> {config.billingType || "N/A"}
              </p>
              {config.billingType === "Credit limit" && (
                <>
                  <p>
                    <strong>Statement Type:</strong>{" "}
                    {config.statementType
                      ? config.statementType.charAt(0).toUpperCase() +
                        config.statementType.slice(1)
                      : "N/A"}
                  </p>
                  <p>
                    <strong>Due Days:</strong> {config.dueDays || "N/A"}
                  </p>
                </>
              )}
            </div>

            {loading ? (
              <div className="customer-bills-loading">
                Loading your bills and configuration...
              </div>
            ) : (
              <div className="customer-bills-table-wrapper">
                <table className="customer-bills-data-table">
                  <thead>
                    <tr>
                      <th scope="col">No</th>
                      <th scope="col">Cycle Start</th>
                      <th scope="col">Cycle End</th>
                      <th scope="col">Total Used</th>
                      <th scope="col">Amount Due</th>
                      <th scope="col">Due Date</th>
                      <th scope="col">Days Remaining</th>
                      <th scope="col">Paid Amount</th>
                      <th scope="col">Status</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bills.length > 0 ? (
                      bills.map((bill, index) => {
                        const daysDisplay = getDaysRemainingDisplay(bill);
                        return (
                          <tr key={bill._id}>
                            <td>{index + 1}</td>
                            <td>{formatDate(bill.cycleStart)}</td>
                            <td>{formatDate(bill.cycleEnd)}</td>
                            <td>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "4px",
                                }}
                              >
                                <img
                                  src={DirhamSymbol}
                                  alt="Dirham Symbol"
                                  width={15}
                                  height={15}
                                  style={{ paddingTop: "3px" }}
                                />
                                <span>{bill.totalUsed?.toFixed(2) || "0.00"}</span>
                              </div>
                            </td>
                            <td>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "4px",
                                }}
                              >
                                <img
                                  src={DirhamSymbol}
                                  alt="Dirham Symbol"
                                  width={15}
                                  height={15}
                                  style={{ paddingTop: "3px" }}
                                />
                                <span>{bill.amountDue?.toFixed(2) || "0.00"}</span>
                              </div>
                            </td>
                            <td>{formatDate(bill.dueDate)}</td>
                            <td className={daysDisplay.className}>
                              {daysDisplay.text}
                            </td>
                            <td>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "4px",
                                }}
                              >
                                <img
                                  src={DirhamSymbol}
                                  alt="Dirham Symbol"
                                  width={15}
                                  height={15}
                                  style={{ paddingTop: "3px" }}
                                />
                                <span>{bill.paidAmount?.toFixed(2) || "0.00"}</span>
                              </div>
                            </td>
                            <td>
                              <span
                                className={`customer-bills-status-badge customer-bills-status-${
                                  bill.status?.toLowerCase() || "pending"
                                }`}
                              >
                                {bill.status?.charAt(0).toUpperCase() +
                                  bill.status?.slice(1) || "Pending"}
                              </span>
                            </td>
                            <td>
                              {bill.status !== "paid" && (
                                <button
                                  className="customer-bills-pay-button"
                                  onClick={() =>
                                    handlePayBill(bill._id, bill.amountDue)
                                  }
                                >
                                  Pay Bill
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan="10" className="customer-bills-no-data">
                          No bills found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Attractive Payment Modal */}
      {showPayModal && billToPay && (
        <div className="pay-modal-overlay">
          <div className="pay-modal">
            <h3 className="pay-modal-title">Make Payment</h3>

            <div className="pay-modal-info">
              <p>
                <strong>Amount Due:</strong>{" "}
                <span className="amount-due">
                  AED {billToPay.amountDue.toFixed(2)}
                </span>
              </p>
            </div>

            <div className="pay-modal-input-group">
              <label htmlFor="paymentAmount">Payment Amount (AED)</label>
              <input
                id="paymentAmount"
                type="number"
                step="0.01"
                min="0.01"
                max={billToPay.amountDue}
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="Enter amount"
                className="pay-modal-input"
                autoFocus
              />
              {paymentAmount && parseFloat(paymentAmount) > billToPay.amountDue && (
                <p className="pay-modal-error">
                  Amount cannot exceed the due amount
                </p>
              )}
            </div>

            <div className="pay-modal-actions">
              <button
                className="pay-modal-cancel"
                onClick={() => {
                  setShowPayModal(false);
                  setPaymentAmount("");
                }}
              >
                Cancel
              </button>
              <button
                className="pay-modal-confirm"
                onClick={confirmPayBill}
                disabled={
                  !paymentAmount ||
                  parseFloat(paymentAmount) <= 0 ||
                  parseFloat(paymentAmount) > billToPay.amountDue
                }
              >
                Pay Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerBillStatement;