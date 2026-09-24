import * as XLSX from "xlsx";

/**
 * Export data to Excel file
 * @param {Array} data - Array of objects to export
 * @param {string} fileName - Name of the file (without extension)
 * @param {string} sheetName - Name of the worksheet
 * @param {Array} columns - Optional array of column definitions [{header, key, width}]
 */
export const exportToExcel = (data, fileName, sheetName = "Sheet1", columns = null) => {
  if (!data || data.length === 0) {
    return;
  }

  // If columns are defined, create a structured worksheet
  if (columns && columns.length > 0) {
    // Map data to match column structure
    const mappedData = data.map((row) => {
      const mappedRow = {};
      columns.forEach((col) => {
        mappedRow[col.header] = col.key ? row[col.key] : row[col.header];
      });
      return mappedRow;
    });

    const worksheet = XLSX.utils.json_to_sheet(mappedData);

    // Set column widths
    worksheet["!cols"] = columns.map((col) => ({
      wch: col.width || 15,
    }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    // Export as Excel file (.xlsx)
    XLSX.writeFile(workbook, `${fileName}.xlsx`);
  } else {
    // Simple export without column definitions
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    // Export as Excel file (.xlsx)
    XLSX.writeFile(workbook, `${fileName}.xlsx`);
  }
};

/**
 * Format date to DD/MM/YYYY
 */
export const formatDateForExcel = (dateString) => {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

/**
 * Format number with currency symbol
 */
export const formatCurrencyForExcel = (amount, symbol = "AED") => {
  return `${symbol} ${(amount || 0).toFixed(2)}`;
};
