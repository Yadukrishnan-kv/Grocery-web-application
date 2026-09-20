// Shared packing-slip PDF generators used by both the Pack Orders and
// Remaining Pack Orders pages, so the two stay in sync instead of drifting
// out of sync the way two hand-copied versions eventually do.
import jsPDF from "jspdf";
import toast from "./toast";

const formatDate = (dateString) => {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const openPrintDialog = (pdf) => {
  const blobUrl = pdf.output("bloburl");
  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  iframe.src = blobUrl;
  document.body.appendChild(iframe);
  iframe.onload = () => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
  };
};

// getQty defaults to the full ordered quantity (Pack Orders page); the
// Remaining Pack Orders page passes ordered - packed instead, and can also
// filter out items that have nothing left to pack.
const defaultGetQty = (item) => item.orderedQuantity || 0;

/**
 * 80mm thermal-paper packing slip (opens the browser print dialog).
 */
export const downloadThermalSlip = (order, { getQty = defaultGetQty, filterItem } = {}) => {
  if (!order) {
    toast.error("Order details not found");
    return;
  }
  try {
    // 80mm thermal paper - a generous safe margin keeps text away from the
    // printer's real (hardware-clipped) printable edge, which is narrower
    // than the paper width itself.
    const MM_TO_PT = 2.834645669;
    const PX_TO_PT = 0.75;
    const paperWidthMM = 80;
    const safeMarginMM = 7;
    const pageWidth = paperWidthMM * MM_TO_PT;
    const margin = safeMarginMM * MM_TO_PT;
    const contentWidth = pageWidth - margin * 2;
    const labelW = 75;
    const titleMarginTop = 15 * PX_TO_PT;
    const orderIdMarginTop = 10 * PX_TO_PT;
    const productsMarginTop = 10 * PX_TO_PT;

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: [pageWidth, 1200],
    });

    let y = margin + titleMarginTop;

    // Row height for a given font size, derived from jsPDF's own line-height
    // factor instead of a hardcoded pixel guess — so it always matches the
    // font actually in use and never runs two lines into each other no
    // matter how long the customer name/address turns out to be.
    const lineAdvance = (fontSize, extra = 2) => fontSize * pdf.getLineHeightFactor() + extra;

    const drawDashedLine = (yPos) => {
      pdf.setLineDashPattern([1, 1], 0);
      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(0.5);
      pdf.line(margin, yPos, pageWidth - margin, yPos);
      pdf.setLineDashPattern([], 0);
      return yPos + 8;
    };

    const printRow = (label, value) => {
      pdf.setFontSize(9).setFont(undefined, "bold");
      pdf.text(label, margin, y, { maxWidth: labelW });
      pdf.setFontSize(9).setFont(undefined, "normal");
      pdf.text(String(value), pageWidth - margin, y, { align: "right" });
      y += lineAdvance(9);
    };

    // ===== TITLE =====
    pdf.setFontSize(13).setFont(undefined, "bold");
    pdf.text("ORDER DETAILS", pageWidth / 2, y, { align: "center" });
    y += lineAdvance(13, 3);

    y = drawDashedLine(y) + orderIdMarginTop;

    // ===== ORDER INFO =====
    const displayedOrderId = order.orderId || order._id;
    printRow("Order ID:", displayedOrderId);

    // Customer name can be a long business name — if it doesn't fit next to
    // the label without overlapping, drop it to the line(s) below instead.
    const customerLabel = "Customer:";
    const customerName = order.customer?.name || "N/A";
    pdf.setFontSize(9).setFont(undefined, "bold");
    const customerLabelWidth = pdf.getTextWidth(customerLabel);
    pdf.text(customerLabel, margin, y, { maxWidth: labelW });
    pdf.setFontSize(9).setFont(undefined, "normal");
    const customerAvailableWidth = contentWidth - customerLabelWidth - 6;
    if (pdf.getTextWidth(customerName) <= customerAvailableWidth) {
      pdf.text(customerName, pageWidth - margin, y, { align: "right" });
      y += lineAdvance(9);
    } else {
      // Once it wraps, this is a paragraph, not a single-line label/value
      // row anymore — right-aligning each line individually made short
      // trailing lines (e.g. "ANZ") float off to the right, disconnected
      // from the rest of the name above it. Left-align the whole block
      // instead so every line starts from the same left edge.
      y += lineAdvance(9);
      const customerNameLines = pdf.splitTextToSize(customerName, contentWidth);
      customerNameLines.forEach((line) => {
        pdf.text(line, margin, y);
        y += lineAdvance(9);
      });
    }

    if (order.customer?.address) {
      pdf.setFontSize(8).setFont(undefined, "normal");
      const addressLines = pdf.splitTextToSize(order.customer.address, contentWidth);
      addressLines.forEach((line) => {
        pdf.text(line, margin, y);
        y += lineAdvance(8);
      });
    }
    if (order.customer?.pincode) {
      pdf.setFontSize(9).setFont(undefined, "normal");
      pdf.text(String(order.customer.pincode), margin, y);
      y += lineAdvance(9);
    }
    printRow("Order Date:", formatDate(order.orderDate));

    y = drawDashedLine(y + 2) + productsMarginTop;

    // ===== PRODUCTS =====
    pdf.setFontSize(10).setFont(undefined, "bold");
    pdf.text("PRODUCTS", margin, y);
    y += lineAdvance(10, 5);

    const items = (order.orderItems || []).filter((item) => !filterItem || filterItem(item));

    items.forEach((item) => {
      const productName = item.product?.productName || "Unknown";
      const qty = getQty(item);
      const unit = item.unit || "";
      const qtyText = `Qty: ${qty}${unit ? ` ${unit}` : ""}`;

      pdf.setFontSize(13).setFont(undefined, "normal");
      // Reserve exactly as much width as this row's qty text actually
      // needs (not a fixed guess) — a large quantity or long unit name
      // (e.g. "Qty: 1000 bundle") would otherwise run into the product
      // name wrapped on the same line.
      const qtyTextWidth = pdf.getTextWidth(qtyText);
      const nameLines = pdf.splitTextToSize(`• ${productName}`, contentWidth - qtyTextWidth - 10);

      nameLines.forEach((line, idx) => {
        pdf.setFont(undefined, "normal");
        pdf.text(line, margin, y);
        if (idx === 0) {
          pdf.setFont(undefined, "normal");
          pdf.text(qtyText, pageWidth - margin, y, { align: "right" });
        }
        y += lineAdvance(13);
      });
      y += 8;
    });

    y = drawDashedLine(y);

    openPrintDialog(pdf);
    toast.success("Opening print dialog for thermal slip");
  } catch (err) {
    console.error("Thermal PDF error:", err);
    toast.error("Failed to generate thermal slip");
  }
};

