// src/pages/salesman/ReceiptDetails.jsx
import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
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

  // Fetch receipt details
  const fetchReceiptDetails = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${backendUrl}/api/bills/getbillbyid/${receiptId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setReceipt(response.data);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching receipt details:", error);
      toast.error(error.response?.data?.message || "Failed to load receipt");
      setLoading(false);
    }
  }, [backendUrl, receiptId]);

  useEffect(() => {
    fetchCurrentUser();
    fetchReceiptDetails();
  }, [fetchCurrentUser, fetchReceiptDetails]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const downloadReceipt = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${backendUrl}/api/bills/receipt/${receiptId}`,
        { 
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob'
        }
      );
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `receipt-${receipt?.invoiceNumber || receiptId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("Receipt downloaded successfully");
    } catch (error) {
      console.error("Download error:", error);
      toast.error("Failed to download receipt");
    }
  };

  if (loading || !user) {
    return <div className="order-list-loading">Loading...</div>;
  }

  if (!receipt) {
    return (
      <div className="receipt-details-layout">
        <div className="receipt-details-error">
          <h2>Receipt Not Found</h2>
          <Link to="/sales/receipt-report" className="btn-back">← Back to Report</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="receipt-details-layout">
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
      <main className={`receipt-details-main ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="receipt-details-wrapper">
          <div className="receipt-details-container">
            
            {/* Header */}
            <div className="receipt-details-header">
              <button className="btn-back" onClick={() => navigate(-1)}>← Back</button>
              <div className="receipt-title-section">
                <h2 className="receipt-title">Payment Receipt</h2>
                <span className={`status-badge status-paid`}>Paid</span>
              </div>
              <button className="btn-download" onClick={downloadReceipt}>
                📥 Download PDF
              </button>
            </div>

            {/* Receipt Info Cards */}
            <div className="receipt-info-grid">
             <div className="info-card">
    <span className="info-label">Invoice Number</span>
    <span className="info-value monospace">
      {receipt.invoiceNumber || 
       receipt.orders?.[0]?.invoiceNumber || 
       `DEL-${receipt._id.toString().slice(-8)}`}
    </span>
    {receipt.isOpeningBalance && (
      <span className="opening-badge">Opening Balance</span>
    )}
  </div>
              <div className="info-card">
                <span className="info-label">Amount Paid</span>
                <div className="info-value amount-paid">
                  <img src={DirhamSymbol} alt="AED" width={18} height={18} />
                  {formatCurrency(receipt.paidAmount)}
                </div>
              </div>
              <div className="info-card">
                <span className="info-label">Paid Date</span>
                <span className="info-value">{formatDate(receipt.updatedAt || receipt.createdAt)}</span>
              </div>
             
            </div>

            {/* Customer Info */}
            <div className="section-card">
              <h3 className="section-title">Customer Details</h3>
              <div className="customer-details-grid">
                <div>
                  <label>Name</label>
                  <p>{receipt.customer?.name}</p>
                </div>
                <div>
                  <label>Email</label>
                  <p>{receipt.customer?.email}</p>
                </div>
                <div>
                  <label>Phone</label>
                  <p>{receipt.customer?.phoneNumber}</p>
                </div>
                <div>
                  <label>Address</label>
                  <p>{receipt.customer?.address}, {receipt.customer?.pincode}</p>
                </div>
              </div>
            </div>

            {/* Bill Summary */}
            <div className="section-card">
              <h3 className="section-title">Bill Summary</h3>
              <div className="bill-summary-table">
                <div className="summary-row">
                  <span>Total Amount</span>
                  <span>{formatCurrency(receipt.totalUsed)}</span>
                </div>
                <div className="summary-row highlight">
                  <span>Paid Amount</span>
                  <span className="amount-paid">{formatCurrency(receipt.paidAmount)}</span>
                </div>
                <div className="summary-row">
                  <span>Amount Due</span>
                  <span>{formatCurrency(receipt.amountDue)}</span>
                </div>
                
               
               
              </div>
            </div>

            {/* Linked Orders */}
           {receipt.orders?.length > 0 && (
  <div className="section-card">
    <h3 className="section-title">Linked Orders ({receipt.orders.length})</h3>
    
    <div className="orders-list-full">
      {receipt.orders.map((order, orderIdx) => (
        <div key={order._id} className="order-card-full">
          
          {/* Order Header */}
          <div className="order-header-full">
            <div className="order-meta">
              <span className="order-invoice">
                Invoice: <strong>{order.invoiceNumber || `ORD-${order._id.toString().slice(-8)}`}</strong>
              </span>
              <span className="order-date">{formatDate(order.orderDate)}</span>
            </div>
            <div className="order-status-badge">
              <span className={`status-pill status-${order.status}`}>
                {order.status?.replace('_', ' ')}
              </span>
              <span className={`payment-pill payment-${order.payment}`}>
                {order.payment}
              </span>
            </div>
          </div>

          {/* Products Table */}
          {order.orderItems?.length > 0 && (
            <div className="products-table-wrapper">
              <table className="products-table-full">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th style={{ textAlign: 'center' }}>Ordered</th>
                    <th style={{ textAlign: 'center' }}>Delivered</th>
                    <th style={{ textAlign: 'center' }}>Unit</th>
                    <th style={{ textAlign: 'right' }}>Price</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {order.orderItems.map((item, itemIdx) => {
                    const qty = item.deliveredQuantity || item.orderedQuantity;
                    const itemTotal = qty * item.price;
                    return (
                      <tr key={itemIdx}>
                        <td>
                          <span className="product-name">
                            {item.product?.productName || 'Unknown Product'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 500 }}>
                          {item.orderedQuantity}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`delivered-badge ${item.deliveredQuantity >= item.orderedQuantity ? 'full' : 'partial'}`}>
                            {item.deliveredQuantity || 0}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center', color: '#64748b', fontSize: '0.875rem' }}>
                          {item.product?.unit || '-'}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                            <img src={DirhamSymbol} alt="AED" width={10} height={10} />
                            {formatCurrency(item.price)}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                            <img src={DirhamSymbol} alt="AED" width={12} height={12} />
                            {formatCurrency(itemTotal)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Order Total Row */}
                <tfoot>
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'right', fontWeight: 600, paddingTop: '1rem' }}>
                      Order Total:
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '1.125rem', color: '#0f172a', paddingTop: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                        <img src={DirhamSymbol} alt="AED" width={14} height={14} />
                        {formatCurrency(order.totalAmount || order.orderItems?.reduce((s, i) => s + (i.deliveredQuantity || i.orderedQuantity) * i.price, 0))}
                      </div>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

       

        </div>
      ))}
    </div>
  </div>
)}
          
          </div>
        </div>
      </main>
    </div>
  );
};

export default ReceiptDetails;