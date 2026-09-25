// src/pages/Delivery/DeliveredOrdersList.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../../Assets/aed-symbol.png";
import toast from "../../../utils/toast";
import axios from "axios";
import TableScrollSync from "../../../components/common/TableScrollSync";
import "./DeliveredOrdersList.css";
import InvoiceDownloadModal from "../../../components/InvoiceDownloadModal/InvoiceDownloadModal";
import { useAppSettings } from "../../../context/AppSettingsContext";
import { usePaginatedData } from "../../../hooks/usePagination";
import Pagination from "../../../components/common/Pagination";
import OrderProductsModal from "../../../components/common/OrderProductsModal";

const DeliveredOrdersList = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState("Delivered Orders");
  const [user, setUser] = useState(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [pendingInvoiceData, setPendingInvoiceData] = useState(null);
  const [viewProductsOrder, setViewProductsOrder] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");

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

  const fetchDeliveredOrders = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(
        `${backendUrl}/api/orders/my-delivered-orders`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      // Read-only history: every order where I personally delivered at
      // least one batch (server-side, keyed off deliveredInvoiceHistory —
      // see getMyDeliveredOrders). This is independent of the order's
      // CURRENT assignment, so a delivery I made stays here even if the
      // order is later reassigned to a different partner for a further
      // packing round.
      setOrders(res.data.filter((o) => o.status !== "cancelled"));
    } catch (err) {
      toast.error("Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchDeliveredOrders();
  }, [fetchCurrentUser, fetchDeliveredOrders]);

  // Download delivered invoice (specific batch from deliveredInvoiceHistory)
  const downloadDeliveredInvoice = async (orderId, invoiceNumber, type = "normal") => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(
        `${backendUrl}/api/orders/getdeliveredinvoice/${orderId}?invoiceNumber=${invoiceNumber}&type=${type}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: "blob",
        },
      );
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      const suffix = type === "preprinted" ? "-preprinted" : "";
      link.setAttribute("download", `delivered-invoice-${invoiceNumber}${suffix}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Delivered invoice ${invoiceNumber} downloaded`);
    } catch (err) {
      toast.error("Failed to download delivered invoice");
    }
  };

  // This history page is scoped to what I (the logged-in delivery partner)
  // personally delivered — an order's deliveredInvoiceHistory can include
  // entries from a different partner if it was reassigned for another round,
  // so quantities are aggregated per-product from only MY entries, keyed by
  // deliveredBy, rather than the order's whole cumulative deliveredQuantity.
  const getMyDeliveredQtyMap = useCallback(
    (order) => {
      const map = {};
      (order?.deliveredInvoiceHistory || []).forEach((entry) => {
        if (!entry.deliveredBy || String(entry.deliveredBy) !== String(user?._id)) return;
        (entry.items || []).forEach((it) => {
          const pid = String(it.product?._id || it.product);
          map[pid] = (map[pid] || 0) + (it.quantity || 0);
        });
      });
      return map;
    },
    [user]
  );

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      return (
        !searchTerm.trim() ||
        order.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    });
  }, [orders, searchTerm]);

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const { entriesPerPage } = useAppSettings();
  const pagination = usePaginatedData(filteredOrders, entriesPerPage, `${searchTerm}`);

  if (!user) return <div className="delivered-orders-loading">Loading...</div>;

  return (
    <div className="delivered-orders-layout">
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
        className={`delivered-orders-main-content ${sidebarOpen ? "sidebar-open" : ""}`}
      >
        <div className="delivered-orders-container-wrapper">
          <div className="delivered-orders-container">
            <h2 className="delivered-orders-page-title">Delivered Orders</h2>

            <div className="delivered-orders-controls-group">
              <div className="delivered-orders-search-container">
                <input
                  type="text"
                  className="delivered-orders-search-input"
                  placeholder="Search by customer name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button
                    className="delivered-orders-search-clear"
                    onClick={() => setSearchTerm("")}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {loading ? (
              <div className="delivered-orders-loading">Loading orders...</div>
            ) : filteredOrders.length === 0 ? (
              <div className="delivered-orders-no-data">
                No delivered orders found
                {searchTerm.trim() && ` matching "${searchTerm}"`}
              </div>
            ) : (
              <>
                <TableScrollSync>
                  <div className="delivered-orders-table-wrapper">
                    <table className="delivered-orders-data-table">
                      <thead>
                        <tr>
                          <th>No</th>
                          <th>Order ID</th>
                          <th>Customer</th>
                          <th>Total Delivered Qty</th>
                          <th>Grand Total</th>
                          <th>Remarks</th>
                          <th>Order Date</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagination.pageData.map((order, index) => {
                          const myDeliveredMap = getMyDeliveredQtyMap(order);
                          const totalDeliveredQty = Object.values(myDeliveredMap).reduce(
                            (s, q) => s + q,
                            0
                          );
                          // Grand Total here is what I personally delivered —
                          // the sum of MY deliveredInvoiceHistory entries'
                          // amounts, each already the invoice's rounded Grand
                          // Total (Sub Total + Round Off = Grand Total), not
                          // the whole order's invoiceHistory (which can
                          // include invoices delivered by a different partner
                          // after a reassignment).
                          const grandTotal = (order.deliveredInvoiceHistory || [])
                            .filter((h) => h.deliveredBy && String(h.deliveredBy) === String(user?._id))
                            .reduce((sum, h) => sum + (h.amount || 0), 0)
                            .toFixed(2);

                          return (
                            <tr key={order._id}>
                              <td>{pagination.showingFrom + index}</td>
                              <td>
                                <button
                                  type="button"
                                  className="delivered-orders-orderid-link"
                                  onClick={() => setViewProductsOrder(order)}
                                  title="View ordered products"
                                >
                                  {order.orderId || order._id}
                                </button>
                              </td>
                              <td>{order.customer?.name || "N/A"}</td>

                              <td>{totalDeliveredQty}</td>

                              <td>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                  }}
                                >
                                  <img
                                    src={DirhamSymbol}
                                    alt="AED"
                                    width={18}
                                    height={20}
                                    style={{ paddingTop: "2px" }}
                                  />
                                  <span>{grandTotal}</span>
                                </div>
                              </td>

                              <td>{order.remarks || "—"}</td>

                              <td>{formatDate(order.orderDate)}</td>

                              <td>
                                <div className="actions-cell-stack">
                                  {(() => {
                                    // Only the batches I personally delivered —
                                    // an order reassigned after my delivery can
                                    // carry further deliveredInvoiceHistory
                                    // entries belonging to a different partner.
                                    const myDeliveries = (order.deliveredInvoiceHistory || []).filter(
                                      (h) => h.deliveredBy && String(h.deliveredBy) === String(user?._id)
                                    );

                                    if (myDeliveries.length > 0) {
                                      return (
                                        <div className="invoice-section">
                                          <div className="invoice-buttons-group">
                                            {myDeliveries.map((inv, i) => (
                                              <button
                                                key={i}
                                                className="invoice-btn"
                                                onClick={() => {
                                                  setPendingInvoiceData({ orderId: order._id, invoiceNumber: inv.invoiceNumber });
                                                  setShowInvoiceModal(true);
                                                }}
                                              >
                                                🧾 {inv.invoiceNumber}
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      );
                                    }

                                    if (!order.deliveredInvoiceHistory?.length && order.deliveredInvoiceNumber) {
                                      return (
                                        <button
                                          className="invoice-btn delivered-invoice-btn"
                                          onClick={() => {
                                            setPendingInvoiceData({ orderId: order._id, invoiceNumber: order.deliveredInvoiceNumber });
                                            setShowInvoiceModal(true);
                                          }}
                                        >
                                          🧾 Download Invoice
                                        </button>
                                      );
                                    }

                                    return <span className="completed-text">No invoice</span>;
                                  })()}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
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

      <InvoiceDownloadModal
        isOpen={showInvoiceModal}
        onClose={() => setShowInvoiceModal(false)}
        onSelect={(type) => {
          setShowInvoiceModal(false);
          downloadDeliveredInvoice(pendingInvoiceData.orderId, pendingInvoiceData.invoiceNumber, type);
        }}
      />

      {viewProductsOrder && (
        <OrderProductsModal
          order={viewProductsOrder}
          onClose={() => setViewProductsOrder(null)}
          filterItem={(item) => {
            const map = getMyDeliveredQtyMap(viewProductsOrder);
            const pid = String(item.product?._id || item.product);
            return (map[pid] || 0) > 0;
          }}
          getQty={(item) => {
            const map = getMyDeliveredQtyMap(viewProductsOrder);
            const pid = String(item.product?._id || item.product);
            return map[pid] || 0;
          }}
          emptyText="No products delivered yet"
        />
      )}
    </div>
  );
};

export default DeliveredOrdersList;
