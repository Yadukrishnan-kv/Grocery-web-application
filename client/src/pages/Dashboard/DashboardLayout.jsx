import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Header from '../../components/layout/Header/Header';
import Sidebar from '../../components/layout/Sidebar/Sidebar';
import './DashboardLayout.css';

const DashboardLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState('Dashboard');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(null);

  // Admin/Salesman stats
  const [totalUsers, setTotalUsers] = useState(0);
  const [revenue, setRevenue] = useState(0);
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalProducts, setTotalProducts] = useState(0);

  // Customer stats
  const [customerTotalOrders, setCustomerTotalOrders] = useState(0);
  const [customerDeliveredOrders, setCustomerDeliveredOrders] = useState(0);
  const [creditLimit, setCreditLimit] = useState(0);
  const [usedCredit, setUsedCredit] = useState(0);

  // Delivery stats
  const [assignedOrders, setAssignedOrders] = useState(0);
  const [acceptedOrders, setAcceptedOrders] = useState(0);
  const [deliveredOrders, setDeliveredOrders] = useState(0);
  const [pendingOrders, setPendingOrders] = useState(0);

  // Storekeeper stats
  const [pendingToPack, setPendingToPack] = useState(0);
  const [packedToday, setPackedToday] = useState(0);
  const [readyToDeliver, setReadyToDeliver] = useState(0);

  // Salesman stats
  const [totalOrderValue, setTotalOrderValue] = useState(0);
  const [totalSalesValue, setTotalSalesValue] = useState(0);
  const [pendingOrdersValue, setPendingOrdersValue] = useState(0);
  const [pendingDeliveryCount, setPendingDeliveryCount] = useState(0);
  const [salesReturnValue, setSalesReturnValue] = useState(0);
  const [cancelOrderCount, setCancelOrderCount] = useState(0);
  const [totalCashReceiptValue, setTotalCashReceiptValue] = useState(0);

  // Manager stats — same shape as Salesman's, but company-wide (not scoped
  // to one salesman's customers).
  const [managerTotalOrderValue, setManagerTotalOrderValue] = useState(0);
  const [managerTotalSalesValue, setManagerTotalSalesValue] = useState(0);
  const [managerPendingOrdersValue, setManagerPendingOrdersValue] = useState(0);
  const [managerPendingDeliveryValue, setManagerPendingDeliveryValue] = useState(0);
  const [managerSalesReturnValue, setManagerSalesReturnValue] = useState(0);
  const [managerCancelOrderValue, setManagerCancelOrderValue] = useState(0);
  const [managerCashReceiptValue, setManagerCashReceiptValue] = useState(0);


  const backendUrl = process.env.REACT_APP_BACKEND_IP;
  const navigate = useNavigate();

  const fetchUser = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        navigate('/login');
        return;
      }

      const response = await axios.get(`${backendUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setUser(response.data.user || response.data);
    } catch (error) {
      console.error("Failed to load user", error);
      localStorage.removeItem('token');
      navigate('/login');
    } finally {
      setLoading(false);
    }
  }, [backendUrl, navigate]);

  // Admin / Salesman Stats
  const fetchAdminSalesmanStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      setStatsError(null);

      const token = localStorage.getItem('token');
      if (!token) return;

      const config = { headers: { Authorization: `Bearer ${token}` } };

      const [usersRes, ordersRes, productsRes] = await Promise.all([
        axios.get(`${backendUrl}/api/users/getAllUsers`, config),
        axios.get(`${backendUrl}/api/orders/getallorders`, config),
        axios.get(`${backendUrl}/api/products/getallproducts`, config),
      ]);

      const nonAdminUsers = usersRes.data.filter(
        u => !['admin', 'superadmin'].includes(u.role?.toLowerCase())
      );
      setTotalUsers(nonAdminUsers.length || 0);


      const orders = ordersRes.data || [];
      setTotalOrders(orders.length);
      const totalRevenue = orders.reduce((sum, o) => sum + (o.totalAmount || o.grandTotal || 0), 0);
      setRevenue(totalRevenue);

      setTotalProducts(productsRes.data.length || 0);
    } catch (error) {
      console.error('Admin/Salesman stats error:', error);
      setStatsError('Failed to load statistics');
    } finally {
      setStatsLoading(false);
    }
  }, [backendUrl]);

  // Salesman Stats
  const fetchSalesmanStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      setStatsError(null);

      const token = localStorage.getItem('token');
      if (!token) return;

      const config = { headers: { Authorization: `Bearer ${token}` } };

      const [ordersRes, pendingRes, returnsRes, receiptsRes] = await Promise.all([
        axios.get(`${backendUrl}/api/orders/salesman-orders`, config),
        axios.get(`${backendUrl}/api/orders/my-pending-orders`, config),
        axios.get(`${backendUrl}/api/sales-returns/getall`, config),
        axios.get(`${backendUrl}/api/customers/receipts`, config),
      ]);

      const orders = ordersRes.data || [];
      const pending = pendingRes.data || [];
      const returns = returnsRes.data || [];
      const receipts = receiptsRes.data || [];

      // Same grand-total rule Order Report uses: the invoiced amount where
      // one exists, else the full ordered amount for orders not yet packed.
      const orderValue = (order) =>
        order.invoiceHistory?.length > 0
          ? order.invoiceHistory.reduce((sum, h) => sum + (h.amount || 0), 0)
          : order.orderItems?.reduce((sum, item) => sum + (item.totalAmount || 0), 0) || 0;

      setTotalOrderValue(orders.reduce((sum, o) => sum + orderValue(o), 0));

      // Sales Report only counts orders that actually have an invoice —
      // realized/delivered sales, not everything ever placed.
      setTotalSalesValue(
        orders.reduce(
          (sum, o) => sum + (o.invoiceHistory?.reduce((s, h) => s + (h.amount || 0), 0) || 0),
          0
        )
      );

      setPendingOrdersValue(pending.reduce((sum, o) => sum + orderValue(o), 0));

      // Same "still pending" rule as the Accepted Orders / Delivery Pending
      // lists: accepted, not cancelled/delivered, and not yet fully
      // delivered against what's currently packed.
      const pendingDelivery = orders.filter((order) => {
        if (
          order.assignmentStatus !== 'accepted' ||
          order.status === 'delivered' ||
          order.status === 'cancelled'
        ) {
          return false;
        }
        const totalDelivered =
          order.orderItems?.reduce((s, i) => s + (i.deliveredQuantity || 0), 0) || 0;
        const packedNotDelivered =
          order.orderItems?.reduce(
            (s, i) => s + ((i.packedQuantity || 0) - (i.deliveredQuantity || 0)),
            0
          ) || 0;
        return !(totalDelivered > 0 && packedNotDelivered === 0);
      });
      setPendingDeliveryCount(pendingDelivery.length);

      setCancelOrderCount(orders.filter((o) => o.status === 'cancelled').length);

      // Same value rule the Sales Return list uses per row.
      const returnValue = (sr) =>
        sr.refundAmount ||
        Math.round((sr.returnItems || []).reduce((s, i) => s + (i.totalAmount || 0), 0));
      setSalesReturnValue(returns.reduce((sum, sr) => sum + returnValue(sr), 0));

      setTotalCashReceiptValue(
        receipts.reduce((sum, r) => sum + (r.paidAmount || r.amountDue || 0), 0)
      );
    } catch (error) {
      console.error('Salesman stats error:', error);
      setStatsError('Failed to load statistics');
    } finally {
      setStatsLoading(false);
    }
  }, [backendUrl]);

  // Manager Stats — company-wide equivalents of the Salesman figures above
  const fetchManagerStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      setStatsError(null);

      const token = localStorage.getItem('token');
      if (!token) return;

      const config = { headers: { Authorization: `Bearer ${token}` } };

      const [ordersRes, pendingRes, deliveryPendingRes, returnsRes, billsRes] = await Promise.all([
        axios.get(`${backendUrl}/api/orders/getallorders`, config),
        axios.get(`${backendUrl}/api/orders/my-pending-orders`, config),
        axios.get(`${backendUrl}/api/orders/delivery-pending`, config),
        axios.get(`${backendUrl}/api/sales-returns/getall`, config),
        axios.get(`${backendUrl}/api/bills/getallbills`, config),
      ]);

      const orders = ordersRes.data || [];
      const pending = pendingRes.data || [];
      const deliveryPending = deliveryPendingRes.data || [];
      const returns = returnsRes.data || [];
      const bills = billsRes.data || [];

      // Same grand-total rule Order Report uses: the invoiced amount where
      // one exists, else the full ordered amount for orders not yet packed.
      const orderValue = (order) =>
        order.invoiceHistory?.length > 0
          ? order.invoiceHistory.reduce((sum, h) => sum + (h.amount || 0), 0)
          : order.orderItems?.reduce((sum, item) => sum + (item.totalAmount || 0), 0) || 0;

      setManagerTotalOrderValue(orders.reduce((sum, o) => sum + orderValue(o), 0));

      // Sales Report only counts orders that actually have an invoice —
      // realized/delivered sales, not everything ever placed.
      setManagerTotalSalesValue(
        orders.reduce(
          (sum, o) => sum + (o.invoiceHistory?.reduce((s, h) => s + (h.amount || 0), 0) || 0),
          0
        )
      );

      setManagerCancelOrderValue(
        orders.filter((o) => o.status === 'cancelled').reduce((sum, o) => sum + orderValue(o), 0)
      );

      // "Pending order value" = orders still waiting to be packed.
      setManagerPendingOrdersValue(pending.reduce((sum, o) => sum + orderValue(o), 0));

      // Accepted but not yet (fully) delivered — same list the Delivery
      // Pending admin page shows.
      setManagerPendingDeliveryValue(deliveryPending.reduce((sum, o) => sum + orderValue(o), 0));

      // Same value rule the Sales Return list uses per row.
      const returnValue = (sr) =>
        sr.refundAmount ||
        Math.round((sr.returnItems || []).reduce((s, i) => s + (i.totalAmount || 0), 0));
      setManagerSalesReturnValue(returns.reduce((sum, sr) => sum + returnValue(sr), 0));

      // Total cash receipts company-wide = everything collected against a bill.
      setManagerCashReceiptValue(bills.reduce((sum, b) => sum + (b.paidAmount || 0), 0));
    } catch (error) {
      console.error('Manager stats error:', error);
      setStatsError('Failed to load statistics');
    } finally {
      setStatsLoading(false);
    }
  }, [backendUrl]);

  // Customer Stats
  const fetchCustomerStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      setStatsError(null);

      const token = localStorage.getItem('token');
      if (!token) return;

      const config = { headers: { Authorization: `Bearer ${token}` } };

      const profileRes = await axios.get(`${backendUrl}/api/customers/my-profile`, config);
      const customer = profileRes.data;

      if (!customer) {
        setStatsError('Your customer profile not found');
        return;
      }

      setCreditLimit(customer.creditLimit || customer.balanceCreditLimit || 0);
      setUsedCredit((customer.creditLimit || 0) - (customer.balanceCreditLimit || 0));

      const ordersRes = await axios.get(`${backendUrl}/api/orders/my-orders`, config);
      const myOrders = ordersRes.data || [];

      setCustomerTotalOrders(myOrders.length);
      setCustomerDeliveredOrders(myOrders.filter(o => o.status?.toLowerCase() === 'delivered').length);
    } catch (error) {
      console.error('Customer stats error:', error);
      setStatsError('Failed to load your statistics');
    } finally {
      setStatsLoading(false);
    }
  }, [backendUrl]);

  // Delivery Man Stats
  const fetchDeliveryManStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      setStatsError(null);

      const token = localStorage.getItem('token');
      if (!token) return;

      const config = { headers: { Authorization: `Bearer ${token}` } };

      const ordersRes = await axios.get(`${backendUrl}/api/orders/my-assigned-orders`, config);
      const myOrders = ordersRes.data || [];

      setAssignedOrders(myOrders.length);
      setAcceptedOrders(myOrders.filter(o => o.assignmentStatus?.toLowerCase() === 'accepted').length);
      setDeliveredOrders(myOrders.filter(o => o.status?.toLowerCase() === 'delivered').length);
      setPendingOrders(myOrders.filter(o => o.status?.toLowerCase() === 'pending').length);
    } catch (error) {
      console.error('Delivery stats error:', error);
      setStatsError('Failed to load delivery statistics');
    } finally {
      setStatsLoading(false);
    }
  }, [backendUrl]);

  // Storekeeper Stats
  const fetchStorekeeperStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      setStatsError(null);

      const token = localStorage.getItem('token');
      if (!token) return;

      const config = { headers: { Authorization: `Bearer ${token}` } };

      // Pending to pack
      const pendingRes = await axios.get(`${backendUrl}/api/orders/pending-for-packing`, config);
      setPendingToPack(pendingRes.data.length || 0);

      // Packed today
      const today = new Date().toISOString().split('T')[0];
      const packedTodayRes = await axios.get(
        `${backendUrl}/api/orders/packed-today?date=${today}`,
        config
      );
      setPackedToday(packedTodayRes.data.length || 0);

      // Ready to deliver
      const readyRes = await axios.get(`${backendUrl}/api/orders/ready-to-deliver`, config);
      setReadyToDeliver(readyRes.data.length || 0);
    } catch (error) {
      console.error('Storekeeper stats error:', error);
      setStatsError('Failed to load packing statistics');
    } finally {
      setStatsLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    if (!user?.role) return;

    setStatsLoading(true);
    setStatsError(null);

    const role = user.role.toLowerCase().trim();

    if (role === 'sales man') {
      fetchSalesmanStats();
    } else if (role === 'manager') {
      fetchManagerStats();
    } else if (role.includes('admin') || role.includes('sales') || role.includes('manager')) {
      fetchAdminSalesmanStats();
    } else if (role.includes('customer')) {
      fetchCustomerStats();
    } else if (role.includes('delivery') || role.includes('delivery man')) {
      fetchDeliveryManStats();
    } else if (role.includes('store') || role === 'store kepper' || role === 'storekeeper') {
      fetchStorekeeperStats();
    } else {
      setStatsError(`Dashboard not configured for role: ${user.role}`);
      setStatsLoading(false);
    }
  }, [
    user,
    fetchAdminSalesmanStats,
    fetchCustomerStats,
    fetchDeliveryManStats,
    fetchStorekeeperStats,
    fetchSalesmanStats,
    fetchManagerStats,
  ]);

  const goToPackOrders = () => {
    navigate('/storekeeper/packed-orders');
  };

  if (loading) {
    return <div className="loading">Loading dashboard...</div>;
  }

  if (!user) {
    return null;
  }

  const renderStorekeeperDashboard = () => (
    <div className="stats-grid">
      <div className="stat-card">
        <div className="stat-icon">📦</div>
        <h3>Pending to Pack</h3>
        <p>{pendingToPack.toLocaleString()}</p>
      </div>
      <div className="stat-card">
        <div className="stat-icon">🔧</div>
        <h3>Packed Today</h3>
        <p>{packedToday.toLocaleString()}</p>
      </div>
      <div className="stat-card">
        <div className="stat-icon">🚚</div>
        <h3>Ready to Deliver</h3>
        <p>{readyToDeliver.toLocaleString()}</p>
      </div>
      <div className="stat-card quick-action">
        <button className="quick-action-btn" onClick={goToPackOrders}>
          Go to Pack Orders →
        </button>
      </div>
    </div>
  );

  const formatAed = (value) =>
    `AED ${(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const renderSalesmanStats = () => (
    <div className="stats-grid">
      <div className="stat-card">
        <div className="stat-icon credit-limit-icon">💳</div>
        <h3>Credit Limit</h3>
        <p>AED {(user.salesmanCreditLimit || 0).toLocaleString()}</p>
      </div>
      <div className="stat-card">
        <div className="stat-icon available-credit-icon">✅</div>
        <h3>Available Credit</h3>
        <p>AED {(user.salesmanBalanceCreditLimit || 0).toLocaleString()}</p>
      </div>
      <div
        className="stat-card clickable"
        role="button"
        tabIndex={0}
        onClick={() => navigate('/OrderReports/list')}
        onKeyDown={(e) => e.key === 'Enter' && navigate('/OrderReports/list')}
      >
        <div className="stat-icon orders-icon">📦</div>
        <h3>Total Order Value</h3>
        <p>{formatAed(totalOrderValue)}</p>
      </div>
      <div
        className="stat-card clickable"
        role="button"
        tabIndex={0}
        onClick={() => navigate('/SalesReports/list')}
        onKeyDown={(e) => e.key === 'Enter' && navigate('/SalesReports/list')}
      >
        <div className="stat-icon revenue-icon">💰</div>
        <h3>Total Sales Value</h3>
        <p>{formatAed(totalSalesValue)}</p>
      </div>
      <div
        className="stat-card clickable"
        role="button"
        tabIndex={0}
        onClick={() => navigate('/sales/pending-orders')}
        onKeyDown={(e) => e.key === 'Enter' && navigate('/sales/pending-orders')}
      >
        <div className="stat-icon pending-icon">⏳</div>
        <h3>Pending Orders Value</h3>
        <p>{formatAed(pendingOrdersValue)}</p>
      </div>
      <div className="stat-card">
        <div className="stat-icon assigned-icon">🚚</div>
        <h3>Pending Delivery</h3>
        <p>{pendingDeliveryCount.toLocaleString()}</p>
      </div>
      <div
        className="stat-card clickable"
        role="button"
        tabIndex={0}
        onClick={() => navigate('/sales-returns')}
        onKeyDown={(e) => e.key === 'Enter' && navigate('/sales-returns')}
      >
        <div className="stat-icon used-credit-icon">↩️</div>
        <h3>Sales Return Value</h3>
        <p>{formatAed(salesReturnValue)}</p>
      </div>
      <div className="stat-card">
        <div className="stat-icon delivered-icon">❌</div>
        <h3>Cancel Orders</h3>
        <p>{cancelOrderCount.toLocaleString()}</p>
      </div>
      <div className="stat-card">
        <div className="stat-icon credit-limit-icon">🧾</div>
        <h3>Total Cash Receipt Value</h3>
        <p>{formatAed(totalCashReceiptValue)}</p>
      </div>
    </div>
  );

  const renderManagerStats = () => (
    <div className="stats-grid">
      <div
        className="stat-card clickable"
        role="button"
        tabIndex={0}
        onClick={() => navigate('/SalesReports/list')}
        onKeyDown={(e) => e.key === 'Enter' && navigate('/SalesReports/list')}
      >
        <div className="stat-icon revenue-icon">💰</div>
        <h3>Total Sales Value</h3>
        <p>{formatAed(managerTotalSalesValue)}</p>
      </div>
      <div
        className="stat-card clickable"
        role="button"
        tabIndex={0}
        onClick={() => navigate('/OrderReports/list')}
        onKeyDown={(e) => e.key === 'Enter' && navigate('/OrderReports/list')}
      >
        <div className="stat-icon orders-icon">📦</div>
        <h3>Total Order Value</h3>
        <p>{formatAed(managerTotalOrderValue)}</p>
      </div>
      <div
        className="stat-card clickable"
        role="button"
        tabIndex={0}
        onClick={() => navigate('/sales/pending-orders')}
        onKeyDown={(e) => e.key === 'Enter' && navigate('/sales/pending-orders')}
      >
        <div className="stat-icon pending-icon">⏳</div>
        <h3>Pending Order Value</h3>
        <p>{formatAed(managerPendingOrdersValue)}</p>
      </div>
      <div
        className="stat-card clickable"
        role="button"
        tabIndex={0}
        onClick={() => navigate('/admin/delivery-pending')}
        onKeyDown={(e) => e.key === 'Enter' && navigate('/admin/delivery-pending')}
      >
        <div className="stat-icon assigned-icon">🚚</div>
        <h3>Pending Delivery Value</h3>
        <p>{formatAed(managerPendingDeliveryValue)}</p>
      </div>
      <div
        className="stat-card clickable"
        role="button"
        tabIndex={0}
        onClick={() => navigate('/sales-returns')}
        onKeyDown={(e) => e.key === 'Enter' && navigate('/sales-returns')}
      >
        <div className="stat-icon used-credit-icon">↩️</div>
        <h3>Sales Return Value</h3>
        <p>{formatAed(managerSalesReturnValue)}</p>
      </div>
      <div
        className="stat-card clickable"
        role="button"
        tabIndex={0}
        onClick={() => navigate('/CancelOrderReports/list')}
        onKeyDown={(e) => e.key === 'Enter' && navigate('/CancelOrderReports/list')}
      >
        <div className="stat-icon delivered-icon">❌</div>
        <h3>Cancel Order Value</h3>
        <p>{formatAed(managerCancelOrderValue)}</p>
      </div>
      <div className="stat-card">
        <div className="stat-icon credit-limit-icon">🧾</div>
        <h3>Total Cash Receipt Value</h3>
        <p>{formatAed(managerCashReceiptValue)}</p>
      </div>
    </div>
  );

  const renderAdminSalesmanStats = () => (
    <div className="stats-grid">
      {(user.role.toLowerCase().includes('admin') || user.role.toLowerCase().includes('manager')) && (
        <div className="stat-card">
          <div className="stat-icon users-icon">👥</div>
          <h3>Total Users</h3>
          <p>{totalUsers.toLocaleString()}</p>
        </div>
      )}
      {user.role.toLowerCase().includes('sales') && (
        <>
          <div className="stat-card">
            <div className="stat-icon credit-limit-icon">💳</div>
            <h3>Credit Limit</h3>
            <p>AED {(user.salesmanCreditLimit || 0).toLocaleString()}</p>
          </div>
          <div className="stat-card">
            <div className="stat-icon available-credit-icon">✅</div>
            <h3>Available Credit</h3>
            <p>AED {(user.salesmanBalanceCreditLimit || 0).toLocaleString()}</p>
          </div>
        </>
      )}
      <div className="stat-card">
        <div className="stat-icon revenue-icon">💰</div>
        <h3>Revenue</h3>
        <p>₹{revenue.toLocaleString()}</p>
      </div>
      <div className="stat-card">
        <div className="stat-icon orders-icon">📦</div>
        <h3>Total Orders</h3>
        <p>{totalOrders.toLocaleString()}</p>
      </div>
      <div className="stat-card">
        <div className="stat-icon products-icon">🛒</div>
        <h3>Total Products</h3>
        <p>{totalProducts.toLocaleString()}</p>
      </div>
    </div>
  );

  const renderCustomerStats = () => (
    <div className="stats-grid">
      <div className="stat-card">
        <div className="stat-icon orders-icon">📦</div>
        <h3>Total Orders</h3>
        <p>{customerTotalOrders.toLocaleString()}</p>
      </div>
      <div className="stat-card">
        <div className="stat-icon delivered-icon">✅</div>
        <h3>Delivered Orders</h3>
        <p>{customerDeliveredOrders.toLocaleString()}</p>
      </div>
      <div className="stat-card">
        <div className="stat-icon credit-limit-icon">💳</div>
        <h3>Credit Limit</h3>
        <p>₹{creditLimit.toLocaleString()}</p>
      </div>
      <div className="stat-card">
        <div className="stat-icon used-credit-icon">📉</div>
        <h3>Used Credit</h3>
        <p>₹{usedCredit.toLocaleString()}</p>
      </div>
    </div>
  );

  const renderDeliveryManStats = () => (
    <div className="stats-grid">
      <div className="stat-card">
        <div className="stat-icon assigned-icon">📬</div>
        <h3>Assigned Orders</h3>
        <p>{assignedOrders.toLocaleString()}</p>
      </div>
      <div className="stat-card">
        <div className="stat-icon accepted-icon">👍</div>
        <h3>Accepted Orders</h3>
        <p>{acceptedOrders.toLocaleString()}</p>
      </div>
      <div className="stat-card">
        <div className="stat-icon delivered-icon">✅</div>
        <h3>Delivered</h3>
        <p>{deliveredOrders.toLocaleString()}</p>
      </div>
      <div className="stat-card">
        <div className="stat-icon pending-icon">⏳</div>
        <h3>Pending</h3>
        <p>{pendingOrders.toLocaleString()}</p>
      </div>
    </div>
  );

  return (
    <div className="dashboard-layout">
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
        <div className="dashboard-content">
          <div className="page-header">
            <h2>Dashboard</h2>
            <p>Welcome back, <span className="user-name">{user.username || user.name || 'User'}</span></p>
          </div>

          {statsError ? (
            <div className="stats-error">{statsError}</div>
          ) : statsLoading ? (
            <div className="stats-skeleton">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="stat-card skeleton"></div>
              ))}
            </div>
          ) : (
            <div className="stats-container">
              {user.role.toLowerCase().trim() === 'sales man' ? (
                renderSalesmanStats()
              ) : user.role.toLowerCase().trim() === 'manager' ? (
                renderManagerStats()
              ) : (
                (user.role.toLowerCase().includes('admin') || user.role.toLowerCase().includes('sales') || user.role.toLowerCase().includes('manager')) &&
                renderAdminSalesmanStats()
              )}
              {user.role.toLowerCase().includes('customer') && renderCustomerStats()}
              {(user.role.toLowerCase().includes('delivery') || user.role.toLowerCase().includes('delivery man')) &&
                renderDeliveryManStats()}
              {(user.role.toLowerCase().includes('store') ||
                user.role.toLowerCase() === 'store kepper' ||
                user.role.toLowerCase() === 'storekeeper') &&
                renderStorekeeperDashboard()}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
