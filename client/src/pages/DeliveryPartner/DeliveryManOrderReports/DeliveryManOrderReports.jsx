// DeliveryManOrderReports.jsx
import React, { useState, useEffect, useCallback } from 'react';
import Header from '../../../components/layout/Header/Header';
import Sidebar from '../../../components/layout/Sidebar/Sidebar';
import './DeliveryManOrderReports.css';
import axios from 'axios';
import InvoiceDownloadModal from '../../../components/InvoiceDownloadModal/InvoiceDownloadModal';
import { useAppSettings } from '../../../context/AppSettingsContext';
import { usePaginatedData } from '../../../hooks/usePagination';
import Pagination from '../../../components/common/Pagination';

const DeliveryManOrderReports = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState('Delivered Orders');
  const [user, setUser] = useState(null);
  const [downloadingOrderId, setDownloadingOrderId] = useState(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [pendingInvoiceData, setPendingInvoiceData] = useState(null);

  const backendUrl = process.env.REACT_APP_BACKEND_IP;

  const fetchCurrentUser = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        window.location.href = '/login';
        return;
      }
      
      const response = await axios.get(`${backendUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUser(response.data.user || response.data);
    } catch (error) {
      console.error("Failed to load user", error);
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
  }, [backendUrl]);

  // Fetch ALL accepted orders (both partially and fully delivered)
  const fetchAllAcceptedOrders = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/orders/my-assigned-orders`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Filter only accepted orders (regardless of delivery status)
      const acceptedOrders = response.data.filter(order => 
        order.assignmentStatus === "accepted"
      );
      setOrders(acceptedOrders);
    } catch (error) {
      console.error('Error fetching accepted orders:', error);
      alert('Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchAllAcceptedOrders();
  }, [fetchCurrentUser, fetchAllAcceptedOrders]);

  const triggerBlobDownload = (data, filename) => {
    const blob = new Blob([data], { type: "application/pdf" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => window.URL.revokeObjectURL(url), 10000);
  };

  const downloadDeliveredInvoice = async (orderId, invoiceNumber, type = "normal") => {
    setDownloadingOrderId(orderId);
    try {
      const token = localStorage.getItem('token');

      let url = `${backendUrl}/api/orders/getdeliveredinvoice/${orderId}?type=${type}`;
      if (invoiceNumber) {
        url += `&invoiceNumber=${encodeURIComponent(invoiceNumber)}`;
      }
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: "blob",
      });
      const suffix = type === "preprinted" ? "-preprinted" : "";
      triggerBlobDownload(response.data, `delivered-invoice-${invoiceNumber || orderId}${suffix}.pdf`);
    } catch (error) {
      console.error('Error downloading delivered invoice:', error);
      alert('Failed to download delivered invoice');
    } finally {
      setDownloadingOrderId(null);
    }
  };

  const downloadPendingInvoice = async (orderId, type = "normal") => {
    setDownloadingOrderId(orderId);
    try {
      const token = localStorage.getItem('token');

      const response = await axios.get(
        `${backendUrl}/api/orders/getpendinginvoice/${orderId}?type=${type}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: "blob",
        }
      );
      const filename = type === "preprinted"
        ? `pending-invoice-${orderId}-preprinted.pdf`
        : `pending-invoice-${orderId}.pdf`;
      triggerBlobDownload(response.data, filename);
    } catch (error) {
      console.error('Error downloading pending invoice:', error);
      alert('Failed to download pending invoice');
    } finally {
      setDownloadingOrderId(null);
    }
  };

  // Helper: aggregate quantities across all order items
  const sumOrdered = (order) =>
    (order.orderItems || []).reduce((s, it) => s + (it.orderedQuantity || 0), 0);
  const sumDelivered = (order) =>
    (order.orderItems || []).reduce((s, it) => s + (it.deliveredQuantity || 0), 0);

  // Helper function to get delivery status (across all items)
  const getDeliveryStatus = (order) => {
    const delivered = sumDelivered(order);
    const ordered = sumOrdered(order);
    if (delivered === 0) {
      return 'Not Delivered';
    } else if (delivered < ordered) {
      return 'Partially Delivered';
    } else {
      return 'Fully Delivered';
    }
  };

  const { entriesPerPage } = useAppSettings();
  const pagination = usePaginatedData(orders, entriesPerPage, "delivery-man-order-reports");

  if (!user) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="delivery-man-reports-layout">
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
      <main className={`main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="table-container">
          <h2>Delivery Order Reports</h2>
          
          {loading ? (
            <div className="loading">Loading orders...</div>
          ) : (
            <>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">No</th>
                      <th scope="col">Customer</th>
                      <th scope="col">Product</th>
                      <th scope="col">Ordered Qty</th>
                      <th scope="col">Delivered Qty</th>
                      <th scope="col">Remaining Qty</th>
                      <th scope="col">Delivery Status</th>
                      <th scope="col">Price</th>
                      <th scope="col">Total Amount</th>
                      <th scope="col">Order Date</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagination.pageData.length > 0 ? (
                      pagination.pageData.map((order, index) => {
                        const items = order.orderItems || [];
                        const orderedQty = sumOrdered(order);
                        const deliveredQty = sumDelivered(order);
                        const pendingQty = orderedQty - deliveredQty;
                        const grandTotal = items.reduce((s, it) => s + (it.totalAmount || 0), 0);
                        const productNames = items
                          .map((it) => it.product?.productName || 'N/A')
                          .join(', ');
                        const singlePrice = items.length === 1 ? items[0].price : null;
                        const hasDeliveredQty = deliveredQty > 0;
                        const hasPendingQty = pendingQty > 0;

                        return (
                          <tr key={order._id}>
                            <td>{pagination.showingFrom + index}</td>
                            <td>{order.customer?.name || 'N/A'}</td>
                            <td>{productNames || 'N/A'}</td>
                            <td>{orderedQty}</td>
                            <td>{deliveredQty}</td>
                            <td>{pendingQty}</td>
                            <td>
                              <span className={`status-badge status-${getDeliveryStatus(order).replace(' ', '-').toLowerCase()}`}>
                                {getDeliveryStatus(order)}
                              </span>
                            </td>
                            <td>{singlePrice != null ? `$${Number(singlePrice).toFixed(2)}` : '—'}</td>
                            <td>${Number(grandTotal).toFixed(2)}</td>
                            <td>{new Date(order.orderDate).toLocaleDateString()}</td>
                            <td>
                              <div className="action-buttons">
                                {order.deliveredInvoiceHistory && order.deliveredInvoiceHistory.length > 0 ? (
                                  order.deliveredInvoiceHistory.map((inv, i) => (
                                    <button
                                      key={i}
                                      className="invoice-button delivered"
                                      onClick={() => {
                                        setPendingInvoiceData({ type: "delivered", orderId: order._id, invoiceNumber: inv.invoiceNumber });
                                        setShowInvoiceModal(true);
                                      }}
                                      disabled={downloadingOrderId === order._id}
                                    >
                                      {downloadingOrderId === order._id
                                        ? 'Downloading...'
                                        : `🧾 ${inv.invoiceNumber}`}
                                    </button>
                                  ))
                                ) : hasDeliveredQty ? (
                                  <button
                                    className="invoice-button delivered"
                                    onClick={() => {
                                      setPendingInvoiceData({ type: "delivered", orderId: order._id, invoiceNumber: null });
                                      setShowInvoiceModal(true);
                                    }}
                                    disabled={downloadingOrderId === order._id}
                                  >
                                    {downloadingOrderId === order._id ? 'Downloading...' : 'Delivered Invoice'}
                                  </button>
                                ) : null}
                              
                                {hasPendingQty && (
                                  <button
                                    className="invoice-button pending"
                                    onClick={() => {
                                      setPendingInvoiceData({ type: "pending", orderId: order._id });
                                      setShowInvoiceModal(true);
                                    }}
                                    disabled={downloadingOrderId === order._id}
                                  >
                                    {downloadingOrderId === order._id ? 'Downloading...' : 'Pending Invoice'}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan="11" className="no-data">
                          No accepted orders found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

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
      </main>

      <InvoiceDownloadModal
        isOpen={showInvoiceModal}
        onClose={() => setShowInvoiceModal(false)}
        onSelect={(type) => {
          setShowInvoiceModal(false);
          if (pendingInvoiceData?.type === "delivered") {
            downloadDeliveredInvoice(pendingInvoiceData.orderId, pendingInvoiceData.invoiceNumber, type);
          } else if (pendingInvoiceData?.type === "pending") {
            downloadPendingInvoice(pendingInvoiceData.orderId, type);
          }
        }}
      />
    </div>
  );
};

export default DeliveryManOrderReports;