// src/pages/Order/OrderList.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import Header from "../../../../components/layout/Header/Header";
import Sidebar from "../../../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../../../Assets/aed-symbol.png";
import TableScrollSync from "../../../../components/common/TableScrollSync";
import "./OrderList.css";
import axios from "axios";
import toast from "../../../../utils/toast";
import { useAppSettings } from "../../../../context/AppSettingsContext";
import { usePaginatedData } from "../../../../hooks/usePagination";
import Pagination from "../../../../components/common/Pagination";
import SearchableSelect from "../../../../components/common/SearchableSelect";
import OrderProductsModal from "../../../../components/common/OrderProductsModal";

const OrderList = () => {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Full list — only fetched/used when a search or status filter is active,
  // so client-side filtering can search the whole dataset (not just one page).
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeItem, setActiveItem] = useState("Orders");
  const [user, setUser] = useState(null);
  const canAssignDelivery =
    user?.role === "Admin" || user?.role === "Sales Manager" || user?.role === "Sales man";
  const [deliveryPartners, setDeliveryPartners] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { entriesPerPage } = useAppSettings();
  const isFiltering = statusFilter !== "all" || searchTerm.trim() !== "";

  // Server-side pagination state (used when no filter/search is active)
  const [pageOrders, setPageOrders] = useState([]);
  const [serverPage, setServerPage] = useState(1);
  const [serverTotalPages, setServerTotalPages] = useState(1);
  const [serverTotalRecords, setServerTotalRecords] = useState(0);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState(null);
  const [viewProductsOrder, setViewProductsOrder] = useState(null);

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

  const ordersEndpoint = useCallback(
    () =>
      user?.role === "Sales man"
        ? `${backendUrl}/api/orders/salesman-orders`
        : `${backendUrl}/api/orders/getallorders`,
    [backendUrl, user]
  );

  const fetchAllOrders = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(ordersEndpoint(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      setOrders(response.data);
    } catch (error) {
      console.error("Error fetching orders:", error);
      toast.error("Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [ordersEndpoint]);

  const fetchOrdersPage = useCallback(
    async (page) => {
      try {
        setLoading(true);
        const token = localStorage.getItem("token");
        const response = await axios.get(ordersEndpoint(), {
          headers: { Authorization: `Bearer ${token}` },
          params: { page, limit: entriesPerPage },
        });
        setPageOrders(response.data.data);
        setServerTotalPages(response.data.totalPages);
        setServerTotalRecords(response.data.totalRecords);
      } catch (error) {
        console.error("Error fetching orders:", error);
        toast.error("Failed to load orders");
      } finally {
        setLoading(false);
      }
    },
    [ordersEndpoint, entriesPerPage]
  );

  const fetchDeliveryPartners = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${backendUrl}/api/users/getAllUsers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const partners = response.data.filter(
        (user) => user.role === "Delivery Man"
      );
      setDeliveryPartners(partners);
    } catch (error) {
      console.error("Error fetching delivery partners:", error);
    }
  }, [backendUrl]);

  // ==================== FIXED INFINITE LOOP ====================
  // 1. Fetch user + delivery partners (independent of orders)
  // 2. Only fetch orders AFTER user is loaded → no circular dependency
  useEffect(() => {
    fetchCurrentUser();
    fetchDeliveryPartners();
  }, [fetchCurrentUser, fetchDeliveryPartners]);

  useEffect(() => {
    if (!user) return;
    if (isFiltering) {
      fetchAllOrders();
    } else {
      fetchOrdersPage(serverPage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isFiltering, serverPage, entriesPerPage]);

  useEffect(() => {
    if (!isFiltering) setServerPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFiltering]);
  // ============================================================

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch =
        !searchTerm.trim() ||
        (order.customer?.name &&
          order.customer.name.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesStatus =
        statusFilter === "all" ||
        (order.status &&
          order.status.toLowerCase() === statusFilter.toLowerCase());
      return matchesSearch && matchesStatus;
    });
  }, [orders, searchTerm, statusFilter]);

  const clientPagination = usePaginatedData(
    filteredOrders,
    entriesPerPage,
    `${statusFilter}|${searchTerm}`
  );
  const serverPagination = {
    page: serverPage,
    totalPages: serverTotalPages,
    totalRecords: serverTotalRecords,
    showingFrom: serverTotalRecords === 0 ? 0 : (serverPage - 1) * entriesPerPage + 1,
    showingTo: Math.min(serverPage * entriesPerPage, serverTotalRecords),
    canPrev: serverPage > 1,
    canNext: serverPage < serverTotalPages,
    goPrev: () => setServerPage((p) => Math.max(1, p - 1)),
    goNext: () => setServerPage((p) => Math.min(serverTotalPages, p + 1)),
  };
  const visibleOrders = isFiltering ? clientPagination.pageData : pageOrders;
  const activePagination = isFiltering ? clientPagination : serverPagination;
  const refetchCurrent = () =>
    isFiltering ? fetchAllOrders() : fetchOrdersPage(serverPage);

  const handleDeleteClick = (id, orderId) => {
    setOrderToDelete({ id, orderId });
    setShowDeleteModal(true);
  };

  // Packed orders with a generated invoice cannot be deleted by anyone.
  const isDeleteBlocked = (order) => {
    const isPacked = order.packedStatus && order.packedStatus !== "not_packed";
    const hasInvoice =
      !!order.invoiceNumber ||
      (order.invoiceHistory && order.invoiceHistory.length > 0) ||
      !!order.deliveredInvoiceNumber ||
      (order.deliveredInvoiceHistory && order.deliveredInvoiceHistory.length > 0);
    return isPacked && hasInvoice;
  };

  // Cancelling is only offered before the storekeeper has packed anything —
  // once packing has started there's stock/invoicing already in motion, so
  // it goes through the normal delivered/returns flow instead.
  const isCancelBlocked = (order) =>
    order.status === "cancelled" ||
    order.status === "delivered" ||
    (order.packedStatus && order.packedStatus !== "not_packed");

  const handleCancelClick = (id, orderId) => {
    setOrderToCancel({ id, orderId });
    setShowCancelModal(true);
  };

  const confirmCancel = async () => {
    if (!orderToCancel) return;

    setShowCancelModal(false);

    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${backendUrl}/api/orders/cancelorder/${orderToCancel.id}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success("Order cancelled successfully!");
      refetchCurrent();
    } catch (error) {
      console.error("Error cancelling order:", error);
      toast.error(
        error.response?.data?.message || "Failed to cancel order. Please try again."
      );
    } finally {
      setOrderToCancel(null);
    }
  };

  const confirmDelete = async () => {
    if (!orderToDelete) return;

    setShowDeleteModal(false);

    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${backendUrl}/api/orders/deleteorder/${orderToDelete.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      toast.success(`Order deleted successfully!`);
      refetchCurrent();
    } catch (error) {
      console.error("Error deleting order:", error);
      toast.error(
        error.response?.data?.message || "Failed to delete order. Please try again."
      );
    } finally {
      setOrderToDelete(null);
    }
  };

  const handleAssignDeliveryPartner = async (orderId, deliveryManId) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${backendUrl}/api/orders/assign/${orderId}`,
        { deliveryManId },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      toast.success("Delivery partner assigned successfully!");
      refetchCurrent();
    } catch (error) {
      console.error("Error assigning delivery partner:", error);
      toast.error("Failed to assign delivery partner. Please try again.");
    }
  };

  const clearSearch = () => {
    setSearchTerm("");
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // ✅ Helper to calculate VAT breakdown for an order
  const getVatBreakdown = (order) => {
    if (!order.orderItems || !Array.isArray(order.orderItems)) {
      return { exclVat: 0, vatAmount: 0, grandTotal: 0 };
    }
    const exclVat = order.orderItems.reduce((sum, item) => sum + (item.exclVatAmount || 0), 0);
    const vatAmount = order.orderItems.reduce((sum, item) => sum + (item.vatAmount || 0), 0);
    // Once the order has been packed, invoiceHistory holds the actual invoiced
    // Grand Total(s) — each already rounded to the nearest whole AED (Sub
    // Total + Round Off = Grand Total). Prefer that sum over the raw
    // order-time total so this list reflects what the customer is really
    // being charged, not the pre-rounding estimate.
    const grandTotal = order.invoiceHistory?.length > 0
      ? order.invoiceHistory.reduce((sum, h) => sum + (h.amount || 0), 0)
      : order.orderItems.reduce((sum, item) => sum + (item.totalAmount || 0), 0);
    return { exclVat, vatAmount, grandTotal };
  };

  if (!user) {
    return <div className="order-list-loading">Loading...</div>;
  }

  return (
    <div className="order-list-layout">
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
        className={`order-list-main-content ${sidebarOpen ? "sidebar-open" : ""}`}
      >
        <div className="order-list-container-wrapper">
          <div className="order-list-container">
            <div className="order-list-header-section">
              <h2 className="order-list-page-title">Order Management</h2>

              <div className="order-list-controls-group">
                <label
                  htmlFor="statusFilter"
                  className="order-list-filter-label"
                >
                  Filter by Order Status:
                </label>
                <select
                  id="statusFilter"
                  className="order-list-status-filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  aria-label="Filter orders by status"
                >
                  <option value="all">All</option>
                  <option value="pending">Pending</option>
                  <option value="partial_delivered">Partial Delivered</option>
                  <option value="delivered">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                </select>

                <div className="order-list-search-container">
                  <input
                    type="text"
                    className="order-list-search-input"
                    placeholder="Search by customer..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    aria-label="Search orders by customer name"
                  />
                  {searchTerm && (
                    <button
                      className="order-list-search-clear"
                      onClick={clearSearch}
                      aria-label="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* Create Order button - Only for Admin and Sales man, NOT for Sales Manager */}
                {["Admin", "Sales man"].includes(user?.role) && (
                  <Link to="/order/create" className="order-list-create-button">
                    Create Order
                  </Link>
                )}
              </div>
            </div>

            {loading ? (
              <div className="order-list-loading">Loading orders...</div>
            ) : (
              <TableScrollSync>
                <div className="order-list-table-wrapper">
                  <table className="order-list-data-table">
                    <thead>
                      <tr>
                        <th scope="col">No</th>
                        <th scope="col">Order ID</th>
                        <th scope="col">Customer</th>
                        <th scope="col">Total Qty</th>
                        {/* ✅ UPDATED: VAT Breakdown Columns */}
                        <th scope="col" className="vat-col">Total Dhs<br/><small>(Excl. VAT)</small></th>
                        <th scope="col" className="vat-col">VAT 5%<br/><small>(Amount)</small></th>
                        <th scope="col" className="vat-col grand-total-col">Grand Total<br/><small>(Incl. VAT)</small></th>
                        <th scope="col">Payment</th>
                        <th scope="col">Remarks</th>
                        <th scope="col">Delivery Partner</th>
                        <th scope="col">Assignment Status</th>
                        <th scope="col">Status</th>
                        <th scope="col">Order Date</th>
                        <th scope="col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleOrders.length > 0 ? (
                        visibleOrders.map((order, index) => {
                          const { exclVat, vatAmount, grandTotal } = getVatBreakdown(order);
                          return (
                            <tr key={order._id}>
                              <td>{activePagination.showingFrom + index}</td>
                              <td>
                                <button
                                  type="button"
                                  className="order-list-orderid-link"
                                  onClick={() => setViewProductsOrder(order)}
                                  title="View ordered products"
                                >
                                  {order.orderId || order._id}
                                </button>
                              </td>
                              <td>{order.customer?.name || "N/A"}</td>

                              <td>{order.totalOrderedQuantity || order.orderItems?.reduce((sum, it) => sum + it.orderedQuantity, 0) || 0}</td>

                              {/* ✅ UPDATED: VAT Breakdown Display */}
                              <td className="vat-cell">
                                <div className="vat-amount">
                                  <img src={DirhamSymbol} alt="AED" width={12} />
                                  <span>{exclVat.toFixed(2)}</span>
                                </div>
                              </td>
                              <td className="vat-cell">
                                <div className="vat-amount vat-highlight">
                                  <img src={DirhamSymbol} alt="AED" width={12} />
                                  <span>{vatAmount.toFixed(2)}</span>
                                </div>
                              </td>
                              <td className="vat-cell grand-total-cell">
                                <div className="vat-amount grand-total-amount">
                                  <img src={DirhamSymbol} alt="AED" width={14} />
                                  <span>{grandTotal.toFixed(2)}</span>
                                </div>
                              </td>

                              <td>{order.payment || "N/A"}</td>
                              <td title={order.remarks || ""}>
                                {order.remarks
                                  ? order.remarks.substring(0, 30) +
                                    (order.remarks.length > 30 ? "..." : "")
                                  : "-"}
                              </td>

                              <td>
                                {(() => {
                                  // Once a partner is assigned, just show their
                                  // name — no need to keep the dropdown open.
                                  // It only reappears when there's actually a
                                  // fresh assignment decision to make: nothing
                                  // assigned yet, the previous partner rejected,
                                  // or the order was partially delivered and the
                                  // remaining batch needs a (re)assignment.
                                  const canReassignNow =
                                    canAssignDelivery &&
                                    (order.assignmentStatus === "pending_assignment" ||
                                      order.assignmentStatus === "rejected" ||
                                      order.status === "partial_delivered");

                                  // Show every delivery partner who's actually
                                  // touched this order — whoever delivered
                                  // each round (deliveredInvoiceHistory[].deliveredBy)
                                  // plus whoever's currently assigned — not just
                                  // the current assignment, since a partially
                                  // delivered order can involve more than one
                                  // partner across rounds.
                                  const deliveredIds = [...new Set(
                                    (order.deliveredInvoiceHistory || [])
                                      .map((h) => h.deliveredBy)
                                      .filter(Boolean)
                                      .map(String)
                                  )];
                                  const deliveredNames = deliveredIds
                                    .map((id) => deliveryPartners.find((p) => String(p._id) === id)?.username)
                                    .filter(Boolean);
                                  const names = [...new Set(
                                    order.assignedTo?.username
                                      ? [...deliveredNames, order.assignedTo.username]
                                      : deliveredNames
                                  )];

                                  return (
                                    <>
                                      {names.length > 0 && (
                                        <div className="order-list-assigned-partner" style={{ marginBottom: 4 }}>
                                          {names.join(", ")}
                                        </div>
                                      )}
                                      {canReassignNow ? (
                                        <SearchableSelect
                                          className="order-list-delivery-partner-select"
                                          options={deliveryPartners.map((partner) => ({
                                            value: partner._id,
                                            label: partner.username,
                                          }))}
                                          value={order.assignedTo?._id || ""}
                                          onChange={(selectedId) => {
                                            if (selectedId) {
                                              handleAssignDeliveryPartner(
                                                order._id,
                                                selectedId
                                              );
                                            }
                                          }}
                                          placeholder="Assign Delivery Partner"
                                        />
                                      ) : names.length === 0 ? (
                                        <span className="order-list-not-assigned">
                                          Not Assigned
                                        </span>
                                      ) : null}
                                    </>
                                  );
                                })()}
                              </td>
                              <td>
                                <span
                                  className={`order-list-assignment-badge order-list-assignment-${order.assignmentStatus?.toLowerCase() || "pending"}`}
                                >
                                  {order.assignmentStatus === "accepted"
                                    ? "Accepted"
                                    : order.assignmentStatus === "rejected"
                                    ? "Rejected"
                                    : order.assignmentStatus === "assigned"
                                    ? "Assigned"
                                    : "Pending"}
                                </span>
                              </td>
                              <td>
                                <span
                                  className={`order-list-status-badge order-list-status-${order.status?.toLowerCase() || "pending"}`}
                                >
                                  {order.status?.charAt(0).toUpperCase() +
                                    order.status?.slice(1) || "Pending"}
                                </span>
                              </td>
                              <td>{formatDate(order.orderDate)}</td>
                              <td>
                                <div className="order-list-action-buttons">
                                  <button
                                    className="order-list-icon-button order-list-edit-button"
                                    onClick={() => {
                                      if (order.packedStatus && order.packedStatus !== "not_packed") {
                                        toast.error("Cannot edit an order that has been packed");
                                        return;
                                      }
                                      if (order.assignmentStatus === "accepted") {
                                        toast.error("Cannot edit an order that has been accepted by delivery partner");
                                        return;
                                      }
                                      navigate(`/order/create?edit=${order._id}`);
                                    }}
                                    aria-label={`Edit order ${order._id}`}
                                  >
                                    ✎
                                  </button>
                                  <button
                                    className="order-list-icon-button order-list-delete-button"
                                    onClick={() => {
                                      if (isDeleteBlocked(order)) {
                                        toast.error(
                                          "Cannot delete an order that is packed with a generated invoice"
                                        );
                                        return;
                                      }
                                      handleDeleteClick(order._id, order.orderId || order._id);
                                    }}
                                    aria-label={`Delete order ${order.orderId || order._id}`}
                                  >
                                    🗑️
                                  </button>
                                  {canAssignDelivery && (
                                    <button
                                      className="order-list-icon-button order-list-cancel-button"
                                      onClick={() => {
                                        if (isCancelBlocked(order)) {
                                          toast.error(
                                            "Cannot cancel an order that has already been packed"
                                          );
                                          return;
                                        }
                                        handleCancelClick(order._id, order.orderId || order._id);
                                      }}
                                      disabled={isCancelBlocked(order)}
                                      title={
                                        isCancelBlocked(order)
                                          ? "Order has already been packed and cannot be cancelled"
                                          : "Cancel order"
                                      }
                                      aria-label={`Cancel order ${order.orderId || order._id}`}
                                    >
                                      ✕
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan="13" className="order-list-no-data">
                            {activePagination.totalRecords === 0
                              ? "No orders found"
                              : "No orders match your filters"}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </TableScrollSync>
            )}

            <Pagination
              page={activePagination.page}
              totalPages={activePagination.totalPages}
              totalRecords={activePagination.totalRecords}
              showingFrom={activePagination.showingFrom}
              showingTo={activePagination.showingTo}
              canPrev={activePagination.canPrev}
              canNext={activePagination.canNext}
              onPrev={activePagination.goPrev}
              onNext={activePagination.goNext}
            />
          </div>
        </div>
      </main>

      {showDeleteModal && orderToDelete && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal">
            <h3 className="confirm-title">Delete Order</h3>
            <p className="confirm-text">
              Are you sure you want to delete order 
              <strong> #{orderToDelete.orderId}</strong>?
            </p>
            <p className="confirm-warning">This action cannot be undone.</p>

            <div className="confirm-actions">
              <button 
                className="confirm-cancel"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </button>
              <button
                className="confirm-delete"
                onClick={confirmDelete}
              >
                Delete Order
              </button>
            </div>
          </div>
        </div>
      )}

      {showCancelModal && orderToCancel && (
        <div className="co-modal-overlay" onClick={() => setShowCancelModal(false)}>
          <div className="co-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="co-modal-close"
              onClick={() => setShowCancelModal(false)}
              aria-label="Close"
            >
              ×
            </button>

            <div className="co-modal-icon">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a1.5 1.5 0 0 0 1.3 2.25h17.76a1.5 1.5 0 0 0 1.3-2.25L13.71 3.86a1.5 1.5 0 0 0-2.42 0Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <h3 className="co-modal-title">Cancel this order?</h3>
            <p className="co-modal-text">
              Order <span className="co-modal-order-chip">#{orderToCancel.orderId}</span> will be
              cancelled for the customer.
            </p>
            <p className="co-modal-note">This action cannot be undone.</p>

            <div className="co-modal-actions">
              <button
                type="button"
                className="co-modal-btn co-modal-btn-secondary"
                onClick={() => setShowCancelModal(false)}
              >
                Keep Order
              </button>
              <button
                type="button"
                className="co-modal-btn co-modal-btn-danger"
                onClick={confirmCancel}
              >
                Yes, Cancel Order
              </button>
            </div>
          </div>
        </div>
      )}

      {viewProductsOrder && (
        <OrderProductsModal
          order={viewProductsOrder}
          onClose={() => setViewProductsOrder(null)}
        />
      )}
    </div>
  );
};

export default OrderList;