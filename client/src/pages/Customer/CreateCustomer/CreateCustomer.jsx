// src/pages/Admin/CreateCustomer.jsx
import React, { useEffect, useState, useCallback } from "react";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import "./CreateCustomer.css";
import SearchableSelect from "../../../components/common/SearchableSelect";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import toast from "../../../utils/toast";

const CreateCustomer = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phoneNumber: "",
    address: "",
    pincode: "",
    creditLimit: "",
    billingType: "Credit limit",
    statementType: "",
    dueDays: "",
    openingBalance: "",
    openingBalanceDueDays: "",
    salesmanId: "",
    contactPersonName: "",
    contactPersonPhone: "",
    contactPersonAddress: "",
    latitude: "",
    longitude: "",
    emiratesName: "",
    emiratesCode: "",
    salesmanEmiratesName: "",
    salesmanEmiratesCode: "",
  });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEdit, setIsEdit] = useState(false);
  const [customerId, setCustomerId] = useState(null);
  const [salesmen, setSalesmen] = useState([]);
  const [emiratesList, setEmiratesList] = useState([]);

  const backendUrl = process.env.REACT_APP_BACKEND_IP;
  const navigate = useNavigate();
  const location = useLocation();

  const validateForm = () => {
    const newErrors = {};

    // "Field is required" checks only apply when creating a brand-new
    // customer. While editing, an admin may only be touching one or two
    // fields — leaving the rest exactly as they already are shouldn't block
    // saving. Format/range checks below still run whenever a value is
    // actually present, in both modes, so garbage input is never accepted.
    const requireField = !isEdit;

    if (requireField && !formData.name.trim()) {
      newErrors.name = "Customer name is required";
    }

    if (requireField && !formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (
      formData.email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)
    ) {
      newErrors.email = "Invalid email format";
    }

    if (requireField && !formData.phoneNumber.trim()) {
      newErrors.phoneNumber = "Phone number is required";
    }
    if (requireField && !formData.address.trim()) {
      newErrors.address = "Address is required";
    }
    if (requireField && !formData.pincode.trim()) {
      newErrors.pincode = "TRN is required";
    }

    if (formData.latitude !== "" && isNaN(parseFloat(formData.latitude))) {
      newErrors.latitude = "Latitude must be a valid number";
    }
    if (formData.longitude !== "" && isNaN(parseFloat(formData.longitude))) {
      newErrors.longitude = "Longitude must be a valid number";
    }

    if (formData.billingType === "Credit limit") {
      if (formData.creditLimit !== "") {
        if (isNaN(formData.creditLimit) || parseFloat(formData.creditLimit) < 0) {
          newErrors.creditLimit = "Valid credit limit ≥ 0 required";
        }
      } else if (requireField) {
        newErrors.creditLimit = "Valid credit limit ≥ 0 required";
      }

      if (requireField && !formData.statementType) {
        newErrors.statementType = "Statement type required";
      }

      if (formData.dueDays !== "") {
        if (isNaN(formData.dueDays) || parseInt(formData.dueDays) < 0) {
          newErrors.dueDays = "Valid due days ≥ 0 required";
        }
      } else if (requireField) {
        newErrors.dueDays = "Valid due days ≥ 0 required";
      }
    }

    // Opening balance validation — format/range only, applies in both modes.
    const openingBal = parseFloat(formData.openingBalance) || 0;
    if (openingBal < 0) {
      newErrors.openingBalance = "Opening balance cannot be negative";
    }
    if (openingBal > parseFloat(formData.creditLimit || 0)) {
      newErrors.openingBalance = "Opening balance cannot exceed credit limit";
    }
    if (openingBal > 0) {
      if (formData.openingBalanceDueDays !== "") {
        if (
          isNaN(formData.openingBalanceDueDays) ||
          parseInt(formData.openingBalanceDueDays) < 0
        ) {
          newErrors.openingBalanceDueDays = "Valid due days required when opening balance > 0";
        }
      } else if (requireField) {
        newErrors.openingBalanceDueDays = "Valid due days required when opening balance > 0";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "salesmanId") {
      const selected = salesmen.find((s) => s._id === value);
      setFormData((prev) => ({
        ...prev,
        salesmanId: value,
        salesmanEmiratesName: selected?.emiratesName || "",
        salesmanEmiratesCode: selected?.emiratesCode || "",
      }));
      if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
      return;
    }

    if (name === "emiratesName") {
      const selected = emiratesList.find((em) => em.emiratesName === value);
      setFormData((prev) => ({
        ...prev,
        emiratesName: value,
        emiratesCode: selected ? selected.emiratesCode : "",
      }));
      if (errors.emiratesName) setErrors((prev) => ({ ...prev, emiratesName: "" }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsLoading(true);

    try {
      const token = localStorage.getItem("token");
      const config = {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      };

      const submitData = {
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        phoneNumber: formData.phoneNumber.trim(),
        address: formData.address.trim(),
        pincode: formData.pincode.trim(),
        creditLimit: parseFloat(formData.creditLimit),
        billingType: formData.billingType,
        statementType:
          formData.billingType === "Credit limit"
            ? formData.statementType
            : null,
        dueDays:
          formData.billingType === "Credit limit"
            ? parseInt(formData.dueDays)
            : null,
        openingBalance: formData.openingBalance
          ? parseFloat(formData.openingBalance)
          : 0,
        openingBalanceDueDays: formData.openingBalanceDueDays
          ? parseInt(formData.openingBalanceDueDays)
          : null,
        salesmanId: formData.salesmanId || null,
        contactPersonName: formData.contactPersonName.trim() || null,
        contactPersonPhone: formData.contactPersonPhone.trim() || null,
        contactPersonAddress: formData.contactPersonAddress.trim() || null,
        latitude:
          formData.latitude !== "" && !isNaN(parseFloat(formData.latitude))
            ? parseFloat(formData.latitude)
            : null,
        longitude:
          formData.longitude !== "" && !isNaN(parseFloat(formData.longitude))
            ? parseFloat(formData.longitude)
            : null,
        emiratesName: formData.emiratesName || null,
        emiratesCode: formData.emiratesCode || null,
        salesmanEmiratesName: formData.salesmanEmiratesName || null,
        salesmanEmiratesCode: formData.salesmanEmiratesCode || null,
      };

      let response;
      if (isEdit) {
        response = await axios.put(
          `${backendUrl}/api/customers/updatecustomer/${customerId}`,
          submitData,
          config,
        );
        toast.success("Customer updated successfully!");
      } else {
        response = await axios.post(
          `${backendUrl}/api/customers/createcustomer`,
          submitData,
          config,
        );
        toast.success("Customer created successfully!");
      }

      // Show login credentials for new customer (if provided by backend)
      if (!isEdit && response.data?.defaultLoginInfo) {
        const { email, temporaryPassword, note } =
          response.data.defaultLoginInfo;
        toast.success(
          `Login created!\nEmail: ${email}\nTemp Password: ${temporaryPassword}\n${note || ""}`,
          { duration: 8000, style: { whiteSpace: "pre-line" } },
        );
      }

      setTimeout(() => navigate("/customer/list"), 2000);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save customer");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCustomerData = useCallback(
    async (id) => {
      try {
        const token = localStorage.getItem("token");
        const response = await axios.get(
          `${backendUrl}/api/customers/getcustomerbyid/${id}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        const customer = response.data;
        setFormData({
          name: customer.name || "",
          email: customer.email || "",
          phoneNumber: customer.phoneNumber || "",
          address: customer.address || "",
          pincode: customer.pincode || "",
          creditLimit: customer.creditLimit?.toString() || "",
          billingType: customer.billingType || "Credit limit",
          statementType: customer.statementType || "",
          dueDays: customer.dueDays?.toString() || "",
          openingBalance: customer.openingBalance?.toString() || "0",
          openingBalanceDueDays:
            customer.openingBalanceDueDays?.toString() || "",
          salesmanId: customer.salesman?._id || customer.salesman || "",
          contactPersonName: customer.contactPersonName || "",
          contactPersonPhone: customer.contactPersonPhone || "",
          contactPersonAddress: customer.contactPersonAddress || "",
          latitude: customer.latitude?.toString() || "",
          longitude: customer.longitude?.toString() || "",
          emiratesName: customer.emiratesName || "",
          emiratesCode: customer.emiratesCode || "",
          salesmanEmiratesName: customer.salesmanEmiratesName || "",
          salesmanEmiratesCode: customer.salesmanEmiratesCode || "",
        });
        setIsEdit(true);
        setCustomerId(id);
      } catch (error) {
        console.error("Failed to fetch customer data", error);
        toast.error("Failed to load customer data");
        navigate("/customer/list");
      }
    },
    [backendUrl, navigate],
  );

  const fetchCurrentUser = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        navigate("/login");
        return;
      }

      const response = await axios.get(`${backendUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setUser(response.data.user || response.data);
    } catch (error) {
      console.error("Failed to load user", error);
      localStorage.removeItem("token");
      navigate("/login");
    } finally {
      setLoading(false);
    }
  }, [navigate, backendUrl]);

  const fetchSalesmen = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${backendUrl}/api/users/sales-men`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSalesmen(response.data);
    } catch (error) {
      console.error("Failed to load salesmen", error);
      toast.error("Failed to load salesmen list");
    }
  }, [backendUrl]);

  const fetchEmirates = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${backendUrl}/api/emirates/getAll`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setEmiratesList(response.data);
    } catch (error) {
      console.error("Failed to load emirates", error);
      toast.error("Failed to load emirates list");
    }
  }, [backendUrl]);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const editId = searchParams.get("edit");

    if (editId) {
      fetchCustomerData(editId);
    }
  }, [location.search, fetchCustomerData]);

  useEffect(() => {
    fetchCurrentUser();
    fetchSalesmen();
    fetchEmirates();
  }, [fetchCurrentUser, fetchSalesmen, fetchEmirates]);

  if (loading) {
    return <div className="customer-loading">Loading user information...</div>;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="customer-form-layout">
      <Header
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        user={user}
      />
      <Sidebar
        isOpen={sidebarOpen}
        activeItem="Customers"
        onSetActiveItem={() => {}}
        onClose={() => setSidebarOpen(false)}
        user={user}
      />
      <main
        className={`customer-main-content ${sidebarOpen ? "sidebar-open" : ""}`}
      >
        <div className="customer-form-card">
          <h1>{isEdit ? "Edit Customer" : "Create New Customer"}</h1>

          <form onSubmit={handleSubmit} noValidate>
            <div className="customer-form-row">
              <div className="customer-form-group">
                <label htmlFor="name">Customer Name</label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  value={formData.name}
                  onChange={handleChange}
                  aria-invalid={!!errors.name}
                  aria-describedby={errors.name ? "name-error" : undefined}
                  className="customer-input"
                />
                {errors.name && (
                  <p
                    id="name-error"
                    className="customer-error-text"
                    role="alert"
                  >
                    {errors.name}
                  </p>
                )}
              </div>

              <div className="customer-form-group">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  className="customer-input"
                />
                {errors.email && (
                  <p
                    id="email-error"
                    className="customer-error-text"
                    role="alert"
                  >
                    {errors.email}
                  </p>
                )}
              </div>
            </div>

            <div className="customer-form-row">
              <div className="customer-form-group">
                <label htmlFor="phoneNumber">Phone Number</label>
                <input
                  id="phoneNumber"
                  name="phoneNumber"
                  type="text"
                  value={formData.phoneNumber}
                  onChange={handleChange}
                  aria-invalid={!!errors.phoneNumber}
                  aria-describedby={
                    errors.phoneNumber ? "phonenumber-error" : undefined
                  }
                  className="customer-input"
                />
                {errors.phoneNumber && (
                  <p
                    id="phonenumber-error"
                    className="customer-error-text"
                    role="alert"
                  >
                    {errors.phoneNumber}
                  </p>
                )}
              </div>

              <div className="customer-form-group">
                <label htmlFor="pincode">TRN</label>
                <input
                  id="pincode"
                  name="pincode"
                  type="text"
                  value={formData.pincode}
                  onChange={handleChange}
                  aria-invalid={!!errors.pincode}
                  aria-describedby={
                    errors.pincode ? "pincode-error" : undefined
                  }
                  className="customer-input"
                />
                {errors.pincode && (
                  <p
                    id="pincode-error"
                    className="customer-error-text"
                    role="alert"
                  >
                    {errors.pincode}
                  </p>
                )}
              </div>
            </div>

            <div className="customer-form-group">
              <label htmlFor="address">Address</label>
              <textarea
                id="address"
                name="address"
                value={formData.address}
                onChange={handleChange}
                rows="3"
                aria-invalid={!!errors.address}
                aria-describedby={errors.address ? "address-error" : undefined}
                className="customer-textarea"
              />
              {errors.address && (
                <p
                  id="address-error"
                  className="customer-error-text"
                  role="alert"
                >
                  {errors.address}
                </p>
              )}
            </div>

            <div className="customer-form-row">
              <div className="customer-form-group">
                <label htmlFor="creditLimit">Credit Limit (AED)</label>
                <input
                  id="creditLimit"
                  name="creditLimit"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.creditLimit}
                  onChange={handleChange}
                  aria-invalid={!!errors.creditLimit}
                  aria-describedby={
                    errors.creditLimit ? "creditlimit-error" : undefined
                  }
                  className="customer-input"
                />
                {errors.creditLimit && (
                  <p
                    id="creditlimit-error"
                    className="customer-error-text"
                    role="alert"
                  >
                    {errors.creditLimit}
                  </p>
                )}
              </div>

              <div className="customer-form-group">
                <label htmlFor="billingType">Billing Type</label>
                <SearchableSelect
                  id="billingType"
                  options={[
                    { value: "Credit limit", label: "Credit Limit" },
                    { value: "Cash", label: "Cash" },
                  ]}
                  value={formData.billingType}
                  onChange={(val) => handleChange({ target: { name: "billingType", value: val } })}
                  placeholder="Select billing type"
                  className="customer-select"
                />
              </div>
            </div>

            {formData.billingType === "Credit limit" && (
              <div className="customer-form-row">
                <div className="customer-form-group">
                  <label htmlFor="statementType">Statement Type</label>
                  <SearchableSelect
                    id="statementType"
                    options={[
                      { value: "invoice-based", label: "Invoice-based" },
                      { value: "monthly", label: "Monthly Statement" },
                    ]}
                    value={formData.statementType}
                    onChange={(val) => handleChange({ target: { name: "statementType", value: val } })}
                    placeholder="Select statement type"
                    className="customer-select"
                  />
                  {errors.statementType && (
                    <p
                      id="statementType-error"
                      className="customer-error-text"
                      role="alert"
                    >
                      {errors.statementType}
                    </p>
                  )}
                </div>

                <div className="customer-form-group">
                  <label htmlFor="dueDays">Due Days</label>
                  <input
                    id="dueDays"
                    name="dueDays"
                    type="number"
                    min="0"
                    value={formData.dueDays}
                    onChange={handleChange}
                    aria-invalid={!!errors.dueDays}
                    aria-describedby={
                      errors.dueDays ? "dueDays-error" : undefined
                    }
                    className="customer-input"
                  />
                  {errors.dueDays && (
                    <p
                      id="dueDays-error"
                      className="customer-error-text"
                      role="alert"
                    >
                      {errors.dueDays}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Opening Balance Section */}
            <div className="customer-form-row">
              <div className="customer-form-group">
                <label htmlFor="openingBalance">
                  Opening Balance (AED) - Existing Due
                </label>
                <input
                  id="openingBalance"
                  name="openingBalance"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.openingBalance}
                  onChange={handleChange}
                  className="customer-input"
                />
                {errors.openingBalance && (
                  <p className="customer-error-text">{errors.openingBalance}</p>
                )}
              </div>

              {parseFloat(formData.openingBalance || 0) > 0 && (
                <div className="customer-form-group">
                  <label htmlFor="openingBalanceDueDays">
                    Due Days for Opening Balance
                  </label>
                  <input
                    id="openingBalanceDueDays"
                    name="openingBalanceDueDays"
                    type="number"
                    min="0"
                    value={formData.openingBalanceDueDays}
                    onChange={handleChange}
                    placeholder="e.g. 15 days"
                    className="customer-input"
                  />
                  {errors.openingBalanceDueDays && (
                    <p className="customer-error-text">
                      {errors.openingBalanceDueDays}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Salesman Dropdown (only for admin) */}
            {user?.role === "Admin" && (
              <>
                <div className="customer-form-row">
                  <div className="customer-form-group">
                    <label htmlFor="salesmanId">Assign Salesman</label>
                    <SearchableSelect
                      id="salesmanId"
                      options={salesmen.map((salesman) => ({
                        value: salesman._id,
                        label: salesman.username,
                      }))}
                      value={formData.salesmanId}
                      onChange={(val) => handleChange({ target: { name: "salesmanId", value: val } })}
                      placeholder="Select Salesman (Optional)"
                      className="customer-select"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Emirates Section */}
            <div className="customer-form-row">
              <div className="customer-form-group">
                <label htmlFor="emiratesName">Emirates</label>
                <SearchableSelect
                  id="emiratesName"
                  options={emiratesList.map((em) => ({
                    value: em.emiratesName,
                    label: em.emiratesName,
                  }))}
                  value={formData.emiratesName}
                  onChange={(val) => handleChange({ target: { name: "emiratesName", value: val } })}
                  placeholder="Select Emirates"
                  className="customer-select"
                />
                {errors.emiratesName && (
                  <p className="customer-error-text">{errors.emiratesName}</p>
                )}
              </div>

              <div className="customer-form-group">
                <label htmlFor="emiratesCode">Emirates Code</label>
                <input
                  id="emiratesCode"
                  name="emiratesCode"
                  type="text"
                  value={formData.emiratesCode}
                  readOnly
                  placeholder="Auto-filled from Emirates"
                  className="customer-input"
                  style={{ backgroundColor: "#f8fafc", cursor: "default" }}
                />
              </div>
            </div>

            {/* Contact Person & Location */}
            <div className="customer-form-row">
              <div className="customer-form-group">
                <label htmlFor="contactPersonName">Contact Person Name</label>
                <input
                  id="contactPersonName"
                  name="contactPersonName"
                  type="text"
                  value={formData.contactPersonName}
                  onChange={handleChange}
                  placeholder="e.g. John Doe"
                  className="customer-input"
                />
              </div>
            </div>

            {formData.contactPersonName.trim() && (
              <>
                <div className="customer-form-row">
                  <div className="customer-form-group">
                    <label htmlFor="contactPersonPhone">Contact Person Phone</label>
                    <input
                      id="contactPersonPhone"
                      name="contactPersonPhone"
                      type="text"
                      value={formData.contactPersonPhone}
                      onChange={handleChange}
                      placeholder="e.g. +971 50 123 4567"
                      className="customer-input"
                    />
                  </div>
                </div>

                <div className="customer-form-row">
                  <div className="customer-form-group">
                    <label htmlFor="contactPersonAddress">Contact Person Address</label>
                    <textarea
                      id="contactPersonAddress"
                      name="contactPersonAddress"
                      value={formData.contactPersonAddress}
                      onChange={handleChange}
                      rows="2"
                      placeholder="e.g. Office 12, Building A, Dubai"
                      className="customer-textarea"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="customer-form-row">
              <div className="customer-form-group">
                <label htmlFor="latitude">Latitude</label>
                <input
                  id="latitude"
                  name="latitude"
                  type="number"
                  step="any"
                  value={formData.latitude}
                  onChange={handleChange}
                  placeholder="e.g. 25.2048"
                  aria-invalid={!!errors.latitude}
                  aria-describedby={errors.latitude ? "latitude-error" : undefined}
                  className="customer-input"
                />
                {errors.latitude && (
                  <p id="latitude-error" className="customer-error-text" role="alert">
                    {errors.latitude}
                  </p>
                )}
              </div>
              <div className="customer-form-group">
                <label htmlFor="longitude">Longitude</label>
                <input
                  id="longitude"
                  name="longitude"
                  type="number"
                  step="any"
                  value={formData.longitude}
                  onChange={handleChange}
                  placeholder="e.g. 55.2708"
                  aria-invalid={!!errors.longitude}
                  aria-describedby={errors.longitude ? "longitude-error" : undefined}
                  className="customer-input"
                />
                {errors.longitude && (
                  <p id="longitude-error" className="customer-error-text" role="alert">
                    {errors.longitude}
                  </p>
                )}
              </div>
            </div>

            <button
              type="submit"
              className="customer-submit-button"
              disabled={isLoading}
              aria-busy={isLoading}
            >
              {isLoading
                ? isEdit
                  ? "Updating..."
                  : "Creating..."
                : isEdit
                  ? "Update Customer"
                  : "Create Customer"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};

export default CreateCustomer;
