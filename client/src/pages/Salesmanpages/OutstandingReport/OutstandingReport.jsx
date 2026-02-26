import React, { useEffect, useState } from "react";
import axios from "axios";
import "./OutstandingReport.css";

const OutstandingReport = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchOutstanding = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem("token");
        const backendUrl = process.env.REACT_APP_BACKEND_IP || "";
        const url = backendUrl
          ? `${backendUrl}/api/customers/getallcustomerswithdue`
          : `/api/customers/getallcustomerswithdue`;
        const res = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setRows(res.data || []);
      } catch (err) {
        setError(err?.response?.data?.message || err.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    };
    fetchOutstanding();
  }, []);

  return (
    <div className="sales-page outstanding-report">
      <div className="page-header">
        <h1>Customers Outstanding Report</h1>
        <p className="sub">Used credit limits and outstanding balances of customers</p>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: 20 }}>Loading customers...</div>
        ) : error ? (
          <div style={{ padding: 20, color: "#c00" }}>{error}</div>
        ) : (
          <table className="outstanding-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Credit Limit</th>
                <th>Used</th>
                <th>Balance</th>
                <th>Pending Days</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty">
                    No outstanding data
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r._id}>
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
        )}
      </div>
    </div>
  );
};

export default OutstandingReport;
