// src/components/common/TableScrollSync.jsx
import React, { useEffect, useRef, useCallback } from "react";
import "./TableScrollSync.css";

/**
 * Wraps a horizontally-scrollable table container (the existing
 * `overflow-x: auto` wrapper div used across the app) and mirrors its
 * scroll position onto a thin, fixed-position scrollbar pinned to the
 * bottom of the viewport. This lets users reach the last columns of a
 * wide table without first scrolling down past every row.
 *
 * Only one mirrored scrollbar is shown at a time across the whole page
 * (whichever wrapped table currently occupies the most visible area),
 * so pages with multiple tables never show overlapping/duplicate bars.
 *
 * Usage: wrap the existing table wrapper div, unchanged, with this
 * component. No other markup, styling, or table structure changes.
 *
 *   <TableScrollSync>
 *     <div className="existing-table-wrapper">
 *       <table>...</table>
 *     </div>
 *   </TableScrollSync>
 */

let registry = [];
let rafId = null;

function ensureLoopRunning() {
  if (rafId !== null) return;

  const tick = () => {
    if (registry.length === 0) {
      rafId = null;
      return;
    }

    const viewportH = window.innerHeight || document.documentElement.clientHeight;
    let winner = null;
    let winnerVisible = 0;

    for (const inst of registry) {
      const area = inst.areaRef.current;
      const track = inst.trackRef.current;
      if (!area || !track) continue;

      const needsScroll = area.scrollWidth > area.clientWidth + 1;
      if (!needsScroll) {
        track.style.display = "none";
        continue;
      }

      const rect = area.getBoundingClientRect();
      const visibleTop = Math.max(rect.top, 0);
      const visibleBottom = Math.min(rect.bottom, viewportH);
      const visibleHeight = Math.max(0, visibleBottom - visibleTop);

      inst._rect = rect;
      inst._needsScroll = true;

      if (visibleHeight > 0 && visibleHeight > winnerVisible) {
        winner = inst;
        winnerVisible = visibleHeight;
      }
    }

    for (const inst of registry) {
      const area = inst.areaRef.current;
      const track = inst.trackRef.current;
      const thumb = inst.thumbRef.current;
      if (!area || !track || !thumb || !inst._needsScroll) continue;

      if (inst === winner) {
        track.style.display = "block";
        track.style.left = `${inst._rect.left}px`;
        track.style.width = `${inst._rect.width}px`;
        thumb.style.width = `${area.scrollWidth}px`;
      } else {
        track.style.display = "none";
      }
      inst._needsScroll = false;
    }

    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);
}

const TableScrollSync = ({ children }) => {
  const areaRef = useRef(null);
  const trackRef = useRef(null);
  const thumbRef = useRef(null);
  const syncingRef = useRef(false);

  const setAreaRef = useCallback((node) => {
    areaRef.current = node;
  }, []);

  useEffect(() => {
    const inst = { areaRef, trackRef, thumbRef };
    registry.push(inst);
    ensureLoopRunning();

    return () => {
      registry = registry.filter((i) => i !== inst);
    };
  }, []);

  useEffect(() => {
    const area = areaRef.current;
    const track = trackRef.current;
    if (!area || !track) return;

    const onAreaScroll = () => {
      if (syncingRef.current) {
        syncingRef.current = false;
        return;
      }
      syncingRef.current = true;
      track.scrollLeft = area.scrollLeft;
    };
    const onTrackScroll = () => {
      if (syncingRef.current) {
        syncingRef.current = false;
        return;
      }
      syncingRef.current = true;
      area.scrollLeft = track.scrollLeft;
    };

    area.addEventListener("scroll", onAreaScroll, { passive: true });
    track.addEventListener("scroll", onTrackScroll, { passive: true });
    return () => {
      area.removeEventListener("scroll", onAreaScroll);
      track.removeEventListener("scroll", onTrackScroll);
    };
  }, []);

  const child = React.Children.only(children);

  return (
    <>
      {React.cloneElement(child, { ref: setAreaRef })}
      <div className="table-scroll-sync-track" ref={trackRef} style={{ display: "none" }}>
        <div ref={thumbRef} className="table-scroll-sync-thumb" />
      </div>
    </>
  );
};

export default TableScrollSync;
