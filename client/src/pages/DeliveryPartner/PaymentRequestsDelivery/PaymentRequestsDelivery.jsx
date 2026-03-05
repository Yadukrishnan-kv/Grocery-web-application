// src/pages/Delivery/PaymentRequestsDelivery.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../../Assets/aed-symbol.png";
import toast from "react-hot-toast";
import axios from "axios";
import "./PaymentRequests.css";

const PaymentRequestsDelivery = () => {
  const [requests, setRequests] = useState([]);
  const [cashRequests, setCashRequests] = useState([]);
  const [chequeRequests, setChequeRequests] = useState([]);
  const [billTransactions, setBillTransactions] = useState([]);
  const [cashTx, setCashTx] = useState([]);
  const [chequeTx, setChequeTx] = useState([]);
  const [pendingBills, setPendingBills] = useState([]);

  const [pendingSearch, setPendingSearch] = useState("");
  const [selectedPendingBills, setSelectedPendingBills] = useState([]);
  const [selectAllPending, setSelectAllPending] = useState(false);
  const [walletSearch, setWalletSearch] = useState("");
  const [selectedWalletTx, setSelectedWalletTx] = useState([]);
  const [selectAllWallet, setSelectAllWallet] = useState(false);
  const [selectedCashRequests, setSelectedCashRequests] = useState([]);
  const [selectAllCashRequests, setSelectAllCashRequests] = useState(false);
  const [selectedChequeRequests, setSelectedChequeRequests] = useState([]);
  const [selectAllChequeRequests, setSelectAllChequeRequests] = useState(false);

  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState("Payment Requests");
  const [user, setUser] = useState(null);
  const [processingId, setProcessingId] = useState(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // ─── Modals ────────────────────────────────────────────────
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [itemToProcess, setItemToProcess] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);

  const [showMarkModal, setShowMarkModal] = useState(false);
  const [billToMark, setBillToMark] = useState(null);
  const [markAmount, setMarkAmount] = useState("");
  const [markMethod, setMarkMethod] = useState("cash");
  const [markChequeDetails, setMarkChequeDetails] = useState({
    number: "",
    bank: "",
    date: "",
  });

  const [showBulkMarkModal, setShowBulkMarkModal] = useState(false);
  const [bulkMarkMethod, setBulkMarkMethod] = useState("cash");
  const [bulkMarkChequeDetails, setBulkMarkChequeDetails] = useState({
    number: "",
    bank: "",
    date: "",
  });

  const [showBulkPayModal, setShowBulkPayModal] = useState(false);
  const [showBulkRequestModal, setShowBulkRequestModal] = useState(false);
  const [bulkRequestAction, setBulkRequestAction] = useState(null);

  // ✅✅✅ NEW: Pay to Admin Modal States
  const [showPayToAdminModal, setShowPayToAdminModal] = useState(false);
  const [payToAdminTxId, setPayToAdminTxId] = useState(null);
  const [payToAdminMethod, setPayToAdminMethod] = useState("cash");
  const [payToAdminChequeDetails, setPayToAdminChequeDetails] = useState({
    number: "",
    bank: "",
    date: "",
  });

  // ✅✅✅ NEW: Bulk Pay to Admin Modal States
  const [showBulkPayToAdminModal, setShowBulkPayToAdminModal] = useState(false);
  const [bulkPayMethod, setBulkPayMethod] = useState("cash");
  const [bulkPayChequeDetails, setBulkPayChequeDetails] = useState({
    number: "",
    bank: "",
    date: "",
  });

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

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");

      const reqRes = await axios.get(`${backendUrl}/api/payment-requests/my-requests`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const myRequests = reqRes.data.filter((r) => r.recipientType === "delivery");
      setRequests(myRequests);
      setCashRequests(myRequests.filter((r) => r.method === "cash"));
      setChequeRequests(myRequests.filter((r) => r.method === "cheque"));

      const txRes = await axios.get(`${backendUrl}/api/bill-transactions/my-transactions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const myTx = txRes.data;
      setBillTransactions(myTx);
      setCashTx(myTx.filter((t) => t.method === "cash"));
      setChequeTx(myTx.filter((t) => t.method === "cheque"));

      const billsRes = await axios.get(`${backendUrl}/api/bills/all-pending`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPendingBills(billsRes.data);

      setSelectedPendingBills([]);
      setSelectAllPending(false);
      setSelectedWalletTx([]);
      setSelectAllWallet(false);
      setSelectedCashRequests([]);
      setSelectAllCashRequests(false);
      setSelectedChequeRequests([]);
      setSelectAllChequeRequests(false);
    } catch (err) {
      console.error("Fetch error:", err);
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchData();
  }, [fetchCurrentUser, fetchData]);

  const filteredPendingBills = useMemo(() => {
    if (!pendingSearch.trim()) return pendingBills;
    const term = pendingSearch.toLowerCase();
    return pendingBills.filter(
      (bill) =>
        bill.customer?.name?.toLowerCase().includes(term) ||
        bill.invoiceNumber?.toLowerCase().includes(term) ||
        bill._id?.toLowerCase().includes(term)
    );
  }, [pendingBills, pendingSearch]);

  const filteredWalletTx = useMemo(() => {
    if (!walletSearch.trim()) return billTransactions;
    const term = walletSearch.toLowerCase();
    return billTransactions.filter(
      (tx) =>
        tx.customer?.name?.toLowerCase().includes(term) ||
        tx.order?.invoiceNumber?.toLowerCase().includes(term) ||
        tx.invoiceNumber?.toLowerCase().includes(term) ||
        tx.bill?.invoiceNumber?.toLowerCase().includes(term)
    );
  }, [billTransactions, walletSearch]);

  const handlePendingBillSelect = (billId) => {
    setSelectedPendingBills((prev) =>
      prev.includes(billId) ? prev.filter((id) => id !== billId) : [...prev, billId]
    );
  };

  const handleSelectAllPending = () => {
    if (selectAllPending) {
      setSelectedPendingBills([]);
    } else {
      setSelectedPendingBills(filteredPendingBills.map((b) => b._id));
    }
    setSelectAllPending(!selectAllPending);
  };

  const handleWalletTxSelect = (txId) => {
    setSelectedWalletTx((prev) =>
      prev.includes(txId) ? prev.filter((id) => id !== txId) : [...prev, txId]
    );
  };

  const handleSelectAllWallet = () => {
    if (selectAllWallet) {
      setSelectedWalletTx([]);
    } else {
      setSelectedWalletTx(
        filteredWalletTx.filter((tx) => tx.status === "received").map((tx) => tx._id)
      );
    }
    setSelectAllWallet(!selectAllWallet);
  };

  const handleCashRequestSelect = (reqId) => {
    setSelectedCashRequests((prev) =>
      prev.includes(reqId) ? prev.filter((id) => id !== reqId) : [...prev, reqId]
    );
  };

  const handleSelectAllCashRequests = () => {
    if (selectAllCashRequests) {
      setSelectedCashRequests([]);
    } else {
      setSelectedCashRequests(cashRequests.map((r) => r._id));
    }
    setSelectAllCashRequests(!selectAllCashRequests);
  };

  const handleChequeRequestSelect = (reqId) => {
    setSelectedChequeRequests((prev) =>
      prev.includes(reqId) ? prev.filter((id) => id !== reqId) : [...prev, reqId]
    );
  };

  const handleSelectAllChequeRequests = () => {
    if (selectAllChequeRequests) {
      setSelectedChequeRequests([]);
    } else {
      setSelectedChequeRequests(chequeRequests.map((r) => r._id));
    }
    setSelectAllChequeRequests(!selectAllChequeRequests);
  };

  useEffect(() => {
    if (filteredPendingBills.length > 0 && selectedPendingBills.length === filteredPendingBills.length) {
      setSelectAllPending(true);
    } else {
      setSelectAllPending(false);
    }
  }, [filteredPendingBills, selectedPendingBills]);

  useEffect(() => {
    const readyTx = filteredWalletTx.filter((tx) => tx.status === "received");
    if (readyTx.length > 0 && selectedWalletTx.length === readyTx.length) {
      setSelectAllWallet(true);
    } else {
      setSelectAllWallet(false);
    }
  }, [filteredWalletTx, selectedWalletTx]);

  useEffect(() => {
    if (cashRequests.length > 0 && selectedCashRequests.length === cashRequests.length) {
      setSelectAllCashRequests(true);
    } else {
      setSelectAllCashRequests(false);
    }
  }, [cashRequests, selectedCashRequests]);

  useEffect(() => {
    if (chequeRequests.length > 0 && selectedChequeRequests.length === chequeRequests.length) {
      setSelectAllChequeRequests(true);
    } else {
      setSelectAllChequeRequests(false);
    }
  }, [chequeRequests, selectedChequeRequests]);

  // ✅ DOWNLOAD RECEIPT - Uses immutable invoiceNumber
  const downloadReceipt = async (billId, invoiceNumber) => {
    if (!billId) {
      toast.error("No bill associated");
      return;
    }
    const token = localStorage.getItem("token");
    if (!token) {
      toast.error("Please login again");
      return;
    }
    try {
      const response = await fetch(`${backendUrl}/api/bills/receipt/${billId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/pdf",
        },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Server error ${response.status}`);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      // ✅ Use immutable invoice number in filename (DEL-XXX format)
      link.download = invoiceNumber
        ? `receipt-${invoiceNumber}.pdf`
        : `receipt_${billId.slice(-8)}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success("Receipt downloaded");
    } catch (error) {
      console.error("Receipt download failed:", error);
      toast.error("Failed to download receipt: " + (error.message || "Unknown error"));
    }
  };

  const downloadBulkReceipt = async () => {
  if (selectedWalletTx.length === 0) {
    toast.error("Please select at least one transaction");
    return;
  }

  try {
    const token = localStorage.getItem("token");

    // Optional: collect all unique invoice numbers for better naming
    const uniqueInvoices = [
      ...new Set(
        filteredWalletTx
          .filter(tx => selectedWalletTx.includes(tx._id))
          .map(tx =>
            tx.bill?.invoiceNumber ||
            tx.invoiceNumber ||
            tx.order?.invoiceNumber ||
            "NA"
          )
      )
    ];

    let filenameBase;
    if (uniqueInvoices.length === 1) {
      filenameBase = uniqueInvoices[0];
    } else if (uniqueInvoices.length > 1) {
      filenameBase = "multiple-invoices";
      // Alternative: "DEL-01-DEL-02" if not too many
      // filenameBase = uniqueInvoices.slice(0, 3).join("-") + (uniqueInvoices.length > 3 ? "-etc" : "");
    } else {
      filenameBase = Date.now();
    }

    const response = await axios.post(
      `${backendUrl}/api/bill-transactions/bulk-receipt`,
      { transactionIds: selectedWalletTx },
      {
        headers: { Authorization: `Bearer ${token}` },
        responseType: "blob",
      }
    );

    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `bulk-receipt-${filenameBase}.pdf`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    toast.success("Bulk receipt downloaded");
  } catch (error) {
    console.error("Download bulk receipt error:", error);
    toast.error("Failed to download bulk receipt");
  }
};
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

  // ✅✅✅ OPEN PAY TO ADMIN MODAL (Single)
  const handlePayToAdminClick = (txId) => {
    setPayToAdminTxId(txId);
    setPayToAdminMethod("cash");
    setPayToAdminChequeDetails({ number: "", bank: "", date: "" });
    setShowPayToAdminModal(true);
  };

  // ✅✅✅ CLOSE PAY TO ADMIN MODAL
  const closePayToAdminModal = () => {
    setShowPayToAdminModal(false);
    setPayToAdminTxId(null);
    setPayToAdminMethod("cash");
    setPayToAdminChequeDetails({ number: "", bank: "", date: "" });
  };

  // ✅✅✅ SUBMIT PAY TO ADMIN (Single) - with method & cheque details
  const submitPayToAdmin = async () => {
    if (!payToAdminTxId) return;

    // Validate cheque details if needed
    if (payToAdminMethod === "cheque") {
      if (!payToAdminChequeDetails.number || !payToAdminChequeDetails.bank || !payToAdminChequeDetails.date) {
        return toast.error("Please fill all cheque details");
      }
    }

    closePayToAdminModal();
    setProcessingId(payToAdminTxId);

    try {
      const token = localStorage.getItem("token");
      // ✅ Send payment method & cheque details to backend
      await axios.post(
        `${backendUrl}/api/bill-transactions/pay-to-admin/${payToAdminTxId}`,
        {
          method: payToAdminMethod,
          chequeDetails: payToAdminMethod === "cheque" ? payToAdminChequeDetails : undefined,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Payment sent to admin successfully");
      fetchData();
    } catch (error) {
      console.error("Pay to admin error:", error);
      toast.error(error.response?.data?.message || "Failed to send payment");
    } finally {
      setProcessingId(null);
    }
  };

  const handleMarkReceivedClick = (billId, amountDue, invoiceNumber) => {
    setBillToMark({ id: billId, amountDue, invoiceNumber });
    setMarkAmount(amountDue.toFixed(2));
    setMarkMethod("cash");
    setMarkChequeDetails({ number: "", bank: "", date: "" });
    setShowMarkModal(true);
  };

  const handleBulkMarkReceived = () => {
    if (selectedPendingBills.length === 0) {
      toast.error("Please select at least one bill");
      return;
    }
    setBulkMarkMethod("cash");
    setBulkMarkChequeDetails({ number: "", bank: "", date: "" });
    setShowBulkMarkModal(true);
  };

  // ✅✅✅ OPEN BULK PAY TO ADMIN MODAL
  const handleBulkPayToAdmin = () => {
    const readyTx = filteredWalletTx.filter((tx) => tx.status === "received");
    const selectedReady = selectedWalletTx.filter((id) => readyTx.some((tx) => tx._id === id));
    if (selectedReady.length === 0) {
      toast.error("No 'Ready to Pay' transactions selected");
      return;
    }
    setBulkPayMethod("cash");
    setBulkPayChequeDetails({ number: "", bank: "", date: "" });
    setShowBulkPayToAdminModal(true);
  };

  // ✅✅✅ SUBMIT BULK PAY TO ADMIN - with method & cheque details
  const submitBulkPayToAdmin = async () => {
    // Validate cheque details if needed
    if (bulkPayMethod === "cheque") {
      if (!bulkPayChequeDetails.number || !bulkPayChequeDetails.bank || !bulkPayChequeDetails.date) {
        return toast.error("Please fill all cheque details");
      }
    }

    setShowBulkPayToAdminModal(false);
    setBulkProcessing(true);

    try {
      const token = localStorage.getItem("token");
      let success = 0, fail = 0;

      for (const txId of selectedWalletTx) {
        const tx = filteredWalletTx.find((t) => t._id === txId);
        if (!tx || tx.status !== "received") continue;

        try {
          await axios.post(
            `${backendUrl}/api/bill-transactions/pay-to-admin/${txId}`,
            {
              method: bulkPayMethod,
              chequeDetails: bulkPayMethod === "cheque" ? {
                ...bulkPayChequeDetails,
                number: `${bulkPayChequeDetails.number}-${txId.slice(-4)}`,
              } : undefined,
            },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          success++;
        } catch (err) {
          fail++;
        }
      }

      if (success > 0) toast.success(`${success} payment(s) sent to admin`);
      if (fail > 0) toast.error(`${fail} failed`);
      fetchData();
    } catch (err) {
      toast.error("Bulk pay failed");
    } finally {
      setBulkProcessing(false);
      setSelectedWalletTx([]);
      setSelectAllWallet(false);
    }
  };

  const confirmBulkPayToAdmin = async () => {
  setShowBulkPayModal(false);
  setBulkProcessing(true);
  
  try {
    const token = localStorage.getItem("token");
    let success = 0, fail = 0;
    
    for (const txId of selectedWalletTx) {
      const tx = filteredWalletTx.find((t) => t._id === txId);
      if (!tx || tx.status !== "received") continue;
      
      try {
        await axios.post(
          `${backendUrl}/api/bill-transactions/pay-to-admin/${txId}`,
          {}, // No body needed for single - method already stored in tx
          { headers: { Authorization: `Bearer ${token}` } }
        );
        success++;
      } catch (err) {
        fail++;
      }
    }
    
    if (success > 0) toast.success(`${success} payment(s) sent to admin`);
    if (fail > 0) toast.error(`${fail} failed`);
    fetchData();
  } catch (err) {
    toast.error("Bulk pay failed");
  } finally {
    setBulkProcessing(false);
    setSelectedWalletTx([]);
    setSelectAllWallet(false);
  }
};

  const handleBulkAcceptRequests = (type) => {
    const selected = type === "cash" ? selectedCashRequests : selectedChequeRequests;
    if (selected.length === 0) {
      toast.error(`Please select at least one ${type} request`);
      return;
    }
    setBulkRequestAction("accept");
    setShowBulkRequestModal(true);
  };

  const handleBulkRejectRequests = (type) => {
    const selected = type === "cash" ? selectedCashRequests : selectedChequeRequests;
    if (selected.length === 0) {
      toast.error(`Please select at least one ${type} request`);
      return;
    }
    setBulkRequestAction("reject");
    setShowBulkRequestModal(true);
  };

  const confirmActionHandler = async () => {
    if (!itemToProcess) return;
    setShowConfirmModal(false);
    setProcessingId(itemToProcess);
    try {
      const token = localStorage.getItem("token");
      let endpoint = "";
      let successMsg = "";
      switch (confirmAction) {
        case "accept":
          endpoint = `${backendUrl}/api/payment-requests/accept/${itemToProcess}`;
          successMsg = "Payment request accepted";
          break;
        case "reject":
          endpoint = `${backendUrl}/api/payment-requests/reject/${itemToProcess}`;
          successMsg = "Payment request rejected";
          break;
        default:
          return;
      }
      await axios.post(endpoint, {}, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(successMsg);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || "Action failed");
    } finally {
      setProcessingId(null);
      setItemToProcess(null);
      setConfirmAction(null);
    }
  };

  const confirmMarkReceived = async () => {
    const amount = parseFloat(markAmount);
    if (isNaN(amount) || amount <= 0 || amount > billToMark.amountDue) {
      toast.error("Invalid amount");
      return;
    }
    if (markMethod === "cheque" && (!markChequeDetails.number || !markChequeDetails.bank || !markChequeDetails.date)) {
      toast.error("Complete cheque details");
      return;
    }
    setShowMarkModal(false);
    setProcessingId(billToMark.id);
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${backendUrl}/api/bills/mark-received`,
        {
          billId: billToMark.id,
          amount,
          method: markMethod,
          chequeDetails: markMethod === "cheque" ? markChequeDetails : undefined,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Bill marked as received");
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to mark bill");
    } finally {
      setProcessingId(null);
      setBillToMark(null);
      setMarkAmount("");
    }
  };

  const confirmBulkMarkReceived = async () => {
    if (bulkMarkMethod === "cheque" && (!bulkMarkChequeDetails.number || !bulkMarkChequeDetails.bank || !bulkMarkChequeDetails.date)) {
      toast.error("Complete cheque details");
      return;
    }
    setShowBulkMarkModal(false);
    setBulkProcessing(true);
    try {
      const token = localStorage.getItem("token");

      // Generate batch receipt identifier
      const batchId = `REC-BATCH-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(Math.random()*10000).toString().padStart(4,'0')}`;

      let success = 0, fail = 0;
      for (const billId of selectedPendingBills) {
        const bill = pendingBills.find((b) => b._id === billId);
        if (!bill || bill.status !== "pending") continue;
        try {
          await axios.post(
            `${backendUrl}/api/bills/mark-received`,
            {
              billId,
              amount: bill.amountDue,
              method: bulkMarkMethod,
              chequeDetails: bulkMarkMethod === "cheque" ? {
                ...bulkMarkChequeDetails,
                number: `${bulkMarkChequeDetails.number}-${bill._id.slice(-4)}`,
              } : undefined,
              batchId,   // ← new field
            },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          success++;
        } catch (err) {
          fail++;
        }
      }
      if (success > 0) {
        toast.success(`${success} bill${success > 1 ? 's' : ''} marked as received (Batch: ${batchId})`);
      }
      if (fail > 0) toast.error(`${fail} failed`);
      fetchData();
    } catch (err) {
      toast.error("Bulk operation failed");
    } finally {
      setBulkProcessing(false);
      setSelectedPendingBills([]);
      setSelectAllPending(false);
    }
  };

  const confirmBulkRequestAction = async () => {
    setShowBulkRequestModal(false);
    setBulkProcessing(true);
    try {
      const token = localStorage.getItem("token");
      let success = 0, fail = 0;
      const selectedIds = bulkRequestAction === "accept"
        ? [...selectedCashRequests, ...selectedChequeRequests]
        : [...selectedCashRequests, ...selectedChequeRequests];
      for (const reqId of selectedIds) {
        const req = requests.find((r) => r._id === reqId);
        if (!req || req.status !== "pending") continue;
        try {
          const endpoint = bulkRequestAction === "accept"
            ? `${backendUrl}/api/payment-requests/accept/${reqId}`
            : `${backendUrl}/api/payment-requests/reject/${reqId}`;
          await axios.post(endpoint, {}, { headers: { Authorization: `Bearer ${token}` } });
          success++;
        } catch (err) {
          fail++;
        }
      }
      if (success > 0)
        toast.success(`${success} request(s) ${bulkRequestAction === "accept" ? "accepted" : "rejected"}`);
      if (fail > 0) toast.error(`${fail} failed`);
      fetchData();
    } catch (err) {
      toast.error("Bulk request action failed");
    } finally {
      setBulkProcessing(false);
      setSelectedCashRequests([]);
      setSelectedChequeRequests([]);
      setSelectAllCashRequests(false);
      setSelectAllChequeRequests(false);
      setBulkRequestAction(null);
    }
  };

  const calculateTotal = (list, statuses = ["received", "pending"]) =>
    list.filter((t) => statuses.includes(t.status)).reduce((sum, t) => sum + t.amount, 0);

  const cashTotalWallet = calculateTotal(cashTx);
  const chequeTotalWallet = calculateTotal(chequeTx);

  // ✅ NEW: Calculate filtered total for pending bills
  const filteredTotalDue = useMemo(() => {
    return filteredPendingBills.reduce((sum, b) => sum + b.amountDue, 0);
  }, [filteredPendingBills]);

  // ✅ NEW: Calculate selected total for pending bills
  const selectedTotalDue = useMemo(() => {
    return pendingBills
      .filter((b) => selectedPendingBills.includes(b._id))
      .reduce((sum, b) => sum + b.amountDue, 0);
  }, [pendingBills, selectedPendingBills]);

  if (!user) return <div className="requests-loading">Loading...</div>;

  return (
    <div className="requests-layout">
      <Header sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} user={user} />
      <Sidebar
        isOpen={sidebarOpen}
        activeItem={activeItem}
        onSetActiveItem={setActiveItem}
        onClose={() => setSidebarOpen(false)}
        user={user}
      />
      <main className={`requests-main-content ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="requests-container">
          <h2 className="requests-page-title">Payment Requests (Delivery Man)</h2>

          {/* Wallet Section */}
          <div className="requests-section wallet-section">
            <div className="section-header-with-actions">
              <h3>My Accepted Payments (Wallet)</h3>
              <div className="search-box">
                <input
                  type="text"
                  placeholder="Search customer or invoice #..."
                  value={walletSearch}
                  onChange={(e) => setWalletSearch(e.target.value)}
                  className="search-input"
                />
                {walletSearch && <button className="search-clear" onClick={() => setWalletSearch("")}>✕</button>}
              </div>
            </div>

            <div className="requests-summary small">
              <div className="summary-card small">
                <h4>Cash Ready</h4>
                <div className="amount">
                  <img src={DirhamSymbol} alt="AED" width={20} />
                  <span>{cashTotalWallet.toFixed(2)}</span>
                </div>
              </div>
              <div className="summary-card small">
                <h4>Cheque Ready</h4>
                <div className="amount">
                  <img src={DirhamSymbol} alt="AED" width={20} />
                  <span>{chequeTotalWallet.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {selectedWalletTx.length > 0 && (
              <div className="bulk-action-bar">
                <span>{selectedWalletTx.length} selected</span>
                <button className="bulk-receipt-btn" onClick={downloadBulkReceipt} disabled={bulkProcessing}>
                  {bulkProcessing ? "Processing..." : "Download Bulk Receipt"}
                </button>
                <button className="bulk-pay-btn" onClick={handleBulkPayToAdmin} disabled={bulkProcessing}>
                  {bulkProcessing ? "Processing..." : "Pay Selected to Admin"}
                </button>
                <button
                  className="bulk-clear-btn"
                  onClick={() => {
                    setSelectedWalletTx([]);
                    setSelectAllWallet(false);
                  }}
                >
                  Clear
                </button>
              </div>
            )}

            {loading ? (
              <div className="loading">Loading wallet...</div>
            ) : filteredWalletTx.length === 0 ? (
              <div className="no-data">No transactions yet</div>
            ) : (
              <div className="table-responsive">
                <table className="requests-table">
                  <thead>
                    <tr>
                      <th className="checkbox-col">
                        <input type="checkbox" checked={selectAllWallet} onChange={handleSelectAllWallet} />
                      </th>
                      <th>No</th>
                      <th>Customer</th>
                      <th>Invoice #</th>
                      <th>Amount</th>
                      <th>Method</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredWalletTx.map((tx, idx) => {
                      const isReady = tx.status === "received";
                      const hasBill = !!tx.bill?._id;
                      // ✅✅✅ CRITICAL FIX: Use bill/transaction invoiceNumber (immutable)
                      // NOT order.invoiceNumber (which may have been updated to DEL-02)
                      const invoiceNo =
                        tx.bill?.invoiceNumber ||
                        tx.invoiceNumber ||
                        tx.order?.invoiceNumber ||
                        tx.bill?.orders?.[0]?.invoiceNumber ||
                        "N/A";

                      return (
                        <tr key={tx._id} className={selectedWalletTx.includes(tx._id) ? "selected-row" : ""}>
                          <td className="checkbox-col">
                            <input
                              type="checkbox"
                              checked={selectedWalletTx.includes(tx._id)}
                              onChange={() => handleWalletTxSelect(tx._id)}
                              disabled={!isReady}
                            />
                          </td>
                          <td>{idx + 1}</td>
                          <td>{tx.customer?.name || "—"}</td>
                          <td>
                            <strong className="invoice-number-cell">{invoiceNo}</strong>
                          </td>
                          <td>{tx.amount.toFixed(2)}</td>
                          <td>{tx.method?.charAt(0).toUpperCase() + tx.method?.slice(1) || "—"}</td>
                          <td>{new Date(tx.createdAt).toLocaleDateString()}</td>
                          <td>
                            <span className={`status-badge status-${tx.status}`}>
                              {tx.status === "received"
                                ? "Ready to Pay"
                                : tx.status === "pending"
                                ? "Sent to Admin"
                                : tx.status === "paid_to_admin"
                                ? "Paid to Admin"
                                : tx.status}
                            </span>
                          </td>
                          <td className="actions-col">
                            {isReady && (
                              <button className="pay-admin-btn" onClick={() => handlePayToAdminClick(tx._id)}>
                                Pay to Admin
                              </button>
                            )}
                            {hasBill && (
                              <button
                                className="download-receipt-btn"
                                onClick={() => downloadReceipt(tx.bill._id, invoiceNo)}
                                title="Download Receipt"
                              >
                                Receipt
                              </button>
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

          {/* Pending Bills Section */}
          <div className="requests-section pending-bills-section">
            <div className="section-header-with-actions">
              <h3>Pending Customer Bills</h3>
              <div className="search-box">
                <input
                  type="text"
                  placeholder="Search customer or invoice #..."
                  value={pendingSearch}
                  onChange={(e) => setPendingSearch(e.target.value)}
                  className="search-input"
                />
                {pendingSearch && <button className="search-clear" onClick={() => setPendingSearch("")}>✕</button>}
              </div>
            </div>

            {/* ✅ NEW: Filtered Summary */}
            {pendingSearch.trim() && (
              <div className="filtered-summary" style={{ margin: "8px 0", fontSize: "0.95rem", color: "#475569", padding: "4px 8px", backgroundColor: "#f1f5f9" }}>
                Showing <strong>{filteredPendingBills.length}</strong> pending bill
                {filteredPendingBills.length !== 1 ? "s" : ""} for "
                <strong>{pendingSearch}</strong>" — Total Due:{" "}
                <strong>
                  AED {filteredTotalDue.toFixed(2)}
                </strong>
              </div>
            )}

            {selectedPendingBills.length > 0 && (
              <div className="bulk-action-bar">
                <span>
                  {selectedPendingBills.length} selected — Total:{" "}
                  <strong>AED {selectedTotalDue.toFixed(2)}</strong>
                </span>
                <button className="bulk-mark-btn" onClick={handleBulkMarkReceived} disabled={bulkProcessing}>
                  {bulkProcessing ? "Processing..." : "Mark Selected as Received"}
                </button>
                <button
                  className="bulk-clear-btn"
                  onClick={() => {
                    setSelectedPendingBills([]);
                    setSelectAllPending(false);
                  }}
                >
                  Clear
                </button>
              </div>
            )}

            {loading ? (
              <div className="loading">Loading...</div>
            ) : filteredPendingBills.length === 0 ? (
              <div className="no-data">No pending bills</div>
            ) : (
              <div className="table-responsive">
                <table className="requests-table">
                  <thead>
                    <tr>
                      <th className="checkbox-col">
                        <input type="checkbox" checked={selectAllPending} onChange={handleSelectAllPending} />
                      </th>
                      <th>No</th>
                      <th>Customer</th>
                      <th>Invoice #</th>
                      <th>Amount Due</th>
                      <th>Due Date</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPendingBills.map((bill, idx) => {
                      const invoiceNo = bill.invoiceNumber || bill.orders?.[0]?.invoiceNumber || "N/A";
                      return (
                        <tr key={bill._id} className={selectedPendingBills.includes(bill._id) ? "selected-row" : ""}>
                          <td className="checkbox-col">
                            <input
                              type="checkbox"
                              checked={selectedPendingBills.includes(bill._id)}
                              onChange={() => handlePendingBillSelect(bill._id)}
                              disabled={bill.status !== "pending"}
                            />
                          </td>
                          <td>{idx + 1}</td>
                          <td>{bill.customer?.name || "—"}</td>
                          <td>
                            <strong className="invoice-number-cell">{invoiceNo}</strong>
                          </td>
                          <td>{bill.amountDue.toFixed(2)}</td>
                          <td>{new Date(bill.dueDate).toLocaleDateString()}</td>
                          <td>
                            <span className={`status-badge status-${bill.status}`}>{bill.status}</span>
                          </td>
                          <td className="actions-col">
                            {bill.status === "pending" && (
                              <button
                                className="mark-received-btn"
                                onClick={() => handleMarkReceivedClick(bill._id, bill.amountDue, invoiceNo)}
                                disabled={processingId === bill._id}
                              >
                                Mark Received
                              </button>
                            )}
                            {(bill.status === "paid" || bill.status === "partial") && (
                              <button
                                className="download-receipt-btn"
                                onClick={() => downloadReceipt(bill._id, invoiceNo)}
                              >
                                Receipt
                              </button>
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

          {/* Cash Requests Section */}
          <div className="requests-section">
            <div className="section-header-with-actions">
              <h3>Cash Payment Requests from Customers</h3>
              <div className="search-box">
                <input
                  type="text"
                  placeholder="Search customer or invoice #..."
                  value={pendingSearch}
                  onChange={(e) => setPendingSearch(e.target.value)}
                  className="search-input"
                />
                {pendingSearch && <button className="search-clear" onClick={() => setPendingSearch("")}>✕</button>}
              </div>
            </div>

            {selectedCashRequests.length > 0 && (
              <div className="bulk-action-bar">
                <span>{selectedCashRequests.length} selected</span>
                <button className="bulk-accept-btn" onClick={() => handleBulkAcceptRequests("cash")} disabled={bulkProcessing}>
                  {bulkProcessing ? "Processing..." : "Accept Selected"}
                </button>
                <button className="bulk-reject-btn" onClick={() => handleBulkRejectRequests("cash")} disabled={bulkProcessing}>
                  {bulkProcessing ? "Processing..." : "Reject Selected"}
                </button>
                <button
                  className="bulk-clear-btn"
                  onClick={() => {
                    setSelectedCashRequests([]);
                    setSelectAllCashRequests(false);
                  }}
                >
                  Clear
                </button>
              </div>
            )}

            {loading ? (
              <div className="loading">Loading...</div>
            ) : cashRequests.length === 0 ? (
              <div className="no-data">No cash requests</div>
            ) : (
              <div className="table-responsive">
                <table className="requests-table">
                  <thead>
                    <tr>
                      <th className="checkbox-col">
                        <input type="checkbox" checked={selectAllCashRequests} onChange={handleSelectAllCashRequests} />
                      </th>
                      <th>No</th>
                      <th>Customer</th>
                      <th>Invoice #</th>
                      <th>Amount</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashRequests.map((req, idx) => {
                      const invoiceNo = req.invoiceNumber || req.bill?.invoiceNumber || req.bill?.orders?.[0]?.invoiceNumber || "N/A";
                      return (
                        <tr key={req._id} className={selectedCashRequests.includes(req._id) ? "selected-row" : ""}>
                          <td className="checkbox-col">
                            <input
                              type="checkbox"
                              checked={selectedCashRequests.includes(req._id)}
                              onChange={() => handleCashRequestSelect(req._id)}
                              disabled={req.status !== "pending"}
                            />
                          </td>
                          <td>{idx + 1}</td>
                          <td>{req.customer?.name || "—"}</td>
                          <td>
                            <strong className="invoice-number-cell">{invoiceNo}</strong>
                          </td>
                          <td>{req.amount.toFixed(2)}</td>
                          <td>{new Date(req.createdAt).toLocaleDateString()}</td>
                          <td>
                            <span className={`status-badge status-${req.status}`}>{req.status}</span>
                          </td>
                          <td>
                            {req.status === "pending" && (
                              <div className="action-buttons">
                                <button className="accept-btn" onClick={() => handleAcceptClick(req._id)}>Accept</button>
                                <button className="reject-btn" onClick={() => handleRejectClick(req._id)}>Reject</button>
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

          {/* Cheque Requests Section */}
          <div className="requests-section">
            <div className="section-header-with-actions">
              <h3>Cheque Payment Requests from Customers</h3>
              <div className="search-box">
                <input
                  type="text"
                  placeholder="Search customer or invoice #..."
                  value={pendingSearch}
                  onChange={(e) => setPendingSearch(e.target.value)}
                  className="search-input"
                />
                {pendingSearch && <button className="search-clear" onClick={() => setPendingSearch("")}>✕</button>}
              </div>
            </div>

            {selectedChequeRequests.length > 0 && (
              <div className="bulk-action-bar">
                <span>{selectedChequeRequests.length} selected</span>
                <button className="bulk-accept-btn" onClick={() => handleBulkAcceptRequests("cheque")} disabled={bulkProcessing}>
                  {bulkProcessing ? "Processing..." : "Accept Selected"}
                </button>
                <button className="bulk-reject-btn" onClick={() => handleBulkRejectRequests("cheque")} disabled={bulkProcessing}>
                  {bulkProcessing ? "Processing..." : "Reject Selected"}
                </button>
                <button
                  className="bulk-clear-btn"
                  onClick={() => {
                    setSelectedChequeRequests([]);
                    setSelectAllChequeRequests(false);
                  }}
                >
                  Clear
                </button>
              </div>
            )}

            {loading ? (
              <div className="loading">Loading...</div>
            ) : chequeRequests.length === 0 ? (
              <div className="no-data">No cheque requests</div>
            ) : (
              <div className="table-responsive">
                <table className="requests-table">
                  <thead>
                    <tr>
                      <th className="checkbox-col">
                        <input type="checkbox" checked={selectAllChequeRequests} onChange={handleSelectAllChequeRequests} />
                      </th>
                      <th>No</th>
                      <th>Customer</th>
                      <th>Invoice #</th>
                      <th>Amount</th>
                      <th>Cheque Details</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chequeRequests.map((req, idx) => {
                      const invoiceNo = req.invoiceNumber || req.bill?.invoiceNumber || req.bill?.orders?.[0]?.invoiceNumber || "N/A";
                      return (
                        <tr key={req._id} className={selectedChequeRequests.includes(req._id) ? "selected-row" : ""}>
                          <td className="checkbox-col">
                            <input
                              type="checkbox"
                              checked={selectedChequeRequests.includes(req._id)}
                              onChange={() => handleChequeRequestSelect(req._id)}
                              disabled={req.status !== "pending"}
                            />
                          </td>
                          <td>{idx + 1}</td>
                          <td>{req.customer?.name || "—"}</td>
                          <td>
                            <strong className="invoice-number-cell">{invoiceNo}</strong>
                          </td>
                          <td>{req.amount.toFixed(2)}</td>
                          <td>
                            {req.chequeDetails ? (
                              <div className="cheque-info">
                                <div><strong>No:</strong> {req.chequeDetails.number || "—"}</div>
                                <div><strong>Bank:</strong> {req.chequeDetails.bank || "—"}</div>
                                <div><strong>Date:</strong> {req.chequeDetails.date ? new Date(req.chequeDetails.date).toLocaleDateString() : "—"}</div>
                              </div>
                            ) : "—"}
                          </td>
                          <td>{new Date(req.createdAt).toLocaleDateString()}</td>
                          <td>
                            <span className={`status-badge status-${req.status}`}>{req.status}</span>
                          </td>
                          <td>
                            {req.status === "pending" && (
                              <div className="action-buttons">
                                <button className="accept-btn" onClick={() => handleAcceptClick(req._id)}>Accept</button>
                                <button className="reject-btn" onClick={() => handleRejectClick(req._id)}>Reject</button>
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

      {/* ─── Existing Modals ──────────────────────────────────────────────── */}
      {showConfirmModal && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal">
            <h3>
              {confirmAction === "accept"
                ? "Accept Payment Request?"
                : confirmAction === "reject"
                ? "Reject Payment Request?"
                : "Send Payment to Admin?"}
            </h3>
            <p>
              {confirmAction === "accept"
                ? "Are you sure you received this payment?"
                : confirmAction === "reject"
                ? "Are you sure you want to reject this request?"
                : "Confirm you have sent this amount to admin?"}
            </p>
            <div className="confirm-actions">
              <button className="confirm-cancel" onClick={() => setShowConfirmModal(false)}>
                Cancel
              </button>
              <button
                className={`confirm-${confirmAction}`}
                onClick={confirmActionHandler}
                disabled={processingId === itemToProcess}
              >
                {processingId === itemToProcess
                  ? "Processing..."
                  : confirmAction === "accept"
                  ? "Yes, Accept"
                  : confirmAction === "reject"
                  ? "Yes, Reject"
                  : "Yes, Send"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showMarkModal && billToMark && (
        <div className="pay-modal-overlay">
          <div className="pay-modal">
            <h3>Mark Bill as Received</h3>
            <div className="pay-modal-info">
              <p><strong>Invoice:</strong> {billToMark.invoiceNumber || "N/A"}</p>
              <p><strong>Due Amount:</strong> AED {billToMark.amountDue.toFixed(2)}</p>
            </div>
            <div className="pay-modal-input-group">
              <label>Amount Received (AED)</label>
              <input type="number" step="0.01" value={markAmount} onChange={(e) => setMarkAmount(e.target.value)} className="pay-modal-input" />
            </div>
            <div className="pay-modal-input-group">
              <label>Payment Method</label>
              <select value={markMethod} onChange={(e) => setMarkMethod(e.target.value)} className="pay-modal-select">
                <option value="cash">Cash</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>
            {markMethod === "cheque" && (
              <div className="pay-modal-cheque-group">
                <input placeholder="Cheque Number" value={markChequeDetails.number} onChange={(e) => setMarkChequeDetails({ ...markChequeDetails, number: e.target.value })} />
                <input placeholder="Bank Name" value={markChequeDetails.bank} onChange={(e) => setMarkChequeDetails({ ...markChequeDetails, bank: e.target.value })} />
                <input type="date" value={markChequeDetails.date} onChange={(e) => setMarkChequeDetails({ ...markChequeDetails, date: e.target.value })} />
              </div>
            )}
            <div className="pay-modal-actions">
              <button className="pay-modal-cancel" onClick={() => setShowMarkModal(false)}>Cancel</button>
              <button className="pay-modal-confirm" onClick={confirmMarkReceived} disabled={processingId === billToMark.id}>
                {processingId === billToMark.id ? "Processing..." : "Mark Received"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkMarkModal && (
        <div className="pay-modal-overlay">
          <div className="pay-modal bulk-modal">
            <h3>Mark {selectedPendingBills.length} Bills as Received</h3>
            <div className="pay-modal-info">
              <p>Total Due: AED {selectedTotalDue.toFixed(2)}</p>
            </div>
            <div className="pay-modal-input-group">
              <label>Payment Method (applied to all)</label>
              <select value={bulkMarkMethod} onChange={(e) => setBulkMarkMethod(e.target.value)} className="pay-modal-select">
                <option value="cash">Cash</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>
            {bulkMarkMethod === "cheque" && (
              <div className="pay-modal-cheque-group">
                <input placeholder="Cheque No (prefix)" value={bulkMarkChequeDetails.number} onChange={(e) => setBulkMarkChequeDetails({ ...bulkMarkChequeDetails, number: e.target.value })} />
                <input placeholder="Bank Name" value={bulkMarkChequeDetails.bank} onChange={(e) => setBulkMarkChequeDetails({ ...bulkMarkChequeDetails, bank: e.target.value })} />
                <input type="date" value={bulkMarkChequeDetails.date} onChange={(e) => setBulkMarkChequeDetails({ ...bulkMarkChequeDetails, date: e.target.value })} />
              </div>
            )}
            <div className="pay-modal-actions">
              <button className="pay-modal-cancel" onClick={() => setShowBulkMarkModal(false)}>Cancel</button>
              <button className="pay-modal-confirm" onClick={confirmBulkMarkReceived} disabled={bulkProcessing}>
                {bulkProcessing ? "Processing..." : "Mark All as Received"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkPayModal && (
        <div className="pay-modal-overlay">
          <div className="pay-modal bulk-modal">
            <h3>Send {selectedWalletTx.length} Payments to Admin</h3>
            <div className="pay-modal-info">
              <p>Total: AED {filteredWalletTx.filter((tx) => selectedWalletTx.includes(tx._id)).reduce((sum, tx) => sum + tx.amount, 0).toFixed(2)}</p>
            </div>
            <div className="pay-modal-actions">
              <button className="pay-modal-cancel" onClick={() => setShowBulkPayModal(false)}>Cancel</button>
              <button className="pay-modal-confirm" onClick={confirmBulkPayToAdmin} disabled={bulkProcessing}>
                {bulkProcessing ? "Processing..." : "Send Selected to Admin"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkRequestModal && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal bulk-modal">
            <h3>
              {bulkRequestAction === "accept"
                ? `Accept ${selectedCashRequests.length + selectedChequeRequests.length} Requests?`
                : `Reject ${selectedCashRequests.length + selectedChequeRequests.length} Requests?`}
            </h3>
            <p>Are you sure? This action cannot be undone.</p>
            <div className="confirm-actions">
              <button className="confirm-cancel" onClick={() => setShowBulkRequestModal(false)}>Cancel</button>
              <button className={`confirm-${bulkRequestAction}`} onClick={confirmBulkRequestAction} disabled={bulkProcessing}>
                {bulkProcessing ? "Processing..." : bulkRequestAction === "accept" ? "Yes, Accept All" : "Yes, Reject All"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅✅✅ NEW: Pay to Admin Modal (Single) */}
      {showPayToAdminModal && (
        <div className="pay-modal-overlay">
          <div className="pay-modal">
            <h3>Send Payment to Admin</h3>
            <div className="pay-modal-info">
              <p><strong>Amount:</strong> AED {filteredWalletTx.find((tx) => tx._id === payToAdminTxId)?.amount.toFixed(2) || "0.00"}</p>
            </div>
            <div className="pay-modal-input-group">
              <label>Payment Method</label>
              <select value={payToAdminMethod} onChange={(e) => setPayToAdminMethod(e.target.value)} className="pay-modal-select">
                <option value="cash">Cash</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>
            {payToAdminMethod === "cheque" && (
              <div className="pay-modal-cheque-group">
                <input
                  placeholder="Cheque Number *"
                  value={payToAdminChequeDetails.number}
                  onChange={(e) => setPayToAdminChequeDetails({ ...payToAdminChequeDetails, number: e.target.value })}
                />
                <input
                  placeholder="Bank Name *"
                  value={payToAdminChequeDetails.bank}
                  onChange={(e) => setPayToAdminChequeDetails({ ...payToAdminChequeDetails, bank: e.target.value })}
                />
                <input
                  type="date"
                  value={payToAdminChequeDetails.date}
                  onChange={(e) => setPayToAdminChequeDetails({ ...payToAdminChequeDetails, date: e.target.value })}
                />
              </div>
            )}
            <div className="pay-modal-actions">
              <button className="pay-modal-cancel" onClick={closePayToAdminModal}>Cancel</button>
              <button className="pay-modal-confirm" onClick={submitPayToAdmin} disabled={processingId === payToAdminTxId}>
                {processingId === payToAdminTxId ? "Processing..." : "Send to Admin"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅✅✅ NEW: Bulk Pay to Admin Modal */}
      {showBulkPayToAdminModal && (
        <div className="pay-modal-overlay">
          <div className="pay-modal bulk-modal">
            <h3>Send {selectedWalletTx.length} Payments to Admin</h3>
            <div className="pay-modal-info">
              <p>Total: AED {filteredWalletTx.filter((tx) => selectedWalletTx.includes(tx._id)).reduce((sum, tx) => sum + tx.amount, 0).toFixed(2)}</p>
            </div>
            <div className="pay-modal-input-group">
              <label>Payment Method (applied to all)</label>
              <select value={bulkPayMethod} onChange={(e) => setBulkPayMethod(e.target.value)} className="pay-modal-select">
                <option value="cash">Cash</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>
            {bulkPayMethod === "cheque" && (
              <div className="pay-modal-cheque-group">
                <input
                  placeholder="Cheque No (prefix)"
                  value={bulkPayChequeDetails.number}
                  onChange={(e) => setBulkPayChequeDetails({ ...bulkPayChequeDetails, number: e.target.value })}
                />
                <input
                  placeholder="Bank Name"
                  value={bulkPayChequeDetails.bank}
                  onChange={(e) => setBulkPayChequeDetails({ ...bulkPayChequeDetails, bank: e.target.value })}
                />
                <input
                  type="date"
                  value={bulkPayChequeDetails.date}
                  onChange={(e) => setBulkPayChequeDetails({ ...bulkPayChequeDetails, date: e.target.value })}
                />
              </div>
            )}
            <div className="pay-modal-actions">
              <button className="pay-modal-cancel" onClick={() => setShowBulkPayToAdminModal(false)}>Cancel</button>
              <button className="pay-modal-confirm" onClick={submitBulkPayToAdmin} disabled={bulkProcessing}>
                {bulkProcessing ? "Processing..." : "Send Selected to Admin"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentRequestsDelivery;