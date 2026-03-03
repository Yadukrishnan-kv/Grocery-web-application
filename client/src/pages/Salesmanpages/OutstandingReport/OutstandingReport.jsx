import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import "./OutstandingReport.css";
import { useNavigate } from "react-router-dom";

const OutstandingReport = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [rows, setRows] = useState([]);
  const navigate = useNavigate();

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

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  useEffect(() => {
    const fetchOutstanding = async () => {
      try {
        const token = localStorage.getItem("token");
        const backend = process.env.REACT_APP_BACKEND_IP || "";
        const url = backend
          ? `${backend}/api/customers/my-customers-with-due`
          : `/api/customers/my-customers-with-due`;
        const res = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setRows(res.data || []);
      } catch (err) {
        console.error("Failed to load outstanding report:", err);
      }
    };
    fetchOutstanding();
  }, []);

  if (!user) {
    return <div className="order-list-loading">Loading...</div>;
  }

  return (
    <div className="order-list-layout">
      <Header sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} user={user} />
      <Sidebar isOpen={sidebarOpen} activeItem={"Outstanding"} onSetActiveItem={() => {}} onClose={() => setSidebarOpen(false)} user={user} />

      <main className={`order-list-main-content ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="order-list-container-wrapper">
          <div className="order-list-container">
            <div className="order-list-header-section">
              <h2 className="order-list-page-title">Customers Outstanding Report</h2>
              <p className="sub">Used credit limits and outstanding balances of customers</p>
            </div>

            <div className="order-list-table-wrapper">
              <table className="order-list-data-table">
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Customer</th>
                    <th>Credit Limit</th>
                    <th>Outstanding</th>
                    <th>Balance</th>
                    <th>Pending Days</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="order-list-no-data">{rows.length === 0 ? "No outstanding data" : ""}</td>
                    </tr>
                  ) : (
                    rows.map((r, idx) => (
 <tr 
    key={r._id} 
    className="clickable-row"  // ← Add this class for hover effect
    onClick={() => navigate(`/sales/outstanding/${r._id}`)}  // ← Add navigation
    style={{ cursor: 'pointer' }}
  >                        <td>{idx + 1}</td>
                        <td>{r.name}</td>
                        <td>{(r.creditLimit || 0).toFixed(2)}</td>
                        <td>{(r.usedCredit || (r.creditLimit - r.balanceCreditLimit) || 0).toFixed(2)}</td>
                        <td>{(r.balanceCreditLimit || 0).toFixed(2)}</td>
                        <td>{r.pendingBillDaysLeft ?? "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default OutstandingReport;
