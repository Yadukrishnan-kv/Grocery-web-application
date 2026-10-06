// src/components/common/ToggleSwitch.jsx
import React from "react";
import "./ToggleSwitch.css";

const ToggleSwitch = ({ checked, onChange, disabled, label }) => (
  <label
    className={`toggle-switch-wrapper ${disabled ? "toggle-switch-disabled" : ""}`}
  >
    <span className="toggle-switch">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={onChange}
        disabled={disabled}
        aria-label={label}
      />
      <span className="toggle-switch-slider" />
    </span>
    <span
      className={`toggle-switch-status-text ${checked ? "is-active" : "is-inactive"}`}
    >
      {checked ? "Active" : "Inactive"}
    </span>
  </label>
);

export default ToggleSwitch;
