import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "../pages/Auth/Login";
import DashboardLayout from "../pages/Dashboard/DashboardLayout";
import User from "../pages/Users/User";
import UserTable from "../pages/Users/UserTable";
import CreateCategory from "../pages/Products/CreateCategory/CreateCategory";
import CategoryList from "../pages/Products/CategoryList/CategoryList";
import CreateSubCategory from "../pages/Products/CreateSubCategory/CreateSubCategory";
import SubCategoryList from "../pages/Products/SubCategoryList/SubCategoryList";
import CreateProduct from "../pages/Products/CreateProduct/CreateProduct";
import ProductList from "../pages/Products/ProductList/ProductList";
import RolePermissions from "../pages/Roles/RolePermissions";
import RoleList from "../pages/Roles/RoleList";
import { PermissionProvider } from "../context/PermissionContext";
import CreateRole from "../pages/Roles/CreateRole";
import CreateCustomer from "../pages/Customer/CreateCustomer/CreateCustomer";
import CustomerList from "../pages/Customer/CustomerList/CustomerList";
import CreateOrder from "../pages/Sales/Orders/CreateOrder/CreateOrder";
import OrderList from "../pages/Sales/Orders/OrderList/OrderList";
import OrderArrivedList from "../pages/DeliveryPartner/OrderArrivedList/OrderArrivedList";
import AcceptedOrdersList from "../pages/DeliveryPartner/AcceptedOrdersList/AcceptedOrdersList";
import DeliveredOrdersList from "../pages/DeliveryPartner/DeliveredOrdersList/DeliveredOrdersList";
import CancelledOrdersList from "../pages/DeliveryPartner/CancelledOrdersList/CancelledOrdersList";
import OrderReports from "../pages/Sales/OrderReports/OrderReports";
import CustomerOrdersList from "../pages/Customer/CustomerOrdersList/CustomerOrdersList";
import CreateCustomerOrder from "../pages/Customer/CreateCustomerOrder/CreateCustomerOrder";
import CustomerOrderStatus from "../pages/Customer/CustomerOrderStatus/CustomerOrderStatus";
import CustomerOrderReports from "../pages/Customer/CustomerOrderReports/CustomerOrderReports";
import CustomerBillStatement from "../pages/Customer/CustomerBillStatement/CustomerBillStatement";
import CustomerCreditLimit from "../pages/Customer/CustomerCreditLimit/CustomerCreditLimit";
import Profile from "../pages/Profile/Profile";
import ChangePassword from "../pages/Profile/ChangePassword";
import CompanySettings from "../pages/Settings/CompanySettings/CompanySettings";
import CreateCustomerRequest from "../pages/Salesmanpages/CreateCustomerRequest/CreateCustomerRequest";
import MyCustomerRequests from "../pages/Salesmanpages/MyCustomerRequests/MyCustomerRequests";
import PendingCustomerRequests from "../pages/Customer/PendingCustomerRequests/PendingCustomerRequests";
import Wallet from "../pages/DeliveryPartner/Wallet/Wallet";
import WalletMoney from "../pages/WalletMoney/WalletMoney";
import ChequeWallet from "../pages/DeliveryPartner/Wallet/ChequeWallet";
function Dom() {
  return (
    <div>
      <PermissionProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={<DashboardLayout />} />
            <Route path="/company-settings" element={<CompanySettings />} />

            <Route path="/user/create" element={<User />} />
            <Route path="/userlist" element={<UserTable />} />
            <Route path="/category/create" element={<CreateCategory />} />
            <Route path="/category/list" element={<CategoryList />} />
            <Route path="/category/edit/:id" element={<CreateCategory />} />
            <Route path="/subcategory/create" element={<CreateSubCategory />} />
            <Route path="/subcategory/list" element={<SubCategoryList />} />
            <Route
              path="/subcategory/edit/:id"
              element={<CreateSubCategory />}
            />
            <Route path="/product/create" element={<CreateProduct />} />
            <Route path="/product/list" element={<ProductList />} />
            <Route path="/product/edit/:id" element={<CreateProduct />} />
            <Route path="/roles" element={<RoleList />} />
            <Route path="/roles/create" element={<CreateRole />} />

            <Route path="/roles/edit/:id" element={<RolePermissions />} />
            <Route path="/customer/create" element={<CreateCustomer />} />
            <Route path="/customer/list" element={<CustomerList />} />

            <Route path="/order/create" element={<CreateOrder />} />
            <Route path="/order/list" element={<OrderList />} />
            <Route path="/order/edit/:id" element={<CreateOrder />} />
            <Route path="/OrderReports/list" element={<OrderReports />} />

            <Route path="/Orderarrived/list" element={<OrderArrivedList />} />
            <Route
              path="/AccepetdOrders/list"
              element={<AcceptedOrdersList />}
            />
            <Route
              path="/deliveredorders/list"
              element={<DeliveredOrdersList />}
            />
            <Route
              path="/cancelledorders/list"
              element={<CancelledOrdersList />}
            />

            <Route path="/customer/orders" element={<CustomerOrdersList />} />
            <Route
              path="/customer/create-order"
              element={<CreateCustomerOrder />}
            />
            <Route
              path="/customer/order-status/:id"
              element={<CustomerOrderStatus />}
            />
            <Route
              path="/customer/order-reports"
              element={<CustomerOrderReports />}
            />
            <Route
              path="/customer/bill-statement"
              element={<CustomerBillStatement />}
            />
            <Route
              path="/customer/credit-limit"
              element={<CustomerCreditLimit />}
            />

            <Route path="/profile" element={<Profile />} />
            <Route path="/change-password" element={<ChangePassword />} />

            <Route
              path="/sales/customer-requests/create"
              element={<CreateCustomerRequest />}
            />
            <Route
              path="/sales/customer-requests/my"
              element={<MyCustomerRequests />}
            />
            <Route
              path="/admin/customer-requests/pending"
              element={<PendingCustomerRequests />}
            />
            <Route path="/delivery/wallet" element={<Wallet />} />
            <Route path="/delivery/wallet/cheque" element={<ChequeWallet />} />

            <Route path="/admin/wallet-money" element={<WalletMoney />} />
          </Routes>
        </BrowserRouter>
      </PermissionProvider>
    </div>
  );
}

export default Dom;
