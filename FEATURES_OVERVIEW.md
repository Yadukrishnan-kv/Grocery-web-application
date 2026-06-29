# Grocery Web Application — Features Overview

> **A comprehensive B2B grocery ordering, delivery, and billing management system** with role-based access for Admin, Salesmen, Delivery Partners, Storekeepers, and Customers.

---

## Table of Contents

1. [Modules & Features](#modules--features)
2. [User Roles & Permissions](#user-roles--permissions)
3. [Core Workflows](#core-workflows)
4. [Tech Stack](#tech-stack)

---

## Modules & Features

### 1. Authentication & User Management

| Module | Features |
|--------|----------|
| **Login** | Username/email + password authentication; JWT-based session |
| **Profile** | View & edit personal details; Change password with verification |
| **User Management** (Admin) | Create, update, delete user accounts; Assign roles & sales regions |

### 2. Role-Based Access Control (RBAC)

| Feature | Description |
|---------|-------------|
| **Role Management** | Create roles with custom permission sets |
| **Permission System** | Granular permission strings for every module/action |
| **Dynamic Sidebar** | Menu items auto-hide based on user's permissions |
| **API Guarding** | Backend middleware verifies JWT on every protected route |

### 3. Product & Catalog Management

| Feature | Description |
|---------|-------------|
| **Category Management** | Create & manage product categories |
| **Sub-Category Management** | Create & manage sub-categories linked to categories |
| **Product CRUD** | Full product catalog with name, category, sub-category, pricing, units (kg, liter, piece, box) |
| **Inventory Units** | Supports multiple unit types per product |

### 4. Customer Management

| Feature | Description |
|---------|-------------|
| **Customer Directory** | Full customer list with search & filters |
| **Customer Profile** | Credit limits, billing type, statement type, geo-location, contact persons |
| **Customer Requests** | Salesmen can request admin to create new customers; Admin reviews & approves/rejects |
| **Credit Limit Suggestions** | Salesmen can suggest credit limit changes for manager approval |

### 5. Sales & Order Management

| Feature | Description |
|---------|-------------|
| **Order Creation** | Create orders with products, quantities, pricing & VAT |
| **Order Requests** | Customers can place order requests; Admin approves/rejects |
| **Order List** | Full order history with status tracking |
| **Order Reports** | Filterable reports (by date, customer, status) |
| **Partial Operations** | Supports partial packing and partial delivery |

### 6. Storekeeper (Warehouse / Packing)

| Feature | Description |
|---------|-------------|
| **Pack Orders** | Pack items for orders (partial or full packing) |
| **Remaining Packing** | View & complete partially packed orders |
| **All Orders View** | Unified view of all orders for the storekeeper |
| **Return Received** | Confirm receipt of returned goods from delivery partners |

### 7. Delivery Management

| Feature | Description |
|---------|-------------|
| **Pending Assignment** | Orders awaiting delivery assignment |
| **Order Acceptance** | Accept or reject assigned deliveries |
| **Partial Delivery** | Deliver partial quantities of packed items |
| **Delivery Tracking** | Accepted, delivered, and cancelled order lists |
| **Payment Collection** | Collect cash/cheque payments at delivery |
| **Return Pickups** | View & execute return pickup assignments |

### 8. Billing & Invoicing

| Feature | Description |
|---------|-------------|
| **Bill Generation** | Auto/manual bill generation per billing cycle |
| **VAT Breakdown** | Proportional VAT calculation on every item |
| **Invoice PDFs** | Generate professional PDF invoices (packing, delivery, unified, bill) |
| **Bill Statements** | Customers can view their bill statements & credit usage |
| **Receipts** | Payment receipts (single & bulk generation) |

### 9. Payments & Wallet Management

| Feature | Description |
|---------|-------------|
| **Cash Wallet** (Delivery) | Track all cash collected; Request admin to accept |
| **Cheque Wallet** (Delivery) | Track all cheques collected with cheque details |
| **Admin Wallet** | Unified view of all transactions; Accept/reject field payments |
| **Payment Requests** | Salesmen & delivery partners submit payment requests |
| **Payment Receipts** | Generate receipts for accepted payments |

### 10. Sales Returns

| Feature | Description |
|---------|-------------|
| **Return Request** | Initiate return on delivered orders (30-day window) |
| **Admin Approval** | Approve/reject returns; Assign delivery partner for pickup |
| **Pickup Confirmation** | Delivery partner confirms pickup with item verification |
| **Storekeeper Receipt** | Confirm goods received; Select refund method (cash/cheque/credit) |
| **Credit Note (CRN)** | Auto-generate Credit Return Note PDF invoice |
| **Financial Adjustment** | Auto-adjust credits, bills, and return balances |

### 11. Emirates (Regional Management)

| Feature | Description |
|---------|-------------|
| **Emirates CRUD** | Manage UAE Emirates (regions) with name & code |
| **Regional Filtering** | Used for customer & delivery region assignment |

### 12. Company Settings

| Feature | Description |
|---------|-------------|
| **Company Profile** | Company name, address, phone, email |
| **Bank Details** | Bank account information for invoices & payments |

### 13. Dashboard (Role-Based)

| Role | Dashboard Widgets |
|------|-------------------|
| **Admin** | Total users, revenue, orders, products |
| **Customer** | Own orders, credit usage, bill status |
| **Delivery Partner** | Assigned, accepted, delivered order counts |
| **Storekeeper** | Pending & packed order counts |
| **Salesman** | Credit limits, pending orders overview |

---

## User Roles & Permissions

| Role | Access Scope |
|------|-------------|
| **Admin** | Full access — all modules, settings, user management, reports |
| **Salesman** | Customer requests, pending orders, outstanding reports, receipt reports, payment requests, credit suggestions |
| **Delivery Partner** | Order pickup/delivery, return pickups, cash & cheque wallet, payment requests |
| **Storekeeper** | Packing, remaining packing, return receiving |
| **Customer** | Self-service: own orders, order status, order reports, bill statements, credit limit, sales returns |

---

## Core Workflows

### A. Order-to-Delivery Lifecycle

```
[Order Created] → [Storekeeper Packs] → [Admin Assigns Delivery]
    → [Delivery Partner Accepts] → [Delivered] → [Payment Settled]
```

1. **Order Creation** — Admin or Salesman creates an order with products, quantities, pricing + VAT
2. **Packing** — Storekeeper packs items (partial or full); credit deducted only for packed quantity; invoice generated
3. **Delivery Assignment** — Admin assigns to delivery partner; partner accepts or rejects
4. **Delivery** — Partner delivers (partial or full); collects cash/cheque or marks as credit
5. **Payment Settlement** — Partner submits payments to admin; admin accepts; receipts generated

### B. Customer Request Flow

```
[Salesman Creates Request] → [Admin Reviews] → [Approved/Rejected]
```

- Salesman fills customer details, credit limit, etc.
- Admin approves (customer created) or rejects (with reason)

### C. Billing & Payment Flow

```
[Bill Generated] → [Field Staff Collects Payment] → [Submitted to Admin]
    → [Admin Accepts] → [Customer Views Statement]
```

- Bills generated per billing cycle or on credit delivery
- VAT breakdown included proportionally
- Field staff (sales/delivery) collects & submits payments
- Admin accepts payments; receipts generated

### D. Sales Return Flow

```
[Return Requested] → [Admin Approves] → [Delivery Partner Pickup]
    → [Storekeeper Receives] → [Refund Processed] → [CRN Generated]
```

- Only delivered orders within 30-day window eligible
- Items must have delivered quantity > already-returned quantity
- Refund: cash/cheque/credit adjustment based on original payment method
- Auto-generates Credit Return Note (CRN) invoice

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, React Router 7, React Bootstrap 2, Lucide Icons |
| **Backend** | Node.js, Express 5 |
| **Database** | MongoDB with Mongoose 9 |
| **Authentication** | JWT + bcryptjs |
| **PDF Generation** | PDFKit |
| **HTTP Client** | Axios |
| **Notifications** | react-hot-toast |
| **Validation** | validator.js |
| **Date Handling** | moment.js |
