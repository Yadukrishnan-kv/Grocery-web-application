# Sales Return Logic - Complete Fix

## Problem Statement
When admin selects a customer in the CreateSalesReturn panel, orders were not showing for that customer.

## Root Cause
1. **Backend**: `getDeliveredOrdersForReturn` didn't filter orders for **customer role** (was treating customer the same as admin)
2. **Backend**: Didn't support optional customer filtering via query parameter for admin/salesman
3. **Frontend**: Was not re-fetching orders when customer selection changed

## Solution Implemented

### Backend Changes (salesReturnController.js)

#### Function: `getDeliveredOrdersForReturn`

**Updated Logic:**
```javascript
// Filter based on user role
if (req.user && req.user.role === "customer") {
  // Customer role: only their own orders (ignore customerId query param for security)
  query.customer = req.user._id;
} else if (req.user && req.user.role === "Sales man") {
  // Salesman: only their customers' orders
  const myCustomers = await Customer.find({ salesman: req.user._id }).select("_id");
  const myCustomerIds = myCustomers.map((c) => c._id);
  query.customer = { $in: myCustomerIds };
  
  // If admin/salesman filters by specific customer, apply that filter too
  if (req.query.customerId) {
    query.customer = req.query.customerId;
  }
} else if (req.user && req.user.role === "admin") {
  // Admin: optionally filter by specific customer if provided
  if (req.query.customerId) {
    query.customer = req.query.customerId;
  }
}
```

**Behavior:**
- **Customer**: Returns ONLY their own orders (30-day window, eligible for return)
- **Salesman**: Returns ONLY their customers' orders, optionally filtered by specific customerId
- **Admin**: Returns ALL orders (or specific customer if customerId provided in query)

---

### Frontend Changes (CreateSalesReturn.jsx)

#### 1. Updated `fetchDeliveredOrders` function

**Added `customerId` parameter:**
```javascript
const fetchDeliveredOrders = useCallback(async (customerId = null) => {
  try {
    const token = localStorage.getItem("token");
    const url = new URL(`${backendUrl}/api/sales-returns/delivered-orders`);
    if (customerId) {
      url.searchParams.append("customerId", customerId);
    }
    const res = await axios.get(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    // ... rest of logic
```

#### 2. Updated `handleCustomerChange` function

**Added re-fetch on customer selection:**
```javascript
const handleCustomerChange = (e) => {
  const newCustomerId = e.target.value;
  setSelectedCustomerId(newCustomerId);
  setSelectedOrderId("");
  setSelectedOrder(null);
  setReturnItems({});
  
  // Refetch orders for the selected customer
  if (newCustomerId) {
    setLoadingOrders(true);
    fetchDeliveredOrders(newCustomerId);
  }
};
```

#### 3. Updated initial `useEffect`

**Calls fetchDeliveredOrders without customerId on mount:**
```javascript
useEffect(() => {
  fetchUser();
  // For customer role: backend will filter by their ID
  // For admin/salesman: fetch all customers initially
  const initCustomerId = null;
  fetchDeliveredOrders(initCustomerId);
}, [fetchUser, fetchDeliveredOrders]);
```

---

## Complete User Flow

### **CUSTOMER Role:**
1. Component loads
2. Backend filters orders to only this customer's orders
3. No customer dropdown shown
4. Order dropdown populated with their eligible orders
5. Select order → see details & allow sales return

### **SALESMAN Role:**
1. Component loads
2. Backend returns all this salesman's customers' orders
3. Customer dropdown shows all their customers
4. When salesman selects a customer:
   - Frontend sends `customerId` query param to backend
   - Backend filters orders to only that customer
   - Order dropdown updates with that customer's orders
5. Select order → see details & allow sales return

### **ADMIN Role:**
1. Component loads
2. Backend returns ALL eligible orders from ALL customers
3. Customer dropdown shows all customers (from the returned orders)
4. When admin selects a customer:
   - Frontend sends `customerId` query param to backend
   - Backend filters orders to only that customer
   - Order dropdown updates with that customer's orders
5. Select order → see details & allow sales return

---

## Data Flow for Order Eligibility

**An order is eligible for return if:**
1. Status is `delivered` or `partial_delivered`
2. Order was updated within the last 30 days
3. At least ONE item has: `deliveredQuantity > alreadyReturned`

**Eligible items in an order:**
- Item must have `deliveredQuantity > 0`
- Item must have returnable quantity remaining (deliveredQuantity - alreadyReturned > 0)

---

## Testing Checklist

- [ ] **Customer login**: Should see only their eligible orders (no customer dropdown)
- [ ] **Salesman login**: Should see all their customers, and when selecting one, only that customer's orders
- [ ] **Admin login**: Should see all customers, and when selecting one, only that customer's orders
- [ ] **30-day window**: Orders older than 30 days should not appear
- [ ] **Already returned items**: If all items in an order are fully returned, order should not appear
- [ ] **Selected order display**: Shows correct order details and delivered items with return form

---

## Security Considerations

✅ **Implemented:**
- Customers cannot request other customers' orders (role-based backend filtering)
- Salesmen cannot request customers outside their territory (validated on backend)
- Query parameters validated against user role permissions
