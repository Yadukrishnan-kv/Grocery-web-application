// Sidebar.jsx
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePermissions } from '../../../context/PermissionContext'
import './Sidebar.css';

// Permission mapping for menu items
const MENU_PERMISSIONS = {
  'Dashboard': 'menu.dashboard',
  'Users': 'menu.users',
  'UserList': 'menu.users.list',
  'RolePermission': 'menu.users.roles',
  'Products': 'menu.products',
  'Category': 'menu.products.category',
  'SubCategory': 'menu.products.subcategory',
  'AddProducts': 'menu.products.add',
  'Customers': 'menu.customers',
  'CustomerList': 'menu.customers.list',
  'Sales': 'menu.sales',
  'Orders': 'menu.sales.orders',
  'OrdersReport': 'menu.sales.reports',
  'Deliveries': 'menu.deliveries',
  'OrderArrived': 'menu.deliveries.arrived',
  'AcceptedOrders': 'menu.deliveries.accepted',
  'DeliveredOrders': 'menu.deliveries.delivered',
  'CancelledOrders': 'menu.deliveries.cancelled',
  'CustomerOrders': 'menu.customer.orders',
  'CustomerOrderReports': 'menu.customer.order.reports',
  'CustomerBillStatement': 'menu.customer.bill.statement',
  'CustomerCreditLimit': 'menu.customer.credit.limit',
  'Settings': 'menu.settings',
  'CompanySettings': 'menu.settings.company',
  'CustomerRequests': 'menu.customer.requests',
  'CreateCustomerRequest': 'menu.customer.requests.create',
  'MyCustomerRequests': 'menu.customer.requests.my',
  'CashWallet': 'menu.CashWallet',
  'ChequeWallet': 'menu.ChequeWallet',
  'WalletMoney': 'menu.wallet.money',
  'paymentRequestsdelivery': 'menu.paymentRequestsdelivery',
  'paymentRequestssales': 'menu.paymentRequestssales',
  'billWallet': 'menu.billWallet',
  'AdminOrderRequests': 'menu.admin.order.requests',




  
};

const navItems = [
  { id: 'Dashboard', label: 'Dashboard', icon: '📊', path: '/dashboard' },
  { 
    id: 'Users', 
    label: 'Users', 
    icon: '👥',
    subItems: [
      { id: 'UserList', label: 'User', path: '/userlist' },
      { id: 'RolePermission', label: 'Role Permission', path: '/roles' }
    ]
  },
  { 
    id: 'Products', 
    label: 'Products', 
    icon: '📦',
    subItems: [
      { id: 'Category', label: 'Category', path: '/category/list' },
      { id: 'SubCategory', label: 'Sub Category', path: '/subcategory/list' },
      { id: 'AddProducts', label: 'Add Products', path: '/product/list' }
    ]
  },
  { 
    id: 'Customers', 
    label: 'Customers', 
    icon: '👥',
    subItems: [
      { id: 'CustomerList', label: 'Customers', path: '/customer/list' }
    ]
  },
  { 
    id: 'Sales', 
    label: 'Sales', 
    icon: '📋',
    subItems: [
      { id: 'Orders', label: 'Orders', path: '/order/list' },
      { id: 'OrdersReport', label: 'Orders Report', path: '/OrderReports/list' }
    ]
  },
         { id: 'AdminOrderRequests', label: ' Order Requests', icon: '📋', path: '/admin/AdminOrderRequests' },

  { 
    id: 'Deliveries', 
    label: 'Deliveries', 
    icon: '🚚',
    subItems: [
      { id: 'OrderArrived', label: 'Order arrived', path: '/Orderarrived/list' },
      { id: 'AcceptedOrders', label: 'Accepted Orders', path: '/AccepetdOrders/list' },
      { id: 'DeliveredOrders', label: 'Delivered Orders', path: '/DeliveredOrders/list' },
      { id: 'CancelledOrders', label: 'Cancelled Orders', path: '/CancelledOrders/list' }
    ]
  },
  {
    id: 'CustomerOrders',
    label: 'Orders',
    icon: '📦',
    subItems: [
      { id: 'CustomerOrdersList', label: 'View Orders', path: '/customer/orders' }
    ]
  },
  
  {
    id: 'CustomerOrderReports',
    label: 'Order Reports',
    icon: '📈',
    subItems: [
      { id: 'CustomerOrderReports', label: 'Reports', path: '/customer/order-reports' }
    ]
  },
  {
    id: 'CustomerBillStatement',
    label: 'Bill Statement',
    icon: '🧾',
    subItems: [
      { id: 'CustomerBillStatement', label: 'View Bills', path: '/customer/bill-statement' }
    ]
  },
  {
    id: 'CustomerCreditLimit',
    label: 'Credit Limit',
    icon: '💳',
    subItems: [
      { id: 'CustomerCreditLimit', label: 'Credit Info', path: '/customer/credit-limit' }
    ]
  },
  { 
    id: 'CustomerRequests', 
    label: 'Customer Requests', 
    icon: '📝',
    path: '/admin/customer-requests/pending',
  },
   { id: 'WalletMoney', label: 'Wallet Money', icon: '💰', path: '/admin/wallet-money' },
       { id: 'billWallet', label: 'Bill Wallet', icon: '💰', path: '/admin/BillWallet' },

  { id: 'Settings', label: 'Settings', icon: '⚙️', 
    subItems: [
      { id: 'CompanySettings', label: 'Company Settings', path: '/company-settings' }
    ]
   },
   { 
    id: 'CreateCustomerRequest', 
    label: 'Create Customer ', 
    icon: '📝',
    subItems: [
      { id: 'CreateCustomerRequest', label: 'Create Request', path: '/sales/customer-requests/create' },
      { id: 'MyCustomerRequests', label: 'My Requests', path: '/sales/customer-requests/my' }
    ]
    
  },
  { id: 'CashWallet', label: 'Cash Wallet', icon: '💰', path: '/delivery/wallet' },
  { id: 'ChequeWallet', label: 'Cheque Wallet', icon: '💰', path: '/delivery/wallet/cheque' },
  { id: 'paymentRequestsdelivery', label: 'Payment Requests', icon: '💰', path: '/delivery/payment-requests' },
  { id: 'paymentRequestssales', label: 'Payment Requests', icon: '💰', path: '/sales/payment-requests' },

  
];