/**
 * Standard A4 packing slip (table layout, opens the browser print dialog).
 */
export const downloadPDFSlip = (order, { getQty = defaultGetQty, filterItem } = {}) => {
  if (!order) {
    toast.error("Order details not found");
    return;
  }
  try {
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = 210;
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;
    let y = margin + 10;

    // ── Header Section with background ──
    pdf.setFillColor(41, 128, 185);
    pdf.rect(margin, y, contentWidth, 12, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(14).setFont(undefined, "bold");
    pdf.text("PACKING SLIP", margin + 5, y + 8);
    y += 18;
    pdf.setTextColor(0, 0, 0);

    // ── Order Info Box ──
    pdf.setFontSize(10).setFont(undefined, "normal");

    const displayedOrderId = order.orderId || order._id;
    const orderDate = formatDate(order.orderDate);
    const customerName = order.customer?.name || "N/A";
    const customerAddress = order.customer?.address || "";
    // Both name and address wrap within the info box — a long business
    // name would otherwise run past the box (or off the page) since only
    // the address used to be measured for wrapping.
    const nameLines = pdf.splitTextToSize(customerName, contentWidth - 40);
    const addressLines = customerAddress
      ? pdf.splitTextToSize(customerAddress, contentWidth - 40)
      : [];

    const lineH = 8;
    const numRows = 2 + nameLines.length + addressLines.length; // Order ID, [name...], [address...], Order Date
    const boxHeight = 12 + lineH * (numRows - 1);

    pdf.setFillColor(248, 249, 250);
    pdf.roundedRect(margin, y, contentWidth, boxHeight, 3, 3, "F");

    let infoY = y + 6;
    pdf.setFont(undefined, "bold");
    pdf.text("Order ID:", margin + 5, infoY);
    pdf.setFont(undefined, "normal");
    pdf.text(String(displayedOrderId), margin + 35, infoY);
    infoY += lineH;

    pdf.setFont(undefined, "bold");
    pdf.text("Customer:", margin + 5, infoY);
    pdf.setFont(undefined, "normal");
    nameLines.forEach((line, idx) => {
      pdf.text(line, margin + 35, infoY);
      if (idx < nameLines.length - 1) infoY += lineH;
    });
    infoY += lineH;

    addressLines.forEach((line) => {
      pdf.setFont(undefined, "normal");
      pdf.text(line, margin + 35, infoY);
      infoY += lineH;
    });

    pdf.setFont(undefined, "bold");
    pdf.text("Order Date:", margin + 5, infoY);
    pdf.setFont(undefined, "normal");
    pdf.text(orderDate, margin + 35, infoY);

    y += boxHeight + 8;

    // ── Table ──
    const colProduct = margin + 5;
    const colQty = margin + 160;
    const colWProduct = colQty - colProduct - 5;
    const headerH = 8;

    const drawTableHeader = () => {
      pdf.setFillColor(41, 128, 185);
      pdf.rect(margin, y, contentWidth, headerH, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(10).setFont(undefined, "bold");
      pdf.text("Product", colProduct, y + 5.5);
      pdf.text("Qty", colQty, y + 5.5);
      y += headerH;
      pdf.setTextColor(0, 0, 0);
      pdf.setFontSize(9).setFont(undefined, "normal");
    };

    drawTableHeader();

    const items = (order.orderItems || []).filter((item) => !filterItem || filterItem(item));

    let rowIndex = 0;
    items.forEach((item) => {
      const productName = item.product?.productName || "Unknown";
      const qty = getQty(item);

      const lines = pdf.splitTextToSize(productName, colWProduct);
      const rowH = Math.max(lines.length * 5 + 2, 8);

      if (y + rowH > 285) {
        pdf.addPage();
        y = margin + 10;
        drawTableHeader();
      }

      // Row background alternation
      if (rowIndex % 2 === 0) {
        pdf.setFillColor(242, 244, 246);
        pdf.rect(margin, y, contentWidth, rowH, "F");
      }

      pdf.text(lines, colProduct, y + 4);
      pdf.text(String(qty), colQty, y + 4);
      y += rowH + 1;
      rowIndex++;
    });

    // Bottom line
    pdf.setDrawColor(41, 128, 185);
    pdf.line(margin, y, margin + contentWidth, y);

    openPrintDialog(pdf);
    toast.success("Opening print dialog for PDF slip");
  } catch (err) {
    console.error("PDF slip error:", err);
    toast.error("Failed to generate PDF slip");
  }
};
