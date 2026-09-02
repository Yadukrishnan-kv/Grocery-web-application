// src/components/common/Pagination.jsx
import React from "react";
import "./Pagination.css";

/**
 * Reusable Previous/Next pagination bar.
 * Works with both usePaginatedData (client) and manual server-pagination state.
 */
const Pagination = ({
  page,
  totalPages,
  totalRecords,
  showingFrom,
  showingTo,
  canPrev,
  canNext,
  onPrev,
  onNext,
}) => {
  if (!totalRecords) return null;

  return (
    <div className="pagination-bar">
      <span className="pagination-summary">
        Showing {showingFrom}-{showingTo} of {totalRecords}
      </span>
      <div className="pagination-controls">
        <button
          type="button"
          className="pagination-btn"
          onClick={onPrev}
          disabled={!canPrev}
        >
          Previous
        </button>
        <span className="pagination-indicator">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          className="pagination-btn"
          onClick={onNext}
          disabled={!canNext}
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default Pagination;
