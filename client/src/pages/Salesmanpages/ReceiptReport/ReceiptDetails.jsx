// src/pages/salesman/ReceiptDetails.jsx
import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../../Assets/aed-symbol.png";
import "./ReceiptDetails.css";
import axios from "axios";
import toast from "react-hot-toast";

const ReceiptDetails = () => {
  const { receiptId } = useParams();
  const navigate = useNavigate();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [receipt, setReceipt] = useState(null);
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

  const fetchReceiptDetails = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      // Deep population: orders → orderItems → product + invoiceHistory + invoiceHistory.items.product
      const response = await axios.get(
        `${backendUrl}/api/bills/getbillbyid/${receiptId}?populate=orders,orders.orderItems,orders.orderItems.product,orders.invoiceHistory,orders.invoiceHistory.items.product,customer`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setReceipt(response.data);
    } catch (error) {
      console.error("Error fetching receipt details:", error);
      toast.error(error.response?.data?.message || "Failed to load receipt");
    } finally {
      setLoading(false);
    }
  }, [backendUrl, receiptId]);

  useEffect(() => {
    fetchCurrentUser();
    fetchReceiptDetails();
  }, [fetchCurrentUser, fetchReceiptDetails]);

  const formatCurrency = (amount) =>
    new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount || 0);

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const downloadReceipt = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${backendUrl}/api/bills/receipt/${receiptId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: "blob",
        }
      );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;

      // Safe invoice number for filename
      const invoiceNo =
        receipt?.invoiceNumber ||
        receipt?.orders?.[0]?.invoiceNumber ||
        `REC-${receiptId.slice(-8)}`;

      link.setAttribute("download", `receipt-${invoiceNo}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success("Receipt downloaded successfully");
    } catch (error) {
      console.error("Download error:", error);
      toast.error("Failed to download receipt");
    }
  };

  if (loading || !user) return <div className="order-list-loading">Loading...</div>;

  if (!receipt) {
    return (
      <div className="receipt-details-error">
        <h2>Receipt Not Found</h2>
        <button className="btn-back" onClick={() => navigate(-1)}>
          ← Back
        </button>
      </div>
    );
  }

  // Helper: Get invoice number safely
  const getInvoiceNumber = () => {
    return (
      receipt.invoiceNumber ||
      receipt.orders?.[0]?.invoiceNumber ||
      `REC-${receiptId.slice(-8)}`
    );
  };

  // Get formatted orders with partial details from invoiceHistory (same as outstanding)
  const getFormattedOrders = () => {
    if (!receipt.orders?.length) return [];

    const targetInvoice = getInvoiceNumber();

    return receipt.orders.map((order) => {
      // Find matching history for this bill's invoice
      const matchingHistory = order.invoiceHistory?.find(
        (h) => h.invoiceNumber === targetInvoice
      );

      return {
        _id: order._id,
        invoiceNumber: targetInvoice, // Use bill's invoice (DEL-02)
        orderDate: order.orderDate,
        status: order.status,
        payment: order.payment,
        totalAmount: matchingHistory?.amount || order.grandTotal || 0, // Partial from history
        items:
          matchingHistory?.items?.map((histItem) => ({
            product: histItem.product?.productName || "Unknown Product", // Populated now
            unit: histItem.product?.unit || "kg",
            quantity: histItem.quantity, // Partial qty (e.g., 3)
            price: histItem.price,
            total: histItem.quantity * histItem.price,
          })) || [], // Use history items
      };
    });
  };

  const formattedOrders = getFormattedOrders();
  const invoiceNumber = getInvoiceNumber();

  return (
    <div className="receipt-details-layout">
      <Header
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        user={user}
      />
      <Sidebar
        isOpen={sidebarOpen}
        activeItem="Receipt Report"
        onSetActiveItem={() => {}}
        onClose={() => setSidebarOpen(false)}
        user={user}
      />

      <main className={`receipt-details-main ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="receipt-details-wrapper">
          <div className="receipt-details-container">
            {/* Header */}
            <div className="receipt-details-header">
              <button className="btn-back" onClick={() => navigate(-1)}>
                ← Back
              </button>
              <div className="receipt-title-section">
                <h2 className="receipt-title">Payment Receipt</h2>
                <span className="status-badge status-paid">Paid</span>
              </div>
              <button className="btn-download" onClick={downloadReceipt}>
                📥 Download PDF
              </button>
            </div>

            {/* Receipt Info Cards */}
            <div className="receipt-info-grid">
              <div className="info-card">
                <span className="info-label">Invoice Number</span>
                <span className="info-value monospace">{invoiceNumber}</span>
              </div>
              <div className="info-card">
                <span className="info-label">Amount Paid</span>
                <div className="info-value amount-paid">
                  <img src={DirhamSymbol} alt="AED" width={18} />
                  {formatCurrency(receipt.paidAmount)}
                </div>
              </div>
              <div className="info-card">
                <span className="info-label">Paid Date</span>
                <span className="info-value">
                  {formatDate(receipt.updatedAt || receipt.createdAt)}
                </span>
              </div>
            </div>

            {/* Customer Info */}
            <div className="section-card">
              <h3 className="section-title">Customer Details</h3>
              <div className="customer-details-grid">
                <div>
                  <label>Name</label>
                  <p>{receipt.customer?.name || "N/A"}</p>
                </div>
                <div>
                  <label>Email</label>
                  <p>{receipt.customer?.email || "N/A"}</p>
                </div>
                <div>
                  <label>Phone</label>
                  <p>{receipt.customer?.phoneNumber || "N/A"}</p>
                </div>
                <div>
                  <label>Address</label>
                  <p>
                    {receipt.customer?.address || "N/A"},{" "}
                    {receipt.customer?.pincode || "N/A"}
                  </p>
                </div>
              </div>
            </div>

            {/* Bill Summary */}
            <div className="section-card">
              <h3 className="section-title">Bill Summary</h3>
              <div className="bill-summary-table">
                <div className="summary-row">
                  <span>Total Amount (This Receipt)</span>
                  <span>{formatCurrency(receipt.totalUsed || receipt.paidAmount)}</span>
                </div>
                <div className="summary-row highlight">
                  <span>Paid Amount</span>
                  <span className="amount-paid">
                    {formatCurrency(receipt.paidAmount)}
                  </span>
                </div>
                <div className="summary-row">
                  <span>Amount Due</span>
                  <span>{formatCurrency(receipt.amountDue || 0)}</span>
                </div>
              </div>
            </div>

            {/* Linked Orders Section - Same as Outstanding Details */}
            {formattedOrders.length > 0 ? (
              <div className="section-card">
                <h3 className="section-title">Linked Orders ({formattedOrders.length})</h3>
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
                        {formattedOrders.map((order) => (
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
              </div>
            ) : (
              <div className="section-card">
                <p className="text-muted">No linked orders found for this receipt</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default ReceiptDetails;