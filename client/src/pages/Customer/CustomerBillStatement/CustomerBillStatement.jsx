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
  const [customerProfile, setCustomerProfile] = useState(null);

  // Payment request modal states
  const [showPayModal, setShowPayModal] = useState(false);
  const [billToPay, setBillToPay] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [chequeDetails, setChequeDetails] = useState({
    number: "",
    bank: "",
    date: "",
  });
  const [recipientType, setRecipientType] = useState("delivery");
  const [recipientId, setRecipientId] = useState("");
  
  // ✅ Filtered recipients for current bill (instead of all users)
  const [filteredDeliveryMen, setFilteredDeliveryMen] = useState([]);
  const [filteredSalesMen, setFilteredSalesMen] = useState([]);

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
      setCustomerProfile(response.data); // ✅ Store customer profile for salesman lookup
    } catch (error) {
      console.error("Error fetching billing config:", error);
    }
  }, [backendUrl]);

  // ✅ Fetch delivery men who delivered orders in this specific bill
  const fetchDeliveryMenForBill = useCallback(async (bill) => {
  try {
    const token = localStorage.getItem("token");
    
    const billResponse = await axios.get(
      `${backendUrl}/api/bills/getbillbyid/${bill._id}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { populate: "orders.assignedTo" }
      }
    );
    
    const billData = billResponse.data;
    
    const deliveryMenMap = new Map();
    
    if (billData.orders && Array.isArray(billData.orders)) {
      billData.orders.forEach(order => {
        if (order.assignedTo && order.assignedTo._id) {
          const dm = order.assignedTo;
          if (!deliveryMenMap.has(dm._id)) {
            const role = (dm.role || "").toLowerCase();
            if (role.includes("delivery") || role.includes("partner")) {
              deliveryMenMap.set(dm._id, {
                _id: dm._id,
                username: dm.username || dm.name || "Unknown",
                email: dm.email || "",
              });
            }
          }
        }
      });
    }
    
    setFilteredDeliveryMen(Array.from(deliveryMenMap.values()));
  } catch (error) {
    console.error("Failed to fetch delivery men for bill:", error);
    // Fallback: show a message but don't crash modal
    toast.error("Could not load delivery partners for this bill");
    setFilteredDeliveryMen([]);
  }
}, [backendUrl]);

  // ✅ Get the sales man assigned to this customer
const getSalesManForCustomer = useCallback(async () => {
  // If customerProfile already has populated salesman, use it directly
  if (customerProfile?.salesman && typeof customerProfile.salesman === 'object') {
    const salesMan = customerProfile.salesman;
    // ✅ More flexible role check
    const role = (salesMan.role || "").toLowerCase().replace(/\s+/g, '');
    if (role.includes('sales') || role === '' || !salesMan.role) {
      return [{
        _id: salesMan._id,
        username: salesMan.username || salesMan.name || "Unknown Salesman",
        email: salesMan.email || "",
      }];
    }
  }
  
  // If salesman is just an ID string, we can't fetch details without a working endpoint
  // Return empty array gracefully
  console.warn("Salesman not populated in profile or is just an ID");
  return [];
}, [customerProfile]);

  const fetchDeliveryMen = useCallback(async () => {
  try {
    const token = localStorage.getItem("token");
    // ✅ Just await, don't assign to unused variable
    await axios.get(`${backendUrl}/api/users/delivery-men`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Keep for other pages if needed, but modal uses filtered list
  } catch (error) {
    toast.error("Failed to load delivery men");
  }
}, [backendUrl]);

  const fetchSalesMen = useCallback(async () => {
  try {
    const token = localStorage.getItem("token");
    // ✅ Just await, don't assign to unused variable
    await axios.get(`${backendUrl}/api/users/sales-men`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Keep for other pages if needed, but modal uses filtered list
  } catch (error) {
    toast.error("Failed to load sales men");
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
          fetchDeliveryMen(), // Keep for other uses
          fetchSalesMen(),    // Keep for other uses
        ]);
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadAllData();
  }, [fetchCurrentUser, fetchCustomerBills, fetchBillingConfig, fetchDeliveryMen, fetchSalesMen]);

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

  // ✅ UPDATED: Open payment request modal with filtered recipients
  const handlePayBill = async (billId, amountDue) => {
    try {
      // Find the bill in state
      const bill = bills.find(b => b._id === billId);
      if (!bill) {
        toast.error("Bill not found");
        return;
      }

      setBillToPay({ id: billId, amountDue });
      setPaymentAmount("");
      setPaymentMethod("cash");
      setChequeDetails({ number: "", bank: "", date: "" });
      setRecipientType("delivery");
      setRecipientId("");
      
      // ✅ Fetch filtered recipients for THIS bill
      await Promise.all([
        fetchDeliveryMenForBill(bill),
        getSalesManForCustomer().then(setFilteredSalesMen)
      ]);
      
      setShowPayModal(true);
    } catch (error) {
      console.error("Error preparing payment modal:", error);
      toast.error("Failed to load payment options");
    }
  };

  // Handle download invoice
  const handleDownloadInvoice = async (billId, invoiceNumber) => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${backendUrl}/api/bills/invoice/download/${billId}`,
        {
          responseType: "blob",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      // Create blob and download
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `bill-invoice-${invoiceNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success("Invoice downloaded successfully");
    } catch (error) {
      console.error("Download error:", error);
      toast.error("Failed to download invoice");
    }
  };

  // Handle cheque details change
  const handleChequeChange = (field, value) => {
    setChequeDetails((prev) => ({ ...prev, [field]: value }));
  };

  // Reset filtered recipients when modal closes
  const closeModal = () => {
    setShowPayModal(false);
    setBillToPay(null);
    setPaymentAmount("");
    setFilteredDeliveryMen([]);
    setFilteredSalesMen([]);
  };

  // Confirm and send payment request
  const confirmSendPaymentRequest = async () => {
    const amount = parseFloat(paymentAmount);

    if (isNaN(amount) || amount <= 0 || amount > billToPay.amountDue) {
      toast.error(
        `Please enter a valid amount between 0.01 and ${billToPay.amountDue.toFixed(2)}`
      );
      return;
    }

    if (paymentMethod === "cheque") {
      if (!chequeDetails.number || !chequeDetails.bank || !chequeDetails.date) {
        toast.error("Please fill all cheque details");
        return;
      }
    }

    if (!recipientType) {
      toast.error("Please select recipient type");
      return;
    }

    if (!recipientId) {
      toast.error("Please select a recipient");
      return;
    }

    closeModal(); // ✅ Use closeModal to reset state

    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${backendUrl}/api/payment-requests/create`,
        {
          billId: billToPay.id,
          amount,
          method: paymentMethod,
          chequeDetails: paymentMethod === "cheque" ? chequeDetails : undefined,
          recipientType,
          recipientId,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success(`Payment request of AED ${amount.toFixed(2)} sent successfully!`, {
        duration: 5000,
      });

      fetchCustomerBills(); // refresh bills to show pending_payment
    } catch (error) {
      console.error("Error sending payment request:", error);
      toast.error("Failed to send payment request. Please try again.");
    } finally {
      setBillToPay(null);
      setPaymentAmount("");
    }
  };


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
                      <th scope="col">Invoice #</th>
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
                        const isPendingPayment = bill.status === "pending_payment";
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
                                  gap: "8px",
                                }}
                              >
                                <span>
                                  {bill.invoiceNumber || 
                                   bill.orders?.[0]?.invoiceNumber || 
                                   `DEL-${bill._id.toString().slice(-8)}`}
                                  {bill.isOpeningBalance && (
                                    <span style={{ 
                                      marginLeft: "8px", 
                                      backgroundColor: "#FFA500", 
                                      color: "white", 
                                      padding: "2px 6px", 
                                      borderRadius: "3px", 
                                      fontSize: "11px", 
                                      fontWeight: "bold" 
                                    }}>
                                      OB
                                    </span>
                                  )}
                                </span>
                                {bill.invoiceNumber && bill.status === "paid" && (
                                  <button
                                    onClick={() => handleDownloadInvoice(bill._id, bill.invoiceNumber)}
                                    style={{
                                      padding: "4px 8px",
                                      fontSize: "11px",
                                      backgroundColor: "#007bff",
                                      color: "white",
                                      border: "none",
                                      borderRadius: "3px",
                                      cursor: "pointer",
                                    }}
                                  >
                                    Download
                                  </button>
                                )}
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
                              {bill.status !== "paid" && bill.status !== "pending_payment" && (
                                <button
                                  className="customer-bills-pay-button"
                                  onClick={() =>
                                    handlePayBill(bill._id, bill.amountDue)
                                  }
                                >
                                  Pay Bill
                                </button>
                              )}
                              {isPendingPayment && (
                                <button
                                  className="customer-bills-pay-button pending"
                                  disabled
                                >
                                  Pending
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

      {/* Attractive Payment Request Modal - UPDATED WITH FILTERED RECIPIENTS */}
      {showPayModal && billToPay && (
        <div className="pay-modal-overlay">
          <div className="pay-modal">
            <h3 className="pay-modal-title">Send Payment Request</h3>

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
            </div>

            <div className="pay-modal-input-group">
              <label>Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="pay-modal-select"
              >
                <option value="cash">Cash</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>

            {paymentMethod === "cheque" && (
              <div className="pay-modal-cheque-group">
                <input
                  placeholder="Cheque Number"
                  value={chequeDetails.number}
                  onChange={(e) => handleChequeChange("number", e.target.value)}
                  className="pay-modal-input"
                />
                <input
                  placeholder="Bank Name"
                  value={chequeDetails.bank}
                  onChange={(e) => handleChequeChange("bank", e.target.value)}
                  className="pay-modal-input"
                />
                <input
                  type="date"
                  value={chequeDetails.date}
                  onChange={(e) => handleChequeChange("date", e.target.value)}
                  className="pay-modal-input"
                />
              </div>
            )}

            <div className="pay-modal-input-group">
              <label>Recipient Type</label>
              <select
                value={recipientType}
                onChange={(e) => {
                  setRecipientType(e.target.value);
                  setRecipientId(""); // Reset selection when type changes
                }}
                className="pay-modal-select"
              >
                <option value="delivery">Delivery Man</option>
                <option value="sales">Sales Man</option>
              </select>
            </div>

            <div className="pay-modal-input-group">
              <label>Select Recipient</label>
             <select
  value={recipientId}
  onChange={(e) => setRecipientId(e.target.value)}
  className="pay-modal-select"
  disabled={
    (recipientType === "delivery" && filteredDeliveryMen.length === 0) ||
    (recipientType === "sales" && filteredSalesMen.length === 0)
  }
>
  <option value="">
    {recipientType === "delivery" 
      ? (filteredDeliveryMen.length > 0 
          ? "Select Delivery Man" 
          : "No delivery men associated with this bill")
      : (filteredSalesMen.length > 0 
          ? "Select Sales Man" 
          : "No sales man assigned to your account")}
  </option>

  {(recipientType === "delivery" ? filteredDeliveryMen : filteredSalesMen).map(person => (
    <option key={person._id} value={person._id}>
      {person.username} 
    </option>
  ))}
</select>

<small style={{ color: "#e74c3c", fontSize: "11px", marginTop: "4px", display: "block" }}>
  {recipientType === "sales" && filteredSalesMen.length === 0 && 
    "Contact support or your account manager if no sales person is shown"}
</small>
            </div>

            <div className="pay-modal-actions">
              <button
                className="pay-modal-cancel"
                onClick={closeModal}
              >
                Cancel
              </button>
              <button
                className="pay-modal-confirm"
                onClick={confirmSendPaymentRequest}
                disabled={
                  !paymentAmount ||
                  parseFloat(paymentAmount) <= 0 ||
                  parseFloat(paymentAmount) > billToPay.amountDue ||
                  !recipientType ||
                  !recipientId ||
                  (paymentMethod === "cheque" && (!chequeDetails.number || !chequeDetails.bank || !chequeDetails.date))
                }
              >
                Send Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerBillStatement;