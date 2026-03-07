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
      // Deep population: orders → orderItems → product + invoiceHistory
      const response = await axios.get(
        `${backendUrl}/api/bills/getbillbyid/${receiptId}?populate=orders,orders.orderItems,orders.orderItems.product,orders.invoiceHistory,customer`,
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

  // Get items specific to THIS invoice/bill using invoiceHistory
  const getBillItems = () => {
    if (!receipt.orders?.length) return [];

    const order = receipt.orders[0];
    const targetInvoice = getInvoiceNumber();

    // Find matching invoice history entry
    const historyEntry = order.invoiceHistory?.find(
      (h) => h.invoiceNumber === targetInvoice
    );

    if (historyEntry?.items?.length > 0) {
      // Use historical quantities (e.g., 3 or 7) — this is the correct way
      return historyEntry.items.map((histItem) => {
        // Match with original order item to get product name/unit
        const orderItem = order.orderItems?.find(
          (oi) => String(oi.product?._id) === String(histItem.product)
        );

        return {
          productName: orderItem?.product?.productName || "Unknown Product",
          unit: orderItem?.unit || "kg",
          price: histItem.price || orderItem?.price || 0,
          quantity: histItem.quantity || 0,
          total: (histItem.quantity || 0) * (histItem.price || 0),
        };
      });
    }

    // Fallback: show full order items (should rarely happen)
    return order.orderItems?.map((item) => ({
      productName: item.product?.productName || "Unknown Product",
      unit: item.unit || "kg",
      price: item.price || 0,
      quantity: item.orderedQuantity || 0,
      total: (item.orderedQuantity || 0) * (item.price || 0),
    })) || [];
  };

  const billItems = getBillItems();
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

            {/* Items Table - Only items from this invoice */}
            {billItems.length > 0 ? (
              <div className="section-card">
                <h3 className="section-title">
                  Items (Invoice: {invoiceNumber})
                </h3>

                <div className="products-table-wrapper">
                  <table className="products-table-full">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th style={{ textAlign: "center" }}>Qty</th>
                        <th style={{ textAlign: "center" }}>Unit</th>
                        <th style={{ textAlign: "right" }}>Price</th>
                        <th style={{ textAlign: "right" }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {billItems.map((item, idx) => (
                        <tr key={idx}>
                          <td>
                            <span className="product-name">{item.productName}</span>
                          </td>
                          <td style={{ textAlign: "center", fontWeight: 500 }}>
                            {item.quantity}
                          </td>
                          <td style={{ textAlign: "center" }}>
                            {item.unit || "-"}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "4px" }}>
                              <img src={DirhamSymbol} alt="AED" width={12} />
                              {formatCurrency(item.price)}
                            </div>
                          </td>
                          <td style={{ textAlign: "right", fontWeight: 600 }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "4px" }}>
                              <img src={DirhamSymbol} alt="AED" width={14} />
                              {formatCurrency(item.total)}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan="4" style={{ textAlign: "right", fontWeight: 600 }}>
                          Invoice Total:
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 700, fontSize: "1.125rem" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "4px" }}>
                            <img src={DirhamSymbol} alt="AED" width={14} />
                            {formatCurrency(receipt.totalUsed || receipt.paidAmount)}
                          </div>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            ) : (
              <div className="section-card">
                <p className="text-muted">No item details available for this receipt</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default ReceiptDetails;