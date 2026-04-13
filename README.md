# Grocery Web Application

A full-stack grocery management web application built with **React** (frontend) and **Node.js/Express** (backend) using **MongoDB** as the database.

---

## Folder Structure

```
grocery-web-application/
├── client/                         # React frontend application
│   ├── public/                     # Static public assets
│   │   ├── index.html
│   │   ├── manifest.json
│   │   └── robots.txt
│   └── src/
│       ├── App.js                  # Root application component
│       ├── index.js                # React entry point
│       ├── Assets/                 # Static assets (images, icons)
│       ├── components/             # Reusable UI components
│       │   ├── common/             # Shared/generic components
│       │   └── layout/
│       │       ├── Header/         # Top navigation bar
│       │       └── Sidebar/        # Side navigation menu
│       ├── constants/
│       │   └── menuPermissions.js  # Menu visibility rules per role
│       ├── context/
│       │   └── PermissionContext.js # Role-based permission provider
│       ├── dom/
│       │   └── Dom.jsx             # Route definitions & layout wrapper
│       └── pages/                  # All page-level components (see below)
│
└── server/                         # Node.js/Express backend API
    ├── Server.js                   # Express app entry point
    ├── config/
    │   └── db.js                   # MongoDB connection configuration
    ├── controllers/                # Route handler logic (see below)
    ├── middleware/
    │   └── authMiddleware.js       # JWT authentication & role guards
    ├── models/                     # Mongoose schemas (see below)
    └── routes/                     # Express route definitions (see below)
```

---

## Client Pages (`client/src/pages/`)

Each page folder contains a `.jsx` component and a matching `.css` file.

| Folder | Purpose |
|--------|---------|
| **Auth/** | Login page |
| **Dashboard/** | Main dashboard layout after login |
| **Profile/** | User profile view & change password |
| **Products/** | Category, subcategory, and product management (CRUD) |
| **Customer/** | Customer management — create, list, orders, credit limits, billing |
| **Sales/** | Order creation, order list, admin order requests, order reports |
| **Salesmanpages/** | Salesman-specific views — customer requests, pending orders, receipts, outstanding reports |
| **DeliveryPartner/** | Delivery partner views — pending, accepted, delivered, cancelled orders, wallet, payment requests |
| **Storekeeper/** | Storekeeper views — pack orders, storekeeper order list |
| **Roles/** | Role creation, role list, role permission management |
| **Users/** | User creation and user list |
| **Settings/** | Company settings (name, logo, etc.) |
| **BillWallet/** | Bill wallet management |
| **WalletMoney/** | Wallet money / balance management |

### Detailed Page Breakdown

```
pages/
├── Auth/
│   └── Login
├── Dashboard/
│   └── DashboardLayout
├── Profile/
│   ├── Profile
│   └── ChangePassword
├── Products/
│   ├── CategoryList/
│   ├── CreateCategory/
│   ├── SubCategoryList/
│   ├── CreateSubCategory/
│   ├── ProductList/
│   └── CreateProduct/
├── Customer/
│   ├── CustomerList/
│   ├── CreateCustomer/
│   ├── CreateCustomerOrder/
│   ├── CustomerOrdersList/
│   ├── CustomerOrderStatus/
│   ├── CustomerOrderReports/
│   ├── CustomerCreditLimit/
│   ├── CustomerBillStatement/
│   └── PendingCustomerRequests/
├── Sales/
│   ├── Orders/
│   │   ├── CreateOrder/
│   │   └── OrderList/          (includes AdminOrderRequests)
│   └── OrderReports/
├── Salesmanpages/
│   ├── SalesmanCustomers/
│   ├── CreateCustomerRequest/
│   ├── MyCustomerRequests/
│   ├── PendingOrders/
│   ├── PaymentRequestsSales/
│   ├── OutstandingReport/      (includes CustomerOutstandingDetails)
│   └── ReceiptReport/          (includes ReceiptDetails)
├── DeliveryPartner/
│   ├── PendingOrders/
│   ├── AcceptedOrdersList/
│   ├── DeliveredOrdersList/
│   ├── CancelledOrdersList/
│   ├── OrderArrivedList/
│   ├── DeliveryManOrderReports/
│   ├── PaymentRequestsDelivery/
│   └── Wallet/                 (includes ChequeWallet)
├── Storekeeper/
│   ├── StorekeeperOrders/
│   └── PackOrders/
├── Roles/
│   ├── RoleList
│   ├── CreateRole
│   └── RolePermissions
├── Users/
│   ├── User (create/edit)
│   └── UserTable (list)
├── Settings/
│   └── CompanySettings/
├── BillWallet/
└── WalletMoney/
```

---

## Server Structure (`server/`)

### Controllers (`server/controllers/`)

| File | Handles |
|------|---------|
| `authController.js` | Login, registration, token refresh |
| `userController.js` | User CRUD operations |
| `roleController.js` | Role & permission management |
| `customerController.js` | Customer CRUD & queries |
| `orderController.js` | Order creation, status updates, reports |
| `productController.js` | Product CRUD |
| `categoryController.js` | Category CRUD |
| `subCategoryController.js` | Subcategory CRUD |
| `billController.js` | Bill generation & management |
| `billTransactionController.js` | Bill payment transactions |
| `walletController.js` | Wallet balance operations |
| `paymentRequestController.js` | Payment request workflows |
| `settingsController.js` | Company settings management |

### Models (`server/models/`)

| Model | Description |
|-------|-------------|
| `User.js` | User accounts (admin, salesman, delivery, storekeeper) |
| `Role.js` | Roles with permission arrays |
| `Customer.js` | Customer profiles |
| `Order.js` | Sales orders |
| `OrderRequest.js` | Order modification/cancellation requests |
| `Product.js` | Product catalog entries |
| `Category.js` | Product categories |
| `SubCategory.js` | Product subcategories |
| `Bill.js` | Customer bills/invoices |
| `BillAdminRequest.js` | Admin requests related to bills |
| `BillTransaction.js` | Bill payment transactions |
| `InvoiceCounter.js` | Auto-increment invoice numbering |
| `CustomerRequest.js` | Salesman-created customer requests |
| `PaymentRequest.js` | Payment collection requests |
| `PaymentTransaction.js` | Payment transaction records |
| `CompanySettings.js` | Company configuration (name, logo, etc.) |
| `WalletMoney` | (via walletController) Wallet balances |

### Routes (`server/routes/`)

Each route file maps to its corresponding controller and is mounted in `Server.js`. Authentication is enforced via `authMiddleware.js`.

---

## User Roles

The application supports multiple user roles, each with a dedicated set of pages:

| Role | Key Pages |
|------|-----------|
| **Admin** | Dashboard, Products, Customers, Sales, Users, Roles, Settings |
| **Salesman** | Salesman Customers, Customer Requests, Pending Orders, Outstanding & Receipt Reports |
| **Delivery Partner** | Pending/Accepted/Delivered/Cancelled Orders, Wallet, Payment Requests |
| **Storekeeper** | Storekeeper Orders, Pack Orders |

Role-based access is controlled through `menuPermissions.js` and `PermissionContext.js` on the frontend, and `authMiddleware.js` on the backend.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React, React Router, CSS |
| Backend | Node.js, Express |
| Database | MongoDB (Mongoose ODM) |
| Auth | JWT (JSON Web Tokens) |
