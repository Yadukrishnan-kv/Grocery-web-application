// src/hooks/usePagination.js
import { useState, useEffect, useMemo } from "react";

/**
 * Generic pagination state. Works for both client-side array pagination
 * and server-side page/limit fetching.
 *
 * @param {number} totalItems - total record count (full array length, or server totalRecords)
 * @param {number} pageSize - entries per page (usually from AppSettingsContext)
 * @param {*} resetKey - when this value changes, page resets to 1 (pass filter/search/sort state)
 */
export function usePagination(totalItems, pageSize, resetKey) {
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil((totalItems || 0) / (pageSize || 1)));

  // Reset to page 1 whenever filters/search/sort (resetKey) or pageSize change
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, pageSize]);

  // Clamp page if data shrank below current page
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const startIndex = (page - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems || 0);

  const canPrev = page > 1;
  const canNext = page < totalPages;

  const goPrev = () => setPage((p) => Math.max(1, p - 1));
  const goNext = () => setPage((p) => Math.min(totalPages, p + 1));

  return {
    page,
    setPage,
    totalPages,
    startIndex,
    endIndex,
    showingFrom: totalItems === 0 ? 0 : startIndex + 1,
    showingTo: endIndex,
    canPrev,
    canNext,
    goPrev,
    goNext,
  };
}

/**
 * Convenience wrapper: paginates an already-filtered client-side array.
 * Use for pages that fetch the full list and filter/sort in the browser.
 */
export function usePaginatedData(data, pageSize, resetKey) {
  const pagination = usePagination((data || []).length, pageSize, resetKey);

  const pageData = useMemo(
    () => (data || []).slice(pagination.startIndex, pagination.endIndex),
    [data, pagination.startIndex, pagination.endIndex]
  );

  return { ...pagination, pageData, totalRecords: (data || []).length };
}
