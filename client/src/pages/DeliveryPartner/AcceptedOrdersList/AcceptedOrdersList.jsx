// src/pages/Delivery/AcceptedOrdersList.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../../Assets/aed-symbol.png";
import TableScrollSync from "../../../components/common/TableScrollSync";
import "./AcceptedOrdersList.css";
import axios from "axios";
import toast from "../../../utils/toast";
import InvoiceDownloadModal from "../../../components/InvoiceDownloadModal/InvoiceDownloadModal";
import { useAppSettings } from "../../../context/AppSettingsContext";
import { usePaginatedData } from "../../../hooks/usePagination";
import SearchableSelect from "../../../components/common/SearchableSelect";
import Pagination from "../../../components/common/Pagination";
import OrderProductsModal from "../../../components/common/OrderProductsModal";

const AcceptedOrdersList = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState("Accepted Orders");
  const [user, setUser] = useState(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [pendingInvoiceData, setPendingInvoiceData] = useState(null);
  const [pendingInvoiceKind, setPendingInvoiceKind] = useState("packed");
  const [viewProductsOrder, setViewProductsOrder] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("credit");
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeBank, setChequeBank] = useState("");
  const [chequeDate, setChequeDate] = useState("");

  const [deliveringOrderId, setDeliveringOrderId] = useState(null);

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

  const fetchAcceptedOrders = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${backendUrl}/api/orders/my-assigned-orders`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Accepted orders stay here as long as there's a packed-but-undelivered
      // batch waiting on me (or nothing has been packed/delivered for this
      // order yet). Once I deliver everything currently packed and nothing
      // new has been packed for me since, it moves to the Delivered Orders
      // list — even if the overall order isn't fully complete yet (the
      // storekeeper may still pack + (re)assign a remaining batch later).
      const acceptedOrders = response.data.filter((order) => {
        if (
          order.assignmentStatus !== "accepted" ||
          order.status === "delivered" ||
          order.status === "cancelled"
        ) {
          return false;
        }
        const totalDelivered = order.orderItems?.reduce(
          (sum, i) => sum + (i.deliveredQuantity || 0),
          0
        ) || 0;
        const packedNotDelivered = order.orderItems?.reduce(
          (sum, i) => sum + ((i.packedQuantity || 0) - (i.deliveredQuantity || 0)),
          0
        ) || 0;
        return !(totalDelivered > 0 && packedNotDelivered === 0);
      });
      setOrders(acceptedOrders);
    } catch (error) {
      console.error("Error fetching accepted orders:", error);
      toast.error("Failed to load accepted orders");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchAcceptedOrders();
  }, [fetchCurrentUser, fetchAcceptedOrders]);

  // Open modal only if packed (partial or full)
  const openDeliveryModal = (order) => {
    if (
      order.packedStatus !== "partially_packed" &&
      order.packedStatus !== "fully_packed"
    ) {
      return toast.error("Order not packed yet. Awaiting storekeeper packing.");
    }

    setCurrentOrder(order);
    // Cash billing type customers never use credit payment at delivery
    const isCashCustomer = order.customer?.billingType === "Cash" || order.payment !== "credit";
    setPaymentMethod(isCashCustomer ? "cash" : "credit");
    setChequeNumber("");
    setChequeBank("");
    setChequeDate("");
    setShowDeliveryModal(true);
  };

  const getProductToDeliver = (item) => {
    // Auto-calculate: full remaining packed qty (no input needed)
    return (item.packedQuantity || 0) - (item.deliveredQuantity || 0);
  };

  const validateDelivery = () => {
    const toDeliverItems = currentOrder.orderItems.filter(
      (item) => getProductToDeliver(item) > 0,
    );
    if (toDeliverItems.length === 0) {
      return "No packed quantity remaining to deliver";
    }

    if (paymentMethod === "cheque") {
      if (!chequeNumber.trim() || !chequeBank.trim() || !chequeDate) {
        return "Please fill all cheque details";
      }
    }

    return null;
  };

  const proceedWithDelivery = async () => {
    const error = validateDelivery();
    if (error) return toast.error(error);

    const deliveredItems = currentOrder.orderItems
      .map((item) => {
        const qty = getProductToDeliver(item);
        return qty > 0 ? { product: item._id, quantity: qty } : null;
      })
      .filter(Boolean);

    if (deliveredItems.length === 0) {
      return toast.error("No quantity to deliver");
    }

    let chequeDetails = null;
    if (paymentMethod === "cheque") {
      chequeDetails = {
        number: chequeNumber.trim(),
        bank: chequeBank.trim(),
        date: chequeDate,
      };
    }

    setShowDeliveryModal(false);
    setDeliveringOrderId(currentOrder._id);

    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(
        `${backendUrl}/api/orders/deliverorder/${currentOrder._id}`,
        {
          deliveredItems,
          deliveredAt: new Date().toISOString(),
          paymentMethod,
          chequeDetails,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (res.data.returnCreditUsed && res.data.returnCreditUsed > 0) {
        toast.success(
          `Return credit of AED ${res.data.returnCreditUsed.toFixed(2)} was applied. Remaining AED ${(res.data.amountCollected - res.data.returnCreditUsed).toFixed(2)} collected as ${paymentMethod}.`,
          { duration: 6000 }
        );
      } else {
        toast.success("Delivery recorded successfully!");
      }
      fetchAcceptedOrders();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to record delivery");
    } finally {
      setDeliveringOrderId(null);
      setCurrentOrder(null);
    }
  };

  // Download unified invoice showing Ordered/Packed/Delivered
  const downloadUnifiedInvoice = async (orderId, invoiceNumber, type = "normal") => {
    try {
      const token = localStorage.getItem("token");
      const baseName = invoiceNumber
        ? `invoice-${invoiceNumber}`
        : `invoice-${orderId.slice(-8)}`;
      const filename = type === "preprinted" ? `${baseName}-preprinted.pdf` : `${baseName}.pdf`;

      const res = await axios.get(
        `${backendUrl}/api/orders/unified-invoice/${orderId}?invoiceNumber=${invoiceNumber}&type=${type}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: "blob",
        },
      );

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Invoice downloaded");
    } catch (err) {
      toast.error("Failed to download invoice");
    }
  };

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

  const getDeliveryStatus = (order) => {
    const totalOrdered =
      order.orderItems?.reduce((s, i) => s + i.orderedQuantity, 0) || 0;
    const totalDelivered =
      order.orderItems?.reduce((s, i) => s + i.deliveredQuantity, 0) || 0;
    const totalPacked =
      order.orderItems?.reduce((s, i) => s + (i.packedQuantity || 0), 0) || 0;

    if (order.packedStatus === "partially_packed") {
      if (totalDelivered === 0) return "Ready to Deliver (Partial Pack)";
      if (totalDelivered < totalPacked) return "Partially Delivered";
    }

    if (order.packedStatus !== "fully_packed") return "Awaiting Packing";
    if (totalDelivered === 0) return "Ready to Deliver (Full Pack)";
    if (totalDelivered < totalOrdered) return "Partially Delivered";
    return "Fully Delivered";
  };

  // Filter by customer name / status
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch =
        !searchTerm.trim() ||
        order.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus =
        statusFilter === "all" ||
        getDeliveryStatus(order).toLowerCase().replace(/\s/g, "-") === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [orders, searchTerm, statusFilter]);

  const { entriesPerPage } = useAppSettings();
  const pagination = usePaginatedData(
    filteredOrders,
    entriesPerPage,
    `${searchTerm}|${statusFilter}`
  );

  const clearSearch = () => setSearchTerm("");

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  if (!user) {
    return <div className="accepted-orders-loading">Loading...</div>;
  }

  return (
    <div className="accepted-orders-layout">
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
        className={`accepted-orders-main-content ${sidebarOpen ? "sidebar-open" : ""}`}
      >
        <div className="accepted-orders-container-wrapper">
          <div className="accepted-orders-container">
            <div className="accepted-orders-header-section">
              <h2 className="accepted-orders-page-title">Accepted Orders</h2>

              <div className="accepted-orders-controls-group">
                <div className="accepted-orders-filter-group">
                  <label
                    htmlFor="statusFilter"
                    className="accepted-orders-filter-label"
                  >
                    Filter by Status:
                  </label>
                  <select
                    id="statusFilter"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="accepted-orders-status-filter"
                  >
                    <option value="all">All Statuses</option>
                    <option value="awaiting-packing">Awaiting Packing</option>
                    <option value="ready-to-deliver">Ready to Deliver</option>
                    <option value="partially-delivered">
                      Partially Delivered
                    </option>
                  </select>
                </div>

                <div className="accepted-orders-search-container">
                  <input
                    type="text"
                    className="accepted-orders-search-input"
                    placeholder="Search by customer name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    aria-label="Search accepted orders by customer"
                  />
                  {searchTerm && (
                    <button
                      className="accepted-orders-search-clear"
                      onClick={clearSearch}
                      aria-label="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            </div>

            {loading ? (
              <div className="accepted-orders-loading">Loading orders...</div>
            ) : filteredOrders.length === 0 ? (
              <div className="accepted-orders-no-data">
                No accepted orders found
                {searchTerm.trim() ? ` matching "${searchTerm}"` : ""}
              </div>
            ) : (
              <>
                <TableScrollSync>
                  <div className="accepted-orders-table-wrapper">
                    <table className="accepted-orders-data-table">
                      <thead>
                        <tr>
                          <th scope="col">No</th>
                          <th scope="col">Order ID</th>
                          <th scope="col">Customer</th>
                          <th scope="col">Packed Qty</th>
                          <th scope="col">Grand Total</th>
                          <th scope="col">Remarks</th>
                          <th scope="col">Order Date</th>
                          <th scope="col">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagination.pageData.map((order, index) => {
                          // Packed-but-not-yet-delivered quantity/amount — what's
                          // actually arrived and awaiting delivery right now, not
                          // the order's whole cumulative packed total (which could
                          // include an earlier round already delivered by a
                          // different delivery partner before a reassignment).
                          const packedQty =
                            order.orderItems?.reduce(
                              (s, i) => s + ((i.packedQuantity || 0) - (i.deliveredQuantity || 0)),
                              0,
                            ) || 0;
                          const grandTotal = (order.invoiceHistory?.length > 0
                            ? Math.max(
                                0,
                                order.invoiceHistory.reduce((sum, h) => sum + (h.amount || 0), 0) -
                                (order.deliveredInvoiceHistory?.reduce((sum, h) => sum + (h.amount || 0), 0) || 0)
                              )
                            : order.orderItems?.reduce((s, i) => s + i.totalAmount, 0) || 0
                          ).toFixed(2);
                          const isPacked =
                            order.packedStatus === "partially_packed" ||
                            order.packedStatus === "fully_packed";

                          return (
                            <tr key={order._id}>
                              <td>{pagination.showingFrom + index}</td>
                              <td>
                                <button
                                  type="button"
                                  className="accepted-orders-orderid-link"
                                  onClick={() => setViewProductsOrder(order)}
                                  title="View ordered products"
                                >
                                  {order.orderId || order._id}
                                </button>
                              </td>
                              <td>{order.customer?.name || "N/A"}</td>

                              <td className="packed-qty-cell">{packedQty}</td>

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
                                    width={15}
                                    height={15}
                                    style={{ paddingTop: "2px" }}
                                  />
                                  <span style={{ fontWeight: 500 }}>
                                    {grandTotal}
                                  </span>
                                </div>
                              </td>

                              <td>{order.remarks || "-"}</td>

                              <td>{formatDate(order.orderDate)}</td>

                              <td>
                                <div className="actions-cell-stack">
                                  {/* Packed Invoices — only ones still owed
                                      (an invoice already fully delivered in an
                                      earlier round, possibly by a different
                                      delivery partner before a reassignment,
                                      isn't this delivery's concern). */}
                                  {(() => {
                                    const outstandingInvoices = order.invoiceHistory?.filter((inv) =>
                                      inv.items?.some((it) => (it.quantity || 0) - (it.deliveredQuantity || 0) > 0)
                                    ) || [];
                                    return outstandingInvoices.length > 0 && (
                                      <div className="invoice-section">
                                        <span className="invoice-section-label">Packed</span>
                                        <div className="invoice-buttons-group">
                                          {outstandingInvoices.map((inv, i) => (
                                            <button
                                              key={i}
                                              className="invoice-btn packed-invoice-btn"
                                              onClick={() => {
                                                setPendingInvoiceData({ orderId: order._id, invoiceNumber: inv.invoiceNumber });
                                                setPendingInvoiceKind("packed");
                                                setShowInvoiceModal(true);
                                              }}
                                            >
                                              📄 {inv.invoiceNumber}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  })()}

                                  {/* Fallback: single packed invoice */}
                                  {(!order.invoiceHistory || order.invoiceHistory.length === 0) && order.invoiceNumber && (
                                    <button
                                      className="invoice-btn"
                                      onClick={() => {
                                        setPendingInvoiceData({ orderId: order._id, invoiceNumber: order.invoiceNumber });
                                        setPendingInvoiceKind("packed");
                                        setShowInvoiceModal(true);
                                      }}
                                    >
                                      Download Invoice
                                    </button>
                                  )}

                                  {isPacked ? (
                                    <button
                                      className="deliver-btn"
                                      onClick={() => openDeliveryModal(order)}
                                      disabled={deliveringOrderId === order._id}
                                    >
                                      {deliveringOrderId === order._id
                                        ? "Delivering..."
                                        : "Deliver"}
                                    </button>
                                  ) : (
                                    <span className="completed-text">
                                      Awaiting Packing
                                    </span>
                                  )}
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

        {/* Delivery Modal - Read-Only: Shows Details, Auto-Full Delivery */}
        {showDeliveryModal && currentOrder && (() => {
          const grandDeliveryAmount = currentOrder.orderItems.reduce((sum, item) => {
            const qty = getProductToDeliver(item);
            if (qty <= 0) return sum;
            const ratio = item.orderedQuantity > 0 ? qty / item.orderedQuantity : 0;
            const itemTotal = item.totalAmount
              ? item.totalAmount * ratio
              : qty * item.price * (1 + (item.vatPercentage || 5) / 100);
            return sum + itemTotal;
          }, 0);
          const returnCreditAvailable = currentOrder.customer?.returnCreditBalance || 0;
          const returnCreditToApply = parseFloat(Math.min(returnCreditAvailable, grandDeliveryAmount).toFixed(2));
          const cashToCollect = parseFloat(Math.max(0, grandDeliveryAmount - returnCreditToApply).toFixed(2));

          return (
          <div className="delivery-modal-overlay">
            <div className="delivery-modal">
              <div className="delivery-modal-header">
                <span className="delivery-modal-icon" aria-hidden="true">🚚</span>
                <div className="delivery-modal-heading">
                  <h3>Confirm Delivery</h3>
                  <p className="delivery-modal-subtitle">
                    Order #{currentOrder.orderId || currentOrder._id?.slice(-8)}
                    {currentOrder.customer?.name ? ` · ${currentOrder.customer.name}` : ""}
                  </p>
                </div>
              </div>

              <div className="delivery-modal-body">
                {/* Return Credit Breakdown Banner */}
                {returnCreditToApply > 0 && (
                  <div className="return-credit-banner">
                    <div className="rc-row">
                      <span>Order Total (incl. VAT):</span>
                      <span>AED {grandDeliveryAmount.toFixed(2)}</span>
                    </div>
                    <div className="rc-row rc-highlight">
                      <span>Return Credit Applied:</span>
                      <span>− AED {returnCreditToApply.toFixed(2)}</span>
                    </div>
                    <div className="rc-row rc-total">
                      <strong>{cashToCollect === 0 ? "✅ No cash collection needed" : `Cash / Cheque to collect:`}</strong>
                      {cashToCollect > 0 && <strong>AED {cashToCollect.toFixed(2)}</strong>}
                    </div>
                  </div>
                )}

                {/* Products List - Read-Only Display */}
                <div className="products-delivery-list">
                  <h4 className="products-delivery-title">Packed Items to Deliver</h4>
                  <div className="products-delivery-items">
                    {currentOrder.orderItems.map((item) => {
                      const toDeliver = getProductToDeliver(item);

                      if (toDeliver <= 0) return null;

                      return (
                        <div key={item._id} className="product-delivery-row">
                          <div className="product-info">
                            <strong className="product-delivery-name">
                              {item.product?.productName || "Unknown Product"}
                            </strong>
                            <div className="product-delivery-meta">
                              <span className="meta-pill">
                                Ordered {item.orderedQuantity} {item.unit || ""}
                              </span>
                              <span className="meta-pill">
                                Delivered {item.deliveredQuantity || 0} {item.unit || ""}
                              </span>
                            </div>
                          </div>
                          <div className="to-deliver-highlight">
                            <span className="to-deliver-value">{toDeliver}</span>
                            <span className="to-deliver-label">{item.unit || ""} to deliver</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Payment Section */}
                <div className="payment-section">
                  <label>Payment Method</label>
                  <SearchableSelect
                    options={[
                      ...(currentOrder.customer?.billingType !== "Cash" && currentOrder.payment === "credit"
                        ? [{ value: "credit", label: "Credit" }]
                        : []),
                      { value: "cash", label: "Cash" },
                      { value: "cheque", label: "Cheque" },
                    ]}
                    value={paymentMethod}
                    onChange={(val) => setPaymentMethod(val)}
                    placeholder="Select payment method"
                  />
                  {(paymentMethod === "cash" || paymentMethod === "cheque") && returnCreditToApply > 0 && cashToCollect === 0 && (
                    <p className="rc-note">Return credit covers the full amount — no {paymentMethod} needed.</p>
                  )}
                  {(paymentMethod === "cash" || paymentMethod === "cheque") && returnCreditToApply > 0 && cashToCollect > 0 && (
                    <p className="rc-note">Collect AED {cashToCollect.toFixed(2)} as {paymentMethod} (return credit of AED {returnCreditToApply.toFixed(2)} already applied).</p>
                  )}
                </div>

                {paymentMethod === "cheque" && (
                  <div className="cheque-details">
                    <input
                      placeholder="Cheque Number"
                      value={chequeNumber}
                      onChange={(e) => setChequeNumber(e.target.value)}
                    />
                    <input
                      placeholder="Bank Name"
                      value={chequeBank}
                      onChange={(e) => setChequeBank(e.target.value)}
                    />
                    <input
                      type="date"
                      value={chequeDate}
                      onChange={(e) => setChequeDate(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <button
                  className="cancel-btn"
                  onClick={() => setShowDeliveryModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="submit-btn"
                  onClick={proceedWithDelivery}
                  disabled={deliveringOrderId === currentOrder._id}
                >
                  {deliveringOrderId === currentOrder._id
                    ? "Submitting..."
                    : "Confirm Delivery"}
                </button>
              </div>
            </div>
          </div>
          );
        })()}
      </main>

      <InvoiceDownloadModal
        isOpen={showInvoiceModal}
        onClose={() => setShowInvoiceModal(false)}
        onSelect={(type) => {
          setShowInvoiceModal(false);
          if (pendingInvoiceKind === "delivered") {
            downloadDeliveredInvoice(pendingInvoiceData.orderId, pendingInvoiceData.invoiceNumber, type);
          } else {
            downloadUnifiedInvoice(pendingInvoiceData.orderId, pendingInvoiceData.invoiceNumber, type);
          }
        }}
      />

      {viewProductsOrder && (
        <OrderProductsModal
          order={viewProductsOrder}
          onClose={() => setViewProductsOrder(null)}
          filterItem={(item) => ((item.packedQuantity || 0) - (item.deliveredQuantity || 0)) > 0}
          getQty={(item) => (item.packedQuantity || 0) - (item.deliveredQuantity || 0)}
          emptyText="No products packed yet"
        />
      )}
    </div>
  );
};

export default AcceptedOrdersList;
