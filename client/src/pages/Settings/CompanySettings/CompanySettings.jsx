// src/pages/Admin/Settings/CompanySettings.jsx
import React, { useState, useEffect } from "react";
import axios from "axios";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import toast from "react-hot-toast"; // ← NEW IMPORT
import "./CompanySettings.css";

const CompanySettings = () => {
  const [formData, setFormData] = useState({
    companyName: "",
    companyAddress: "",
    companyPhone: "",
    companyEmail: "",
    bankName: "",
    bankAccountNumber: "",
  });
  const [settingsId, setSettingsId] = useState(null); // for update
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [settingsExist, setSettingsExist] = useState(false);

  const backendUrl = process.env.REACT_APP_BACKEND_IP;

  useEffect(() => {
    const loadData = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          window.location.href = "/login";
          return;
        }

        // Get current user
        const userRes = await axios.get(`${backendUrl}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setCurrentUser(userRes.data.user || userRes.data);

        // Get company settings
        const settingsRes = await axios.get(
          `${backendUrl}/api/settings/company-settings`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        if (settingsRes.data) {
          setSettingsExist(true);
          setSettingsId(settingsRes.data._id);
          setFormData({
            companyName: settingsRes.data.companyName || "",
            companyAddress: settingsRes.data.companyAddress || "",
            companyPhone: settingsRes.data.companyPhone || "",
            companyEmail: settingsRes.data.companyEmail || "",
            bankName: settingsRes.data.bankName || "",
            bankAccountNumber: settingsRes.data.bankAccountNumber || "",
          });
        } else {
          setSettingsExist(false);
          setSettingsId(null);
          // Form remains empty for create
        }
      } catch (err) {
        toast.error(
          err.response?.data?.message || "Failed to load company settings",
        );
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [backendUrl]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);

    // Basic validation
    if (!formData.companyName.trim()) {
      toast.error("Company name is required");
      setIsSaving(false);
      return;
    }
    if (!formData.companyAddress.trim()) {
      toast.error("Company address is required");
      setIsSaving(false);
      return;
    }

    try {
      const token = localStorage.getItem("token");
      let res;

      if (settingsExist && settingsId) {
        // Update existing
        res = await axios.put(
          `${backendUrl}/api/settings/company-settings/${settingsId}`,
          formData,
          { headers: { Authorization: `Bearer ${token}` } },
        );
      } else {
        // Create new
        res = await axios.post(
          `${backendUrl}/api/settings/company-settings`,
          formData,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        // After create → update state
        setSettingsId(res.data.settings._id);
        setSettingsExist(true);
      }

      setFormData(res.data.settings || res.data);
      toast.success("Company settings saved successfully!");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="company-loading">Loading company invoice settings...</div>
    );
  }

  return (
    <div className="company-settings-layout">
      <Header
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        user={currentUser}
      />
      <Sidebar
        isOpen={sidebarOpen}
        activeItem="Settings"
        onSetActiveItem={() => {}}
        onClose={() => setSidebarOpen(false)}
        user={currentUser}
      />
      <main
        className={`company-main-content ${sidebarOpen ? "sidebar-open" : ""}`}
      >
        <div className="company-container">
          <h1>Company Invoice Settings</h1>
          <p className="company-subtitle">
            These details will appear on all generated invoices (DELIVERED &
            PENDING)
          </p>

          {!settingsExist && (
            <div className="info-banner">
              No company invoice details configured yet. Please fill in the form
              below to create them.
            </div>
          )}

          <form onSubmit={handleSubmit} className="company-form">
            <div className="form-group">
              <label htmlFor="companyName">
                Company Name <span className="required">*</span>
              </label>
              <input
                id="companyName"
                name="companyName"
                type="text"
                value={formData.companyName}
                onChange={handleChange}
                required
                placeholder="Enter company name"
              />
            </div>

            <div className="form-group">
              <label htmlFor="companyAddress">
                Company Address <span className="required">*</span>
              </label>
              <textarea
                id="companyAddress"
                name="companyAddress"
                value={formData.companyAddress}
                onChange={handleChange}
                required
                rows="3"
                placeholder="Full address including city, state, PIN, country"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="companyPhone">Phone Number</label>
                <input
                  id="companyPhone"
                  name="companyPhone"
                  type="text"
                  value={formData.companyPhone}
                  onChange={handleChange}
                  placeholder="e.g. +91 98765 43210"
                />
              </div>

              <div className="form-group">
                <label htmlFor="companyEmail">Company Email</label>
                <input
                  id="companyEmail"
                  name="companyEmail"
                  type="email"
                  value={formData.companyEmail}
                  onChange={handleChange}
                  placeholder="e.g. contact@yourcompany.com"
                />
              </div>
            </div>

            <hr className="divider" />

            <h3>Bank Details (appears in invoice footer)</h3>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="bankName">Bank Name</label>
                <input
                  id="bankName"
                  name="bankName"
                  type="text"
                  value={formData.bankName}
                  onChange={handleChange}
                  placeholder="e.g. State Bank of India"
                />
              </div>

              <div className="form-group">
                <label htmlFor="bankAccountNumber">Account Number / IBAN</label>
                <input
                  id="bankAccountNumber"
                  name="bankAccountNumber"
                  type="text"
                  value={formData.bankAccountNumber}
                  onChange={handleChange}
                  placeholder="e.g. 123456789012"
                />
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="save-btn" disabled={isSaving}>
                {isSaving
                  ? "Saving..."
                  : settingsExist
                    ? "Update Company Details"
                    : "Create Company Details"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
};

export default CompanySettings;
