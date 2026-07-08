import React from "react";
import "./InvoiceDownloadModal.css";

const InvoiceDownloadModal = ({ isOpen, onClose, onSelect }) => {
  if (!isOpen) return null;

  return (
    <div className="invoice-type-overlay" onClick={onClose}>
      <div className="invoice-type-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Select Invoice Type</h3>
        <p>Choose the format for your invoice download</p>
        <div className="invoice-type-options">
          <button
            className="invoice-type-btn normal"
            onClick={() => onSelect("normal")}
          >
            <span className="type-icon">📄</span>
            <span className="type-label">Normal Invoice</span>
            <span className="type-desc">Standard invoice with full header</span>
          </button>
          <button
            className="invoice-type-btn preprinted"
            onClick={() => onSelect("preprinted")}
          >
            <span className="type-icon">📋</span>
            <span className="type-label">Preprinted Invoice</span>
            <span className="type-desc">Blank header space for preprinted paper</span>
          </button>
        </div>
        <button className="invoice-type-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
};

export default InvoiceDownloadModal;
