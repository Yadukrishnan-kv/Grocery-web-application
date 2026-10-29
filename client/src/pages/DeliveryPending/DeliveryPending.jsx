// src/pages/DeliveryPending/DeliveryPending.jsx
// Read-only admin view of every delivery partner's accepted-but-pending
// orders — same data/business rule as a delivery man's own "Accepted
// Orders" list (AcceptedOrdersList.jsx), just across all delivery men at
// once, with no action buttons and a filter by delivery man.
import React, { useState, useEffect, useCallback, useMemo } from "react";
import Header from "../../components/layout/Header/Header";
import Sidebar from "../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../Assets/aed-symbol.png";
import TableScrollSync from "../../components/common/TableScrollSync";
import "./DeliveryPending.css";
import axios from "axios";
import toast from "../../utils/toast";
import { useAppSettings } from "../../context/AppSettingsContext";
import { usePaginatedData } from "../../hooks/usePagination";
import Pagination from "../../components/common/Pagination";
import OrderProductsModal from "../../components/common/OrderProductsModal";

const DeliveryPending = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState("DeliveryPending");
  const [user, setUser] = useState(null);
  const [viewProductsOrder, setViewProductsOrder] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deliveryManFilter, setDeliveryManFilter] = useState("all");
  const [deliveryPartners, setDeliveryPartners] = useState([]);

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

  const fetchDeliveryPending = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${backendUrl}/api/orders/delivery-pending`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Same "still pending" rule as a delivery man's own Accepted Orders
      // list: once everything currently packed has been delivered and
      // nothing new has been packed since, it's no longer pending.
      const pending = response.data.filter((order) => {
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
      setOrders(pending);
    } catch (error) {
      console.error("Error fetching delivery pending orders:", error);
      toast.error(error.response?.data?.message || "Failed to load delivery pending orders");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  const fetchDeliveryPartners = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${backendUrl}/api/users/getAllUsers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const partners = response.data.filter((u) => u.role === "Delivery Man");
      setDeliveryPartners(partners);
    } catch (error) {
      console.error("Error fetching delivery partners:", error);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchDeliveryPending();
    fetchDeliveryPartners();
  }, [fetchCurrentUser, fetchDeliveryPending, fetchDeliveryPartners]);

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

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch =
        !searchTerm.trim() ||
        order.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus =
        statusFilter === "all" ||
        getDeliveryStatus(order).toLowerCase().replace(/\s/g, "-") === statusFilter;
      const matchesDeliveryMan =
        deliveryManFilter === "all" ||
        String(order.assignedTo?._id) === deliveryManFilter;
      return matchesSearch && matchesStatus && matchesDeliveryMan;
    });
  }, [orders, searchTerm, statusFilter, deliveryManFilter]);

  const { entriesPerPage } = useAppSettings();
  const pagination = usePaginatedData(
    filteredOrders,
    entriesPerPage,
    `${searchTerm}|${statusFilter}|${deliveryManFilter}`
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
    return <div className="delivery-pending-loading">Loading...</div>;
  }

  return (
    <div className="delivery-pending-layout">
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
        className={`delivery-pending-main-content ${sidebarOpen ? "sidebar-open" : ""}`}
      >
        <div className="delivery-pending-container-wrapper">
          <div className="delivery-pending-container">
            <div className="delivery-pending-header-section">
              <h2 className="delivery-pending-page-title">Delivery Pending</h2>

              <div className="delivery-pending-controls-group">
                <div className="delivery-pending-filter-group">
                  <label
                    htmlFor="statusFilter"
                    className="delivery-pending-filter-label"
                  >
                    Filter by Status:
                  </label>
                  <select
                    id="statusFilter"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="delivery-pending-filter-select"
                  >
                    <option value="all">All Statuses</option>
                    <option value="awaiting-packing">Awaiting Packing</option>
                    <option value="ready-to-deliver">Ready to Deliver</option>
                    <option value="partially-delivered">
                      Partially Delivered
                    </option>
                  </select>
                </div>

                <div className="delivery-pending-filter-group">
                  <label
                    htmlFor="deliveryManFilter"
                    className="delivery-pending-filter-label"
                  >
                    Filter by Delivery Man:
                  </label>
                  <select
                    id="deliveryManFilter"
                    value={deliveryManFilter}
                    onChange={(e) => setDeliveryManFilter(e.target.value)}
                    className="delivery-pending-filter-select"
                  >
                    <option value="all">All Delivery Men</option>
                    {deliveryPartners.map((partner) => (
                      <option key={partner._id} value={partner._id}>
                        {partner.username}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="delivery-pending-search-container">
                  <input
                    type="text"
                    className="delivery-pending-search-input"
                    placeholder="Search by customer name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    aria-label="Search delivery pending orders by customer"
                  />
                  {searchTerm && (
                    <button
                      className="delivery-pending-search-clear"
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
              <div className="delivery-pending-loading">Loading orders...</div>
            ) : filteredOrders.length === 0 ? (
              <div className="delivery-pending-no-data">
                No delivery pending orders found
                {searchTerm.trim() ? ` matching "${searchTerm}"` : ""}
              </div>
            ) : (
              <>
                <TableScrollSync>
                  <div className="delivery-pending-table-wrapper">
                    <table className="delivery-pending-data-table">
                      <thead>
                        <tr>
                          <th scope="col">No</th>
                          <th scope="col">Order ID</th>
                          <th scope="col">Customer</th>
                          <th scope="col">Delivery Man</th>
                          <th scope="col">Packed Qty</th>
                          <th scope="col">Grand Total</th>
                          <th scope="col">Status</th>
                          <th scope="col">Remarks</th>
                          <th scope="col">Order Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagination.pageData.map((order, index) => {
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

                          return (
                            <tr key={order._id}>
                              <td>{pagination.showingFrom + index}</td>
                              <td>
                                <button
                                  type="button"
                                  className="delivery-pending-orderid-link"
                                  onClick={() => setViewProductsOrder(order)}
                                  title="View ordered products"
                                >
                                  {order.orderId || order._id}
                                </button>
                              </td>
                              <td>{order.customer?.name || "N/A"}</td>
                              <td>{order.assignedTo?.username || "Unassigned"}</td>

                              <td className="delivery-pending-packed-qty-cell">{packedQty}</td>

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

                              <td>
                                <span className="delivery-pending-status-badge">
                                  {getDeliveryStatus(order)}
                                </span>
                              </td>

                              <td>{order.remarks || "-"}</td>

                              <td>{formatDate(order.orderDate)}</td>
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

export default DeliveryPending;