const Sidebar = ({ isOpen, activeItem, onSetActiveItem, onClose, user }) => {
  const [expandedItems, setExpandedItems] = useState({});
  const navigate = useNavigate();
  const { hasPermission, loading } = usePermissions();

  // Filter nav items based on permissions AND hide Deliveries for Admin
  const filteredNavItems = useMemo(() => {
  if (loading) return [];
  
  let itemsToFilter = [...navItems];
  
  // Hide Deliveries and Customer Dashboard menus for Admin users
  if (user && user.role === 'Admin') {
    itemsToFilter = itemsToFilter.filter(item => 
      item.id !== 'Deliveries' && 
      item.id !== 'CustomerOrders' &&
      item.id !== 'CustomerOrderStatus' &&
      item.id !== 'CustomerOrderReports' &&
      item.id !== 'CustomerBillStatement' &&
      item.id !== 'CustomerCreditLimit' &&
      item.id !== 'CreateCustomerRequest' &&
      item.id !== 'CashWallet' &&
      item.id !== 'ChequeWallet' &&
      item.id !== 'paymentRequestsdelivery' &&
      item.id !== 'paymentRequestssales'
    );
  }


  
  return itemsToFilter.filter(item => {
    const itemPermission = MENU_PERMISSIONS[item.id];
    
    // If no permission required, show it
    if (!itemPermission) return true;
    
    // Check main item permission
    if (!hasPermission(itemPermission)) return false;
    
    // If has subitems, filter them too
    if (item.subItems) {
      const filteredSubItems = item.subItems.filter(subItem => {
        const subPermission = MENU_PERMISSIONS[subItem.id];
        return !subPermission || hasPermission(subPermission);
      });
      
      // Only show parent if it has visible children
      return filteredSubItems.length > 0;
    }
    
    return true;
  }).map(item => {
    // Also filter subitems
    if (item.subItems) {
      return {
        ...item,
        subItems: item.subItems.filter(subItem => {
          const subPermission = MENU_PERMISSIONS[subItem.id];
          return !subPermission || hasPermission(subPermission);
        })
      };
    }
    return item;
  });
}, [hasPermission, loading, user]);

  const toggleExpand = (itemId) => {
    setExpandedItems(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  const handleItemClick = (item, hasSubItems) => {
    if (hasSubItems) {
      toggleExpand(item.id);
    } else {
      onSetActiveItem(item.id);
      navigate(item.path);
      if (window.innerWidth < 768) {
        onClose();
      }
    }
  };

  const handleSubItemClick = (subItem) => {
    onSetActiveItem(subItem.id);
    navigate(subItem.path);
    if (window.innerWidth < 768) {
      onClose();
    }
  };

  if (loading) {
    return (
      <aside id="sidebar" className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-loading">Loading...</div>
      </aside>
    );
  }

  return (
    <aside 
      id="sidebar"
      className={`sidebar ${isOpen ? 'open' : ''}`}
      aria-hidden={!isOpen}
    >
      <nav className="sidebar-nav" aria-label="Main navigation">
        <ul>
          {filteredNavItems.map((item) => {
            const hasSubItems = item.subItems && item.subItems.length > 0;
            const isExpanded = expandedItems[item.id];
            const isActive = activeItem === item.id || 
              (hasSubItems && item.subItems.some(sub => sub.id === activeItem));
            
            return (
              <li key={item.id}>
                <button
                  className={`nav-link ${isActive ? 'active' : ''} ${hasSubItems ? 'has-subitems' : ''}`}
                  onClick={() => handleItemClick(item, hasSubItems)}
                  aria-expanded={hasSubItems ? isExpanded : undefined}
                  aria-controls={hasSubItems ? `submenu-${item.id}` : undefined}
                >
                  <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                  <span className="nav-label">{item.label}</span>
                  {hasSubItems && (
                    <span className="expand-icon" aria-hidden="true">
                      {isExpanded ? '▼' : '▶'}
                    </span>
                  )}
                </button>
                
                {hasSubItems && (
                  <ul 
                    id={`submenu-${item.id}`}
                    className={`submenu ${isExpanded ? 'open' : ''}`}
                    aria-hidden={!isExpanded}
                  >
                    {item.subItems.map((subItem) => (
                      <li key={subItem.id}>
                        <button
                          className={`nav-link sub-link ${activeItem === subItem.id ? 'active' : ''}`}
                          onClick={() => handleSubItemClick(subItem)}
                          aria-current={activeItem === subItem.id ? 'page' : undefined}
                        >
                          <span className="nav-label">{subItem.label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
};

export default Sidebar;