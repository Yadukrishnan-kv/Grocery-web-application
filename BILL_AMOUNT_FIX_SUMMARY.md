# Bill Generation Fix - Return Balance & Credit Limit Deduction

## Problem Statement
When a customer places an order and has both return balance and credit limit available, the system was creating bills for the full delivered amount instead of only the portion deducted from the credit limit.

### Example Scenario (Before Fix)
- Customer has: Credit Limit = 1000, Return Balance = 10.50
- Places order for: 21 AED
- During packing:
  - 10.50 deducted from return balance (store credit)
  - 10.50 deducted from credit limit
  - Result: Credit Limit = 989.50, Return Balance = 0
- **OLD Bill generated for: 21 AED** ❌
- **SHOULD be billed for: 10.50 AED** (only credit limit used)

---

## Solution Implemented

### 1. **Modified `deliverOrder` Function** (orderController.js, line ~399)

**What changed:**
- Calculate the ratio of credit limit used to total packed amount
- Apply this ratio to the delivered amount
- Pass only the proportional credit limit used portion to bill creation

**New logic:**
```javascript
// Calculate the ratio: creditLimitUsed / (creditLimitUsed + returnBalanceUsed)
const totalPackedAmount = (order.creditLimitUsed || 0) + (order.returnBalanceUsed || 0);
const creditLimitRatio = totalPackedAmount > 0 ? order.creditLimitUsed / totalPackedAmount : 0;

// Apply ratio to delivered amount to get proportional credit limit used
const creditLimitUsedForDelivery = parseFloat((grandDeliveryAmount * creditLimitRatio).toFixed(2));

// Pass this to bill creation instead of full amount
const bill = await createInvoiceBasedBill(order, creditLimitUsedForDelivery, order.invoiceNumber);
```

### 2. **Updated `createInvoiceBasedBill` Function** (billController.js, line ~294)

**What changed:**
- Now properly respects the `specificAmount` parameter passed to it
- Calculates VAT breakdown proportionally to the `specificAmount`
- Uses the provided `specificAmount` as the total bill amount

**Key improvement:**
- When `specificAmount` is provided (credit limit used portion), it:
  1. Sets `totalUsed = specificAmount`
  2. Calculates VAT breakdown proportionally based on delivered items
  3. Applies a scaling ratio to the VAT: `scalingRatio = specificAmount / totalDelivered`
  4. Creates the bill with the correct total and VAT breakdown

---

## Workflow After Fix

### Scenario: Full Order Delivery (21 AED)
1. **Order Created:** 21 AED (no credit deducted yet)
2. **Packing:** 
   - Return Balance: 10.50 → 0
   - Credit Limit: 1000 → 989.50
   - `order.creditLimitUsed = 10.50`
   - `order.returnBalanceUsed = 10.50`
   - Invoice generated: shows 21 AED

3. **Delivery:**
   - `grandDeliveryAmount = 21 AED` (full delivered)
   - `creditLimitRatio = 10.50 / 21 = 0.5` (50% from credit limit)
   - `creditLimitUsedForDelivery = 21 * 0.5 = 10.50 AED`
   - **Bill created for: 10.50 AED** ✅

### Scenario: Partial Delivery (14 AED of 21)
1. **Packing:** Same as above
   - `creditLimitUsed = 10.50`
   - `returnBalanceUsed = 10.50`

2. **Delivery (only 14 AED worth):**
   - `grandDeliveryAmount = 14 AED` (partial delivered)
   - `creditLimitRatio = 10.50 / 21 = 0.5`
   - `creditLimitUsedForDelivery = 14 * 0.5 = 7 AED`
   - **Bill created for: 7 AED** ✅ (proportional)

---

## Key Fields Used

### Order Model Fields
- `creditLimitUsed` - Cumulative amount deducted from credit limit during packing
- `returnBalanceUsed` - Cumulative amount deducted from return balance during packing
- `invoiceNumber` - Invoice number generated during packing

### Bill Model
- `totalUsed` - The bill amount (now only credit limit used portion)
- `totalExclVat` - VAT-exclusive portion of the bill
- `totalVatAmount` - VAT amount of the bill
- `grandTotal` - Same as totalUsed
- `amountDue` - Amount due for payment

---

## Invoice vs Bill Clarification

| Aspect | Invoice (At Packing) | Bill (At Delivery) |
|--------|----------------------|-------------------|
| **Shows** | Full packed quantity amount (21 AED) | Only credit limit used (10.50 AED) |
| **Purpose** | Reference for packed items | Amount to be paid/billed |
| **When Generated** | During packing | During delivery |
| **Amount Includes** | Both credit limit + return balance portions | Only credit limit portion |

---

## Impact on Customer Credit

When a customer with return balance places an order:

1. **Return balance is used first** (store credit from previous returns)
   - No credit limit used for this portion
   - No bill generated for this portion

2. **Credit limit is used for remainder**
   - Credit limit is deducted
   - Bill is generated for this portion
   - Customer must pay this bill

3. **Example:**
   - Order: 21 AED
   - Return Balance Used: 10.50 AED (no payment needed)
   - Credit Limit Used: 10.50 AED (bill generated)
   - **Customer pays: 10.50 AED** (not 21 AED)

---

## Files Modified
1. `server/controllers/orderController.js` - deliverOrder function
2. `server/controllers/billController.js` - createInvoiceBasedBill function

---

## Testing Checklist
- [ ] Test full delivery with return balance + credit limit usage
- [ ] Test partial delivery with return balance + credit limit usage
- [ ] Test delivery with only credit limit usage (no return balance)
- [ ] Test delivery with only return balance usage (no credit deduction)
- [ ] Verify VAT calculation is correct in bills
- [ ] Verify customer credit limit is correctly restored/tracked
- [ ] Verify invoice still shows full amount for reference
