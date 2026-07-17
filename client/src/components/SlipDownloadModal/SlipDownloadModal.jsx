import React from "react";
import "./SlipDownloadModal.css";

const SlipDownloadModal = ({ isOpen, onClose, onSelect }) => {
  if (!isOpen) return null;

  return (
    <div className="slip-type-overlay" onClick={onClose}>
      <div className="slip-type-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Select Slip Format</h3>
        <p>Choose the format for your packing slip download</p>
        <div className="slip-type-options">
          <button
            className="slip-type-btn thermal"
            onClick={() => onSelect("thermal")}
          >
            <span className="slip-type-icon">🖨️</span>
            <span className="slip-type-label">Thermal Slip</span>
            <span className="slip-type-desc">80mm thermal paper format for receipt printer</span>
          </button>
          <button
            className="slip-type-btn pdf"
            onClick={() => onSelect("pdf")}
          >
            <span className="slip-type-icon">📄</span>
            <span className="slip-type-label">PDF Slip</span>
            <span className="slip-type-desc">Standard A4 PDF format</span>
          </button>
        </div>
        <button className="slip-type-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
};

export default SlipDownloadModal;
