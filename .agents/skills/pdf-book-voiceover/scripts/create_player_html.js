const fs = require('fs');
const path = require('path');

function createPlayerHtml({ title, pdfFilename, audioFilename, markers, base64Filename, base64VarName }) {
  const markersJson = JSON.stringify(markers, null, 2);
  const firstPage = markers[0] ? markers[0].page : 1;
  const scriptTag = base64Filename
    ? `  <script src="${base64Filename}"></script>`
    : (pdfFilename && pdfFilename.toLowerCase().includes('eloquent')
      ? `  <script src="eloquent_javascript_pdf_data.js"></script>`
      : (fs.existsSync('ai_agents_in_action_pdf_data.js') && pdfFilename && pdfFilename.toLowerCase().includes('agent')
        ? `  <script src="ai_agents_in_action_pdf_data.js"></script>`
        : ''));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${title} - Immersive Dual-Pane Voiceover Player</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
${scriptTag ? scriptTag + '\n' : ''}  <style>
    :root {
      --bg-dark: #090d16;
      --bg-surface: rgba(17, 24, 39, 0.90);
      --bg-surface-hover: rgba(31, 41, 55, 0.96);
      --border-glass: rgba(255, 255, 255, 0.12);
      --brand: #38bdf8;
      --brand-hover: #0ea5e9;
      --brand-glow: rgba(56, 189, 248, 0.35);
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --active-page-ring: #38bdf8;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    html, body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: var(--bg-dark);
      color: var(--text-main);
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
      touch-action: none;
    }

    /* Invisible hover sensor at the very top of the window to awaken title bar */
    #top-hover-sensor {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 24px;
      z-index: 55;
    }

    /* Fullscreen Viewport & Pannable Canvas Container */
    #viewport-container {
      position: absolute;
      top: 0; left: 0; width: 100vw; height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: radial-gradient(circle at center, #151d33 0%, #060911 100%);
      cursor: default;
      touch-action: none;
    }

    #viewport-container.panning-active {
      cursor: grabbing !important;
    }

    #viewport-container.can-pan {
      cursor: grab;
    }

    /* Spread Wrapper transformed via panX / panY */
    .spread-wrapper {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      position: relative;
      transform-origin: center center;
      will-change: transform;
      pointer-events: none;
    }

    .page-box {
      position: relative;
      background: #ffffff;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.7), 0 4px 12px rgba(0, 0, 0, 0.5);
      border-radius: 4px;
      transition: border-color 0.25s ease, box-shadow 0.25s ease;
      border: 3px solid transparent;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: auto;
    }

    .page-box.active-reading {
      border-color: var(--active-page-ring);
      box-shadow: 0 0 35px var(--brand-glow), 0 20px 45px rgba(0, 0, 0, 0.75);
    }

    .page-box canvas {
      display: block;
      border-radius: 2px;
      pointer-events: none;
    }

    .page-tag {
      position: absolute;
      bottom: 12px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(15, 23, 42, 0.88);
      color: #e2e8f0;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.74rem;
      font-weight: 600;
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.15);
      pointer-events: none;
      opacity: 0.85;
      transition: all 0.2s;
    }

    .page-box.active-reading .page-tag {
      background: var(--brand);
      color: #0b0f19;
      opacity: 1;
      box-shadow: 0 0 12px var(--brand-glow);
    }

    /* Floating Header Overlay (Mini-sizes on inactivity, stays on screen) */
    .floating-header {
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      width: calc(100% - 40px);
      max-width: 1040px;
      height: 52px;
      background: var(--bg-surface);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--border-glass);
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 18px;
      z-index: 50;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
      transition: width 0.32s cubic-bezier(0.16, 1, 0.3, 1),
                  max-width 0.32s cubic-bezier(0.16, 1, 0.3, 1),
                  height 0.32s cubic-bezier(0.16, 1, 0.3, 1),
                  padding 0.32s cubic-bezier(0.16, 1, 0.3, 1),
                  top 0.32s cubic-bezier(0.16, 1, 0.3, 1),
                  border-radius 0.32s cubic-bezier(0.16, 1, 0.3, 1),
                  background 0.32s cubic-bezier(0.16, 1, 0.3, 1),
                  border-color 0.32s cubic-bezier(0.16, 1, 0.3, 1),
                  box-shadow 0.32s cubic-bezier(0.16, 1, 0.3, 1);
      touch-action: manipulation;
    }

    /* Mini Sized Mode (Replaces full header bar with compact pill UI instead of hiding) */
    .floating-header.mini-mode {
      height: 36px;
      max-width: 380px;
      width: clamp(220px, 42vw, 380px);
      padding: 0 12px;
      top: 12px;
      border-radius: 18px;
      background: rgba(13, 19, 33, 0.90);
      border-color: rgba(56, 189, 248, 0.35);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55), 0 0 12px rgba(56, 189, 248, 0.18);
      cursor: pointer;
    }

    .floating-header.mini-mode .tool-btn,
    .floating-header.mini-mode .header-right {
      display: none !important;
    }

    .floating-header.mini-mode .header-left h1 {
      display: none !important;
    }

    .floating-header.mini-mode .page-badge {
      font-size: 0.74rem;
      padding: 3px 8px;
    }

    .floating-header.mini-mode .expand-header-btn {
      padding: 0 6px;
      font-size: 0.75rem;
      height: 24px;
      min-width: 24px;
      border-radius: 6px;
    }

    /* Floating Side Navigation Arrows for Page Turning */
    .side-nav-arrow {
      position: fixed;
      top: 50%;
      transform: translateY(-50%);
      width: 44px;
      height: 64px;
      background: rgba(17, 24, 39, 0.55);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid var(--border-glass);
      color: var(--text-main);
      font-size: 2rem;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 45;
      transition: all 0.2s ease;
      user-select: none;
      -webkit-user-select: none;
      opacity: 0.65;
      touch-action: manipulation;
    }

    .side-nav-arrow:hover {
      background: rgba(31, 41, 55, 0.92);
      border-color: var(--brand);
      color: var(--brand);
      opacity: 1;
      transform: translateY(-50%) scale(1.06);
      box-shadow: 0 0 20px var(--brand-glow);
    }

    .side-prev {
      left: 14px;
      border-radius: 12px;
    }

    .side-next {
      right: 14px;
      border-radius: 12px;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
      margin-right: auto;
    }

    .header-left h1 {
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--brand);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 38vw;
    }

    .page-badge {
      background: rgba(56, 189, 248, 0.15);
      color: var(--brand);
      padding: 4px 10px;
      border-radius: 8px;
      font-size: 0.78rem;
      font-weight: 600;
      letter-spacing: 0.3px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
      flex-shrink: 0;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .icon-btn {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid transparent;
      color: var(--text-main);
      cursor: pointer;
      font-size: 0.85rem;
      font-weight: 500;
      padding: 6px 12px;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 0.2s ease;
      touch-action: manipulation;
    }

    .icon-btn:hover {
      background: rgba(255, 255, 255, 0.15);
      border-color: var(--border-glass);
      color: var(--brand);
    }

    .icon-btn.active {
      background: var(--brand);
      color: #090d16;
      font-weight: 600;
    }

    /* Header toolbar buttons: one fixed height so emoji and text buttons line up */
    .floating-header {
      --hdr-btn-h: 34px;
      gap: 8px;
    }

    .floating-header .icon-btn {
      height: var(--hdr-btn-h);
      min-width: var(--hdr-btn-h);
      padding: 0 10px;
      font-size: 0.82rem;
      line-height: 1;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .floating-header .btn-icon {
      font-size: 0.95rem;
      line-height: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.1em;
    }

    .zoom-ctrls {
      display: inline-flex;
      align-items: center;
      height: var(--hdr-btn-h);
      padding: 0 2px;
      gap: 2px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--border-glass);
      border-radius: 9px;
      flex-shrink: 0;
    }

    .floating-header .zoom-ctrls .icon-btn {
      height: calc(var(--hdr-btn-h) - 6px);
      min-width: calc(var(--hdr-btn-h) - 6px);
      padding: 0 8px;
      background: transparent;
      border-radius: 7px;
    }

    .floating-header .zoom-ctrls .icon-btn:hover {
      background: rgba(255, 255, 255, 0.12);
    }

    #zoom-label {
      font-size: 0.78rem;
      min-width: 42px;
      text-align: center;
      color: var(--text-muted);
      font-variant-numeric: tabular-nums;
    }

    .header-sep {
      width: 1px;
      height: 20px;
      background: var(--border-glass);
      flex-shrink: 0;
    }

    .expand-header-btn {
      flex-shrink: 0;
    }

    /* Floating Audio Player Control Island */
    .floating-player {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      width: calc(100% - 40px);
      max-width: 880px;
      height: 68px;
      background: var(--bg-surface);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--border-glass);
      border-radius: 20px;
      display: flex;
      align-items: center;
      padding: 0 20px;
      gap: 16px;
      z-index: 50;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.65);
      transition: width 0.32s cubic-bezier(0.16, 1, 0.3, 1),
                  max-width 0.32s cubic-bezier(0.16, 1, 0.3, 1),
                  height 0.32s cubic-bezier(0.16, 1, 0.3, 1),
                  padding 0.32s cubic-bezier(0.16, 1, 0.3, 1),
                  gap 0.32s cubic-bezier(0.16, 1, 0.3, 1),
                  bottom 0.32s cubic-bezier(0.16, 1, 0.3, 1),
                  border-radius 0.32s cubic-bezier(0.16, 1, 0.3, 1),
                  background 0.32s cubic-bezier(0.16, 1, 0.3, 1),
                  border-color 0.32s cubic-bezier(0.16, 1, 0.3, 1),
                  box-shadow 0.32s cubic-bezier(0.16, 1, 0.3, 1);
      touch-action: manipulation;
    }

    /* Mini Sized Mode (Replaces full player with compact UI instead of hiding) */
    .floating-player.mini-mode {
      height: 38px;
      max-width: 450px;
      width: clamp(280px, 48vw, 450px);
      padding: 0 12px;
      gap: 10px;
      bottom: 14px;
      border-radius: 19px;
      background: rgba(13, 19, 33, 0.90);
      border-color: rgba(56, 189, 248, 0.35);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55), 0 0 12px rgba(56, 189, 248, 0.18);
      cursor: pointer;
    }

    .floating-player.mini-mode .nav-btn,
    .floating-player.mini-mode .speed-ctrls {
      display: none !important;
    }

    .floating-player.mini-mode .play-trigger {
      width: 26px;
      height: 26px;
      font-size: 0.82rem;
      flex-shrink: 0;
    }

    .floating-player.mini-mode .timeline-block {
      gap: 3px;
    }

    .floating-player.mini-mode .timeline-meta {
      font-size: 0.72rem;
      line-height: 1.1;
    }

    .floating-player.mini-mode .meta-reading {
      max-width: 140px;
      font-size: 0.72rem;
    }

    .floating-player.mini-mode #time-readout {
      font-size: 0.72rem;
    }

    .floating-player.mini-mode .progress-track {
      height: 5px;
      border-radius: 3px;
    }

    .floating-player.mini-mode .progress-fill {
      border-radius: 3px;
    }

    .floating-player.mini-mode .expand-btn {
      padding: 2px 6px;
      font-size: 0.75rem;
      height: 24px;
      min-width: 24px;
      border-radius: 6px;
    }

    .play-trigger {
      width: 42px;
      height: 42px;
      border-radius: 50%;
      background: var(--brand);
      border: none;
      color: #0b0f19;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 1.15rem;
      transition: transform 0.15s, background 0.2s, box-shadow 0.2s;
      flex-shrink: 0;
      touch-action: manipulation;
    }

    .play-trigger:hover {
      background: var(--brand-hover);
      transform: scale(1.08);
      box-shadow: 0 0 16px var(--brand-glow);
    }

    .timeline-block {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }

    .timeline-meta {
      display: flex;
      justify-content: space-between;
      font-size: 0.78rem;
      color: var(--text-muted);
    }

    .meta-reading {
      color: var(--brand);
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 65%;
    }

    .progress-track {
      position: relative;
      height: 8px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      cursor: pointer;
      overflow: hidden;
      touch-action: manipulation;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #0ea5e9, #38bdf8);
      width: 0%;
      border-radius: 6px;
      transition: width 0.1s linear;
    }

    .player-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    /* Playback speed − / + stepper (same look as the header zoom group) */
    .speed-ctrls {
      --spd-h: 34px;
      display: inline-flex;
      align-items: center;
      height: var(--spd-h);
      padding: 0 2px;
      gap: 2px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--border-glass);
      border-radius: 9px;
      flex-shrink: 0;
    }

    .speed-ctrls .icon-btn {
      height: calc(var(--spd-h) - 6px);
      min-width: calc(var(--spd-h) - 6px);
      padding: 0 8px;
      background: transparent;
      border-radius: 7px;
      font-size: 0.95rem;
      line-height: 1;
    }

    .speed-ctrls .icon-btn:hover {
      background: rgba(255, 255, 255, 0.12);
    }

    .speed-ctrls .icon-btn:disabled {
      opacity: 0.35;
      cursor: default;
      background: transparent;
      color: var(--text-main);
    }

    #speed-label {
      font-size: 0.78rem;
      font-weight: 600;
      min-width: 42px;
      text-align: center;
      color: var(--text-main);
      font-variant-numeric: tabular-nums;
      cursor: pointer;
    }

    /* Collapsible Markers Drawer (Hidden by default) */
    .drawer-backdrop {
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0, 0, 0, 0.55);
      backdrop-filter: blur(4px);
      z-index: 70;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s ease;
    }

    .drawer-backdrop.open {
      opacity: 1;
      pointer-events: auto;
    }

    .markers-drawer {
      position: fixed;
      top: 0; right: 0; bottom: 0;
      width: 380px;
      max-width: 90vw;
      background: rgba(17, 24, 39, 0.96);
      backdrop-filter: blur(20px);
      border-left: 1px solid var(--border-glass);
      box-shadow: -10px 0 35px rgba(0, 0, 0, 0.6);
      display: flex;
      flex-direction: column;
      z-index: 80;
      transform: translateX(100%);
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      touch-action: pan-y;
    }

    .markers-drawer.open {
      transform: translateX(0);
    }

    .drawer-header {
      padding: 18px 20px;
      border-bottom: 1px solid var(--border-glass);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .drawer-header h2 {
      font-size: 1rem;
      color: var(--brand);
      font-weight: 600;
    }

    .drawer-content {
      flex: 1;
      overflow-y: auto;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      touch-action: pan-y;
    }

    .marker-item {
      padding: 12px 14px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid transparent;
      border-radius: 10px;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: all 0.2s;
    }

    .marker-item:hover {
      background: rgba(255, 255, 255, 0.09);
      border-color: rgba(255, 255, 255, 0.15);
    }

    .marker-item.active {
      background: rgba(56, 189, 248, 0.18);
      border-color: var(--brand);
    }

    .m-title {
      font-size: 0.88rem;
      font-weight: 600;
    }

    .m-time {
      font-size: 0.74rem;
      color: var(--text-muted);
      margin-top: 2px;
    }

    .marker-item.active .m-title {
      color: var(--brand);
    }

    /* Resume Progress Toast */
    .resume-toast {
      position: fixed;
      bottom: 86px;
      left: 50%;
      transform: translateX(-50%) translateY(20px);
      background: rgba(15, 23, 42, 0.95);
      border: 1px solid rgba(56, 189, 248, 0.4);
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 0 18px rgba(56, 189, 248, 0.25);
      border-radius: 9999px;
      padding: 8px 18px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 0.85rem;
      color: var(--text-main);
      z-index: 75;
      opacity: 0;
      pointer-events: none;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      backdrop-filter: blur(12px);
    }

    .resume-toast.show {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
      pointer-events: auto;
    }

    .toast-btn {
      background: rgba(56, 189, 248, 0.15);
      border: 1px solid var(--brand);
      color: var(--brand);
      border-radius: 9999px;
      padding: 3px 12px;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .toast-btn:hover {
      background: var(--brand);
      color: #090d16;
    }

    .toast-close {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 0.9rem;
      padding: 2px 6px;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
    }

    .toast-close:hover {
      color: var(--text-main);
      background: rgba(255, 255, 255, 0.1);
    }

    /* Fallback PDF file load overlay */
    .load-dialog {
      position: absolute;
      top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(9, 13, 22, 0.96);
      z-index: 100;
      display: none;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 24px;
    }

    .dialog-card {
      background: #1e293b;
      border: 2px dashed var(--brand);
      padding: 36px 40px;
      border-radius: 16px;
      max-width: 520px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
    }

    .dialog-card h3 {
      color: var(--brand);
      margin-bottom: 12px;
      font-size: 1.25rem;
    }

    .dialog-card p {
      color: var(--text-muted);
      font-size: 0.9rem;
      line-height: 1.5;
      margin-bottom: 24px;
    }

    .btn-primary {
      background: var(--brand);
      color: #090d16;
      border: none;
      padding: 10px 22px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }

    .btn-primary:hover {
      background: var(--brand-hover);
    }

    /* ==========================================
       RESPONSIVE & MOBILE / ORIENTATION ADAPTATIONS
       ========================================== */

    /* Icon-only header buttons below 900px: every tool stays visible, just without text labels */
    @media (max-width: 900px) {
      .floating-header .btn-label,
      .header-sep,
      .zoom-ctrls #zoom-label {
        display: none;
      }
      .floating-header .icon-btn {
        padding: 0;
        width: var(--hdr-btn-h);
      }
      .floating-header .zoom-ctrls .icon-btn {
        width: calc(var(--hdr-btn-h) - 6px);
      }
      .floating-header.mini-mode .expand-header-btn {
        width: 24px;
      }
    }

    /* Tablet & Medium Screens (<= 768px) */
    @media (max-width: 768px) {
      .floating-header {
        height: 48px;
        width: calc(100% - 20px);
        top: 10px;
        padding: 0 12px;
        gap: 8px;
      }

      .header-left h1 {
        display: none; /* Hide chapter title on mobile to make room for badges & controls */
      }

      .page-badge {
        font-size: 0.72rem;
        padding: 3px 8px;
        max-width: 140px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .icon-btn {
        padding: 5px 8px;
        font-size: 0.78rem;
        gap: 4px;
      }

      .floating-header {
        --hdr-btn-h: 32px;
        gap: 6px;
      }

      .floating-player {
        height: 60px;
        width: calc(100% - 20px);
        bottom: 12px;
        padding: 0 12px;
        gap: 10px;
        border-radius: 16px;
      }

      .floating-player .play-trigger {
        width: 38px;
        height: 38px;
        font-size: 1.05rem;
      }

      .floating-player .nav-btn {
        padding: 4px 6px;
        font-size: 0.8rem;
      }

      /* Hide +/- 5s skip buttons on smaller screens to keep timeline spacious */
      #back-5-btn,
      #fwd-5-btn {
        display: none !important;
      }

      .floating-player .speed-ctrls {
        --spd-h: 30px;
      }
      .floating-player .speed-ctrls .icon-btn {
        padding: 0;
        width: calc(var(--spd-h) - 6px);
      }
      #speed-label {
        min-width: 36px;
        font-size: 0.72rem;
      }

      .timeline-meta {
        font-size: 0.72rem;
      }

      .meta-reading {
        max-width: 120px;
      }

      #time-readout {
        font-size: 0.72rem;
      }

      .floating-player.mini-mode {
        height: 36px;
        max-width: 90vw;
        width: clamp(240px, 80vw, 360px);
        padding: 0 10px;
        bottom: 10px;
      }

      .side-nav-arrow {
        width: 32px;
        height: 48px;
        font-size: 1.4rem;
        opacity: 0.45;
      }
      .side-prev {
        left: 4px;
        border-radius: 8px;
      }
      .side-next {
        right: 4px;
        border-radius: 8px;
      }

      .resume-toast {
        bottom: 76px;
        max-width: 92vw;
        font-size: 0.78rem;
        padding: 6px 12px;
        gap: 8px;
      }
      .toast-btn {
        padding: 2px 8px;
        font-size: 0.72rem;
      }

      .markers-drawer {
        width: 86vw;
      }
    }

    /* Phones (<= 600px): two-row header — badge + minimize on top, full toolbar spread below */
    @media (max-width: 600px) {
      .floating-header {
        --hdr-btn-h: 34px;
        height: auto;
        width: calc(100% - 14px);
        top: 6px;
        padding: 6px 8px;
        gap: 6px;
        flex-wrap: wrap;
      }
      .floating-header .header-left { order: 0; flex: 1 1 auto; }
      .floating-header .expand-header-btn { order: 1; }
      .floating-header .header-right {
        order: 2;
        flex: 1 1 100%;
        justify-content: space-between;
      }

      .floating-header.mini-mode {
        height: 36px;
        padding: 0 10px;
        flex-wrap: nowrap;
      }

      .page-badge {
        font-size: 0.72rem;
        padding: 3px 8px;
        max-width: none;
      }
    }

    /* Small Mobile Screens (<= 480px) */
    @media (max-width: 480px) {
      .icon-btn {
        padding: 4px 6px;
        font-size: 0.72rem;
      }

      .floating-player {
        height: 54px;
        width: calc(100% - 14px);
        bottom: 8px;
        padding: 0 10px;
        gap: 8px;
      }

      .floating-player .play-trigger {
        width: 34px;
        height: 34px;
        font-size: 0.95rem;
      }

      .floating-player #prev-page-btn,
      .floating-player #next-page-btn {
        display: none !important;
      }

      .meta-reading {
        display: none;
      }

      .side-nav-arrow {
        width: 26px;
        height: 38px;
        font-size: 1.1rem;
        opacity: 0.35;
      }
    }

    /* Portrait orientation */
    @media (orientation: portrait) {
      .spread-wrapper {
        gap: 8px;
      }
      .floating-header {
        max-width: 96vw;
      }
      .floating-player {
        max-width: 96vw;
      }
    }

    /* Landscape with restricted height (mobile phones held sideways) */
    @media (orientation: landscape) and (max-height: 520px) {
      .floating-header {
        --hdr-btn-h: 30px;
        height: 40px;
        top: 4px;
      }
      .header-left h1 {
        display: none;
      }
      .floating-player {
        height: 48px;
        bottom: 4px;
      }
      .floating-player .play-trigger {
        width: 32px;
        height: 32px;
        font-size: 0.9rem;
      }
      .side-nav-arrow {
        height: 42px;
        width: 30px;
        font-size: 1.2rem;
      }
    }
  </style>
</head>
<body>

  <!-- Top Hover Sensor to awaken title bar on mouse approach -->
  <div id="top-hover-sensor"></div>

  <!-- Fullscreen Touch-Responsive PDF Viewport -->
  <div id="viewport-container">
    <div class="spread-wrapper" id="spread-wrapper">
      <div class="page-box" id="page-box-left">
        <canvas id="canvas-left"></canvas>
        <span class="page-tag" id="tag-left">Page</span>
      </div>
      <div class="page-box" id="page-box-right">
        <canvas id="canvas-right"></canvas>
        <span class="page-tag" id="tag-right">Page</span>
      </div>
    </div>
  </div>

  <!-- Floating Side Navigation Arrows for Easy Page Turning -->
  <button class="side-nav-arrow side-prev" id="side-prev-arrow" title="Previous Page ([ or PageUp)">‹</button>
  <button class="side-nav-arrow side-next" id="side-next-arrow" title="Next Page (] or PageDown)">›</button>

  <!-- Floating Title Bar (Mini-sizes on inactivity, stays on screen) -->
  <header class="floating-header" id="floating-header">
    <div class="header-left">
      <h1 id="header-title">${title}</h1>
      <span class="page-badge" id="current-badge">Loading...</span>
    </div>
    <div class="header-right">
      <button class="icon-btn tool-btn" id="toggle-view-btn" title="Toggle Dual / Single Page Spread"><span class="btn-icon">📖</span><span class="btn-label">Dual Page</span></button>
      <div class="zoom-ctrls" id="zoom-ctrls">
        <button class="icon-btn tool-btn" id="zoom-out-btn" title="Zoom Out (−)"><span class="btn-icon">−</span></button>
        <span id="zoom-label" class="tool-btn">100%</span>
        <button class="icon-btn tool-btn" id="zoom-in-btn" title="Zoom In (+)"><span class="btn-icon">+</span></button>
        <button class="icon-btn tool-btn" id="reset-view-btn" title="Reset Zoom & Pan (Double-tap/click background)"><span class="btn-icon">⟲</span><span class="btn-label">Reset</span></button>
      </div>
      <span class="header-sep"></span>
      <button class="icon-btn tool-btn" id="toggle-markers-btn" title="Toggle Page Markers List (M)"><span class="btn-icon">📑</span><span class="btn-label">Markers</span></button>
      <button class="icon-btn tool-btn" id="fullscreen-btn" title="Toggle Fullscreen (F)"><span class="btn-icon">⛶</span></button>
      <button class="icon-btn tool-btn" id="change-pdf-btn" title="Open a different PDF file"><span class="btn-icon">📂</span><span class="btn-label">Change PDF</span></button>
      <input type="file" id="pdf-file-input" accept="application/pdf" style="display: none;">
    </div>
    <button class="icon-btn expand-header-btn" id="expand-header-btn" title="Minimize Title Bar">▲</button>
  </header>

  <!-- Floating Audio Player Island (Mini-sizes on inactivity, stays on screen) -->
  <div class="floating-player" id="floating-player">
    <audio id="audio" src="${audioFilename}" preload="auto"></audio>

    <div class="player-actions">
      <button class="icon-btn nav-btn" id="prev-page-btn" title="Previous Page ([)">⏮</button>
      <button class="icon-btn nav-btn" id="back-5-btn" title="Back 5s (←)">↺ 5s</button>
      <button class="play-trigger" id="play-trigger" title="Play / Pause (Space)">▶</button>
      <button class="icon-btn nav-btn" id="fwd-5-btn" title="Forward 5s (→)">5s ↻</button>
      <button class="icon-btn nav-btn" id="next-page-btn" title="Next Page (])">⏭</button>
    </div>

    <div class="timeline-block" id="timeline-block">
      <div class="timeline-meta">
        <span class="meta-reading" id="meta-reading">Initializing audio...</span>
        <span id="time-readout">00:00 / 00:00</span>
      </div>
      <div class="progress-track" id="progress-track">
        <div class="progress-fill" id="progress-fill"></div>
      </div>
    </div>

    <div class="player-actions">
      <div class="speed-ctrls" id="speed-ctrls" title="Playback Speed">
        <button class="icon-btn" id="speed-down-btn" title="Slower">−</button>
        <span id="speed-label" title="Playback speed (click to reset to 1.0x)">1.0x</span>
        <button class="icon-btn" id="speed-up-btn" title="Faster">+</button>
      </div>
      <button class="icon-btn expand-btn" id="expand-btn" title="Minimize Player to Mini Bar">▼</button>
    </div>
  </div>

  <!-- Collapsible Markers Drawer (Hidden by default) -->
  <div class="drawer-backdrop" id="drawer-backdrop"></div>
  <aside class="markers-drawer" id="markers-drawer">
    <div class="drawer-header">
      <h2>Page Synchronization Markers</h2>
      <button class="icon-btn" id="close-drawer-btn" style="padding: 4px 8px;">✕</button>
    </div>
    <div class="drawer-content" id="drawer-content"></div>
  </aside>

  <!-- Resume Progress Toast -->
  <div class="resume-toast" id="resume-toast">
    <span id="resume-toast-text">Resumed from 00:00 (Page 1)</span>
    <button class="toast-btn" id="resume-start-over-btn">Start Over</button>
    <button class="toast-close" id="resume-dismiss-btn" title="Dismiss">✕</button>
  </div>

  <!-- Fallback PDF Dialog -->
  <div class="load-dialog" id="load-dialog">
    <div class="dialog-card">
      <h3>Select Book PDF</h3>
      <p>Your browser blocked direct loading from a local <code>file://</code> URL.<br>Please select or drag-and-drop <strong>${pdfFilename}</strong>.</p>
      <button class="btn-primary" onclick="document.getElementById('pdf-file-input').click()">Browse & Select PDF</button>
    </div>
  </div>

  <script>
    const MARKERS = ${markersJson};
    const PDF_FILENAME = "${pdfFilename}";
    const AUDIO_FILENAME = "${audioFilename}";
    const DEFAULT_START_PAGE = ${firstPage};
    const STORAGE_KEY = 'pdf_voiceover_progress_' + AUDIO_FILENAME.replace(/[^a-zA-Z0-9_-]/g, '_');

    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    let pdfDoc = null;
    let userHasExplicitlySetViewMode = false;
    let isDualPage = (window.innerWidth >= window.innerHeight);
    let currentPage = DEFAULT_START_PAGE;
    let zoomLevel = 1.0;
    let panX = 0, panY = 0;
    let isDragging = false;
    let startMouseX = 0, startMouseY = 0;
    let startPanX = 0, startPanY = 0;
    let isRendering = false;

    // Touch gesture state
    let initialPinchDistance = null;
    let initialZoom = 1.0;
    let touchStartMidX = 0, touchStartMidY = 0;
    let touchStartPanX = 0, touchStartPanY = 0;
    let touchStartTime = 0;
    let touchMoved = false;

    // Elements
    const audio = document.getElementById('audio');
    const playTrigger = document.getElementById('play-trigger');
    const progressTrack = document.getElementById('progress-track');
    const progressFill = document.getElementById('progress-fill');
    const timeReadout = document.getElementById('time-readout');
    const currentBadge = document.getElementById('current-badge');
    const metaReading = document.getElementById('meta-reading');
    const speedDownBtn = document.getElementById('speed-down-btn');
    const speedUpBtn = document.getElementById('speed-up-btn');
    const speedLabel = document.getElementById('speed-label');
    const SPEED_STEPS = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

    function setPlaybackSpeed(rate) {
      const clamped = Math.min(SPEED_STEPS[SPEED_STEPS.length - 1], Math.max(SPEED_STEPS[0], rate));
      audio.playbackRate = clamped;
      speedLabel.textContent = (Number.isInteger(clamped) ? clamped.toFixed(1) : String(clamped)) + 'x';
      speedDownBtn.disabled = clamped <= SPEED_STEPS[0];
      speedUpBtn.disabled = clamped >= SPEED_STEPS[SPEED_STEPS.length - 1];
    }

    function stepPlaybackSpeed(direction) {
      const current = audio.playbackRate || 1.0;
      const next = direction > 0
        ? SPEED_STEPS.find(s => s > current + 0.001)
        : [...SPEED_STEPS].reverse().find(s => s < current - 0.001);
      if (next !== undefined) setPlaybackSpeed(next);
    }

    const viewportContainer = document.getElementById('viewport-container');
    const spreadWrapper = document.getElementById('spread-wrapper');
    const pageBoxLeft = document.getElementById('page-box-left');
    const pageBoxRight = document.getElementById('page-box-right');
    const canvasLeft = document.getElementById('canvas-left');
    const canvasRight = document.getElementById('canvas-right');
    const tagLeft = document.getElementById('tag-left');
    const tagRight = document.getElementById('tag-right');
    const zoomLabel = document.getElementById('zoom-label');

    const floatingHeader = document.getElementById('floating-header');
    const floatingPlayer = document.getElementById('floating-player');
    const topHoverSensor = document.getElementById('top-hover-sensor');
    const expandBtn = document.getElementById('expand-btn');
    const expandHeaderBtn = document.getElementById('expand-header-btn');
    const sidePrevArrow = document.getElementById('side-prev-arrow');
    const sideNextArrow = document.getElementById('side-next-arrow');

    const markersDrawer = document.getElementById('markers-drawer');
    const drawerBackdrop = document.getElementById('drawer-backdrop');
    const drawerContent = document.getElementById('drawer-content');
    const toggleMarkersBtn = document.getElementById('toggle-markers-btn');
    const closeDrawerBtn = document.getElementById('close-drawer-btn');
    const toggleViewBtn = document.getElementById('toggle-view-btn');

    function updateToggleViewBtn() {
      if (!toggleViewBtn) return;
      toggleViewBtn.querySelector('.btn-icon').textContent = isDualPage ? '📖' : '📄';
      toggleViewBtn.querySelector('.btn-label').textContent = isDualPage ? 'Dual Page' : 'Single Page';
      toggleViewBtn.title = isDualPage
        ? 'Current: Dual Page View (Click to switch to Single Page)'
        : 'Current: Single Page View (Click to switch to Dual Page)';
    }
    updateToggleViewBtn();

    const loadDialog = document.getElementById('load-dialog');
    const pdfFileInput = document.getElementById('pdf-file-input');

    const resumeToast = document.getElementById('resume-toast');
    const resumeToastText = document.getElementById('resume-toast-text');
    const resumeStartOverBtn = document.getElementById('resume-start-over-btn');
    const resumeDismissBtn = document.getElementById('resume-dismiss-btn');
    let toastTimer = null;
    let hasRestoredProgress = false;
    let lastSaveTime = 0;

    // Build Drawer Items
    MARKERS.forEach(m => {
      const item = document.createElement('div');
      item.className = 'marker-item' + (m.page === DEFAULT_START_PAGE ? ' active' : '');
      item.id = 'marker-item-' + m.page;
      item.innerHTML = \`
        <div>
          <div class="m-title">Page \${m.page} \${m.bookPage ? '(Book p. ' + m.bookPage + ')' : ''}</div>
          <div class="m-time">\${m.startTime} – \${m.endTime} (\${m.durationSeconds.toFixed(1)}s)</div>
        </div>
        <span style="font-size: 0.8rem; color: var(--brand);">▶</span>
      \`;
      item.addEventListener('click', () => {
        jumpToPage(m.page);
        closeDrawer();
      });
      drawerContent.appendChild(item);
    });

    // ==========================================
    // LOCAL STORAGE PLAYBACK PROGRESS MEMORIZATION
    // ==========================================
    function saveProgress(immediate = false) {
      try {
        const now = Date.now();
        if (!immediate && now - lastSaveTime < 1200) return;
        lastSaveTime = now;

        if (!audio.duration || isNaN(audio.currentTime)) return;

        // Reset if near completion (last 3 seconds) or ended
        if (audio.currentTime >= audio.duration - 3 || audio.ended) {
          localStorage.removeItem(STORAGE_KEY);
          return;
        }

        // Only save if at least 2 seconds in
        if (audio.currentTime < 2) {
          localStorage.removeItem(STORAGE_KEY);
          return;
        }

        const state = {
          currentTime: audio.currentTime,
          page: currentPage,
          playbackRate: audio.playbackRate || 1.0,
          isDualPage: isDualPage,
          userHasExplicitlySetViewMode: userHasExplicitlySetViewMode,
          savedAt: now
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (_) {}
    }

    function showResumeToast(timeSec, pageNum) {
      if (!resumeToast) return;
      const marker = getMarkerAtTime(timeSec) || MARKERS.find(m => m.page === pageNum);
      const pageLabel = marker ? ('Page ' + marker.page + (marker.bookPage ? ' [Book p. ' + marker.bookPage + ']' : '')) : ('Page ' + pageNum);
      resumeToastText.textContent = 'Resumed from ' + fmt(timeSec) + ' (' + pageLabel + ')';
      resumeToast.classList.add('show');

      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        resumeToast.classList.remove('show');
      }, 6000);
    }

    function restoreProgress() {
      if (hasRestoredProgress) return;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (!data || typeof data.currentTime !== 'number' || data.currentTime < 2) return;

        hasRestoredProgress = true;
        const targetTime = data.currentTime;

        if (data.playbackRate) {
          setPlaybackSpeed(data.playbackRate);
        }

        if (typeof data.userHasExplicitlySetViewMode === 'boolean') {
          userHasExplicitlySetViewMode = data.userHasExplicitlySetViewMode;
        }

        if (userHasExplicitlySetViewMode && typeof data.isDualPage === 'boolean') {
          isDualPage = data.isDualPage;
        } else {
          isDualPage = (window.innerWidth >= window.innerHeight);
        }
        updateToggleViewBtn();

        if (data.page) {
          currentPage = data.page;
        } else {
          const m = getMarkerAtTime(targetTime);
          if (m) currentPage = m.page;
        }

        const applyAudioTime = () => {
          if (audio.duration && targetTime < audio.duration) {
            audio.currentTime = targetTime;
            const dur = audio.duration || 1;
            progressFill.style.width = ((targetTime / dur) * 100) + '%';
            timeReadout.textContent = fmt(targetTime) + ' / ' + fmt(dur);
            const m = getMarkerAtTime(targetTime) || MARKERS.find(item => item.page === currentPage);
            if (m) highlightActiveMarker(m);
          }
        };

        if (audio.readyState >= 1) {
          applyAudioTime();
        } else {
          audio.addEventListener('loadedmetadata', applyAudioTime, { once: true });
        }

        showResumeToast(targetTime, currentPage);
      } catch (err) {
        console.warn('Could not restore progress from localStorage:', err);
      }
    }

    if (resumeStartOverBtn) {
      resumeStartOverBtn.addEventListener('click', () => {
        try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
        userHasExplicitlySetViewMode = false;
        isDualPage = (window.innerWidth >= window.innerHeight);
        updateToggleViewBtn();
        audio.currentTime = 0;
        currentPage = DEFAULT_START_PAGE;
        progressFill.style.width = '0%';
        timeReadout.textContent = fmt(0) + ' / ' + fmt(audio.duration || 0);
        highlightActiveMarker(MARKERS[0]);
        currentRenderedLeft = null;
        currentRenderedRight = null;
        currentRenderedZoom = null;
        updateSpreadDisplay();
        resumeToast.classList.remove('show');
      });
    }

    if (resumeDismissBtn) {
      resumeDismissBtn.addEventListener('click', () => {
        resumeToast.classList.remove('show');
      });
    }

    // Call restoreProgress immediately to set currentPage before PDF renders
    restoreProgress();

    // ==========================================
    // TITLE BAR & PLAYER AUTO-HIDE CONTROLS
    // ==========================================
    let headerHideTimer = null;
    let playerHideTimer = null;
    let isHeaderHovered = false;
    let isPlayerHovered = false;
    let isDrawerOpen = false;

    function expandHeader() {
      floatingHeader.classList.remove('mini-mode');
      floatingHeader.classList.remove('hidden-bar');
      if (expandHeaderBtn) {
        expandHeaderBtn.textContent = '▲';
        expandHeaderBtn.title = 'Minimize Header (Keep Mini Pill)';
      }
      clearTimeout(headerHideTimer);
    }

    function minimizeHeader() {
      if (isDrawerOpen) return;
      floatingHeader.classList.add('mini-mode');
      floatingHeader.classList.remove('hidden-bar');
      if (expandHeaderBtn) {
        expandHeaderBtn.textContent = '▼';
        expandHeaderBtn.title = 'Expand Header Toolbar';
      }
    }

    function scheduleHeaderMinimize(delay = 2500) {
      clearTimeout(headerHideTimer);
      if (!isHeaderHovered && !isDrawerOpen) {
        headerHideTimer = setTimeout(() => {
          minimizeHeader();
        }, delay);
      }
    }

    function expandPlayer() {
      floatingPlayer.classList.remove('mini-mode');
      floatingPlayer.classList.remove('hidden-bar');
      if (expandBtn) {
        expandBtn.textContent = '▼';
        expandBtn.title = 'Minimize Player (Keep Mini Bar)';
      }
      clearTimeout(playerHideTimer);
    }

    function minimizePlayer() {
      if (isDrawerOpen) return;
      floatingPlayer.classList.add('mini-mode');
      floatingPlayer.classList.remove('hidden-bar');
      if (expandBtn) {
        expandBtn.textContent = '▲';
        expandBtn.title = 'Expand to Full Player Controls';
      }
    }

    function schedulePlayerMinimize(delay = 3000) {
      clearTimeout(playerHideTimer);
      if (!audio.paused && !isPlayerHovered && !isDrawerOpen) {
        playerHideTimer = setTimeout(() => {
          minimizePlayer();
        }, delay);
      }
    }

    // Toggle bars on tapping/clicking the PDF viewer pane
    function handleViewerTap() {
      const isHeaderMini = floatingHeader.classList.contains('mini-mode');
      const isPlayerMini = floatingPlayer.classList.contains('mini-mode');
      if (isHeaderMini || isPlayerMini) {
        expandHeader();
        expandPlayer();
        scheduleHeaderMinimize(3500);
        schedulePlayerMinimize(3500);
      } else {
        minimizeHeader();
        minimizePlayer();
      }
    }

    if (expandHeaderBtn) {
      expandHeaderBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (floatingHeader.classList.contains('mini-mode')) {
          expandHeader();
          scheduleHeaderMinimize(4000);
        } else {
          minimizeHeader();
        }
      });
    }

    // Clicking anywhere on mini-header bar (except expand button) expands it
    floatingHeader.addEventListener('click', (e) => {
      if (floatingHeader.classList.contains('mini-mode')) {
        if (!e.target.closest('#expand-header-btn')) {
          expandHeader();
          scheduleHeaderMinimize(3500);
        }
      }
    });

    if (expandBtn) {
      expandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (floatingPlayer.classList.contains('mini-mode')) {
          expandPlayer();
          schedulePlayerMinimize(4000);
        } else {
          minimizePlayer();
        }
      });
    }

    // Clicking anywhere on mini-player bar (except direct play button or progress track) expands it
    floatingPlayer.addEventListener('click', (e) => {
      if (floatingPlayer.classList.contains('mini-mode')) {
        if (!e.target.closest('#play-trigger') && !e.target.closest('#progress-track') && !e.target.closest('#expand-btn')) {
          expandPlayer();
          schedulePlayerMinimize(3500);
        }
      }
    });

    floatingHeader.addEventListener('mouseenter', () => {
      isHeaderHovered = true;
      expandHeader();
    });

    floatingHeader.addEventListener('mouseleave', () => {
      isHeaderHovered = false;
      scheduleHeaderMinimize(2000);
    });

    topHoverSensor.addEventListener('mouseenter', () => {
      expandHeader();
      scheduleHeaderMinimize(3000);
    });

    floatingPlayer.addEventListener('mouseenter', () => {
      isPlayerHovered = true;
      expandPlayer();
    });

    floatingPlayer.addEventListener('mouseleave', () => {
      isPlayerHovered = false;
      schedulePlayerMinimize(2500);
    });

    // Mouse movement reveals bars smoothly on desktop
    window.addEventListener('mousemove', (e) => {
      if (e.clientY < 70) {
        expandHeader();
        scheduleHeaderMinimize(2500);
      } else {
        scheduleHeaderMinimize(2200);
      }

      if (e.clientY > window.innerHeight - 80) {
        expandPlayer();
        schedulePlayerMinimize(3000);
      } else {
        schedulePlayerMinimize(2500);
      }
    });

    scheduleHeaderMinimize(3500);
    schedulePlayerMinimize(4000);

    // ==========================================
    // PANNING & ZOOMING (TOUCH & MOUSE)
    // ==========================================
    function updateTransform() {
      spreadWrapper.style.transform = \`translate(\${panX}px, \${panY}px)\`;
      const canPan = zoomLevel > 1.05 || Math.abs(panX) > 10 || Math.abs(panY) > 10;
      viewportContainer.classList.toggle('can-pan', canPan);
    }

    function resetPanAndZoom() {
      panX = 0;
      panY = 0;
      zoomLevel = 1.0;
      zoomLabel.textContent = '100%';
      currentRenderedZoom = null;
      updateTransform();
      updateSpreadDisplay();
    }

    function getDistance(t1, t2) {
      const dx = t1.clientX - t2.clientX;
      const dy = t1.clientY - t2.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function getMidpoint(t1, t2) {
      return {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2
      };
    }

    // Touch event listeners for isolated PDF pan & pinch-to-zoom
    viewportContainer.addEventListener('touchstart', (e) => {
      if (e.target.closest('.floating-header') || e.target.closest('.floating-player') || e.target.closest('.markers-drawer') || e.target.closest('.load-dialog')) {
        return;
      }
      e.preventDefault();

      touchStartTime = Date.now();
      touchMoved = false;

      if (e.touches.length === 1) {
        isDragging = true;
        startMouseX = e.touches[0].clientX;
        startMouseY = e.touches[0].clientY;
        startPanX = panX;
        startPanY = panY;
        initialPinchDistance = null;
      } else if (e.touches.length === 2) {
        isDragging = false;
        initialPinchDistance = getDistance(e.touches[0], e.touches[1]);
        initialZoom = zoomLevel;
        const mid = getMidpoint(e.touches[0], e.touches[1]);
        touchStartMidX = mid.x;
        touchStartMidY = mid.y;
        touchStartPanX = panX;
        touchStartPanY = panY;
      }
    }, { passive: false });

    viewportContainer.addEventListener('touchmove', (e) => {
      if (e.target.closest('.floating-header') || e.target.closest('.floating-player') || e.target.closest('.markers-drawer')) {
        return;
      }
      e.preventDefault();
      touchMoved = true;

      if (e.touches.length === 1 && isDragging) {
        panX = startPanX + (e.touches[0].clientX - startMouseX);
        panY = startPanY + (e.touches[0].clientY - startMouseY);
        updateTransform();
      } else if (e.touches.length === 2 && initialPinchDistance) {
        const curDist = getDistance(e.touches[0], e.touches[1]);
        const scaleFactor = curDist / initialPinchDistance;
        const newZoom = Math.min(3.8, Math.max(0.5, initialZoom * scaleFactor));

        const mid = getMidpoint(e.touches[0], e.touches[1]);
        panX = touchStartPanX + (mid.x - touchStartMidX);
        panY = touchStartPanY + (mid.y - touchStartMidY);

        if (Math.abs(newZoom - zoomLevel) > 0.04) {
          zoomLevel = newZoom;
          zoomLabel.textContent = Math.round(zoomLevel * 100) + '%';
          updateSpreadDisplay();
        } else {
          updateTransform();
        }
      }
    }, { passive: false });

    viewportContainer.addEventListener('touchend', (e) => {
      if (e.target.closest('.floating-header') || e.target.closest('.floating-player') || e.target.closest('.markers-drawer')) {
        return;
      }
      e.preventDefault();

      const touchDuration = Date.now() - touchStartTime;
      // Single tap without significant movement toggles bars
      if (!touchMoved && touchDuration < 320 && e.changedTouches.length === 1) {
        handleViewerTap();
      }

      if (e.touches.length === 0) {
        isDragging = false;
        initialPinchDistance = null;
        updateSpreadDisplay();
      } else if (e.touches.length === 1) {
        isDragging = true;
        startMouseX = e.touches[0].clientX;
        startMouseY = e.touches[0].clientY;
        startPanX = panX;
        startPanY = panY;
        initialPinchDistance = null;
      }
    }, { passive: false });

    // Mouse drag-to-pan
    let mouseClickStartTime = 0;
    let mouseHasMoved = false;

    viewportContainer.addEventListener('mousedown', (e) => {
      if (e.target.closest('.floating-header') || e.target.closest('.floating-player') || e.target.closest('.markers-drawer') || e.target.closest('.load-dialog')) {
        return;
      }
      mouseClickStartTime = Date.now();
      mouseHasMoved = false;
      isDragging = true;
      startMouseX = e.clientX;
      startMouseY = e.clientY;
      startPanX = panX;
      startPanY = panY;
      viewportContainer.classList.add('panning-active');
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = Math.abs(e.clientX - startMouseX);
      const dy = Math.abs(e.clientY - startMouseY);
      if (dx > 4 || dy > 4) mouseHasMoved = true;

      panX = startPanX + (e.clientX - startMouseX);
      panY = startPanY + (e.clientY - startMouseY);
      updateTransform();
    });

    window.addEventListener('mouseup', (e) => {
      if (isDragging) {
        isDragging = false;
        viewportContainer.classList.remove('panning-active');
        const duration = Date.now() - mouseClickStartTime;
        // Tap/click on viewer without dragging toggles bars
        if (!mouseHasMoved && duration < 280 && !e.target.closest('.floating-header') && !e.target.closest('.floating-player') && !e.target.closest('.markers-drawer')) {
          handleViewerTap();
        }
      }
    });

    // Mouse Wheel scroll panning & Ctrl+Wheel zooming
    viewportContainer.addEventListener('wheel', (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        if (e.deltaY < 0) zoomIn(); else zoomOut();
      } else {
        panX -= e.deltaX;
        panY -= e.deltaY;
        updateTransform();
      }
    }, { passive: false });

    // Double-click or double-tap to reset pan & zoom
    viewportContainer.addEventListener('dblclick', (e) => {
      if (e.target === viewportContainer || e.target.closest('.page-box')) {
        resetPanAndZoom();
      }
    });

    document.getElementById('reset-view-btn').addEventListener('click', resetPanAndZoom);

    function zoomIn() {
      zoomLevel = Math.min(3.8, zoomLevel + 0.2);
      zoomLabel.textContent = Math.round(zoomLevel * 100) + '%';
      currentRenderedZoom = null;
      updateSpreadDisplay();
      updateTransform();
    }

    function zoomOut() {
      zoomLevel = Math.max(0.5, zoomLevel - 0.2);
      zoomLabel.textContent = Math.round(zoomLevel * 100) + '%';
      currentRenderedZoom = null;
      updateSpreadDisplay();
      updateTransform();
    }

    document.getElementById('zoom-in-btn').addEventListener('click', zoomIn);
    document.getElementById('zoom-out-btn').addEventListener('click', zoomOut);

    // Fullscreen Toggle
    document.getElementById('fullscreen-btn').addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    });

    // Drawer Toggling
    function openDrawer() {
      isDrawerOpen = true;
      expandHeader();
      expandPlayer();
      markersDrawer.classList.add('open');
      drawerBackdrop.classList.add('open');
      toggleMarkersBtn.classList.add('active');
    }

    function closeDrawer() {
      isDrawerOpen = false;
      markersDrawer.classList.remove('open');
      drawerBackdrop.classList.remove('open');
      toggleMarkersBtn.classList.remove('active');
      scheduleHeaderMinimize(2000);
      schedulePlayerMinimize(2500);
    }

    toggleMarkersBtn.addEventListener('click', () => {
      if (isDrawerOpen) closeDrawer(); else openDrawer();
    });
    closeDrawerBtn.addEventListener('click', closeDrawer);
    drawerBackdrop.addEventListener('click', closeDrawer);

    let isJumping = false;

    // Accurate marker lookup by audio timestamp
    function getMarkerAtTime(timeSec) {
      if (!MARKERS || MARKERS.length === 0) return null;
      if (timeSec <= MARKERS[0].startSeconds) return MARKERS[0];
      const last = MARKERS[MARKERS.length - 1];
      if (timeSec >= last.endSeconds) return last;
      return MARKERS.find(m => timeSec >= m.startSeconds && timeSec < m.endSeconds) || last;
    }

    // Auto-sync viewer back to audio reading position
    function syncViewerToAudio() {
      if (isJumping) return;
      const marker = getMarkerAtTime(audio.currentTime);
      if (marker && marker.page !== currentPage) {
        currentPage = marker.page;
        updateSpreadDisplay();
        highlightActiveMarker(marker);
      }
    }

    // Safe Audio Playback & Auto-Fallback for Filenames
    function safePlayAudio() {
      try {
        const p = audio.play();
        if (p && typeof p.catch === 'function') {
          p.catch(err => {
            console.warn('Audio playback error (handled):', err);
            playTrigger.textContent = '▶';
          });
        }
      } catch (err) {
        console.warn('Audio play exception (handled):', err);
        playTrigger.textContent = '▶';
      }
    }

    // Auto-fallback if audio filename doesn't match on disk
    audio.addEventListener('error', () => {
      const cur = audio.getAttribute('src');
      if (!cur) return;
      console.warn('Audio file failed to load:', cur);
      let fallback = null;
      if (cur.includes('_voiceover.mp3')) {
        fallback = cur.replace('_voiceover.mp3', '.mp3');
      } else if (cur.endsWith('.mp3')) {
        fallback = cur.replace('.mp3', '_voiceover.mp3');
      }
      if (fallback && fallback !== cur) {
        console.log('Attempting fallback audio filename:', fallback);
        audio.src = fallback;
        audio.load();
      }
    }, { once: true });

    // Audio Play / Pause
    playTrigger.addEventListener('click', toggleAudio);
    function toggleAudio() {
      if (audio.paused) {
        syncViewerToAudio(); // Auto-sync back to audio reading page on resume!
        safePlayAudio();
        playTrigger.textContent = '⏸';
        scheduleHeaderMinimize(2000);
        schedulePlayerMinimize(2500);
      } else {
        audio.pause();
        playTrigger.textContent = '▶';
        expandHeader();
        expandPlayer();
      }
    }

    audio.addEventListener('play', () => {
      playTrigger.textContent = '⏸';
      if (!isJumping) syncViewerToAudio(); // Auto-sync back to audio reading page on resume!
      scheduleHeaderMinimize(2500);
      schedulePlayerMinimize(2500);
    });
    audio.addEventListener('pause', () => {
      playTrigger.textContent = '▶';
      expandHeader();
      expandPlayer();
      saveProgress(true);
    });
    audio.addEventListener('ended', () => {
      playTrigger.textContent = '▶';
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    });

    function fmt(s) {
      if (isNaN(s)) return '00:00';
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
    }

    // Audio Sync with Real-Time Page Flipping
    audio.addEventListener('timeupdate', () => {
      const cur = audio.currentTime;
      const dur = audio.duration || 1;
      progressFill.style.width = ((cur / dur) * 100) + '%';
      timeReadout.textContent = fmt(cur) + ' / ' + fmt(dur);

      // Only auto-flip pages while audio is actively playing!
      // When paused, manual browsing stays active until playback resumes.
      if (!audio.paused && !isJumping) {
        const marker = getMarkerAtTime(cur);
        if (marker && marker.page !== currentPage) {
          currentPage = marker.page;
          updateSpreadDisplay();
          highlightActiveMarker(marker);
        }
      }
      saveProgress(false);
    });

    function highlightActiveMarker(m) {
      currentBadge.textContent = 'PDF Page ' + m.page + (m.bookPage ? ' (Book p. ' + m.bookPage + ')' : '');
      metaReading.textContent = 'Reading: Page ' + m.page + (m.bookPage ? ' [Book p. ' + m.bookPage + ']' : '');

      document.querySelectorAll('.marker-item').forEach(el => el.classList.remove('active'));
      const activeEl = document.getElementById('marker-item-' + m.page);
      if (activeEl) {
        activeEl.classList.add('active');
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }

    function jumpToPage(pageNum) {
      const m = MARKERS.find(item => item.page === pageNum);
      if (m) {
        isJumping = true;
        audio.currentTime = m.startSeconds;
        currentPage = m.page;
        updateSpreadDisplay();
        highlightActiveMarker(m);
        if (audio.paused) {
          safePlayAudio();
        }
        setTimeout(() => { isJumping = false; }, 350);
      }
    }

    // Page turning (manual when paused, marker-jump when playing)
    function turnPage(direction) {
      if (audio.paused) {
        // Manual browsing when paused: do NOT alter audio position!
        const step = isDualPage ? 2 : 1;
        let target = currentPage + (direction * step);
        const maxPage = pdfDoc ? pdfDoc.numPages : (MARKERS[MARKERS.length - 1].page + 10);
        target = Math.max(1, Math.min(maxPage, target));
        if (target !== currentPage) {
          currentPage = target;
          updateSpreadDisplay();
          const m = MARKERS.find(item => item.page === currentPage);
          if (m) {
            highlightActiveMarker(m);
            currentBadge.textContent = 'PDF Page ' + m.page + (m.bookPage ? ' (Book p. ' + m.bookPage + ')' : '') + ' [Paused - Browsing]';
          } else {
            currentBadge.textContent = 'PDF Page ' + currentPage + ' [Paused - Browsing]';
          }
        }
      } else {
        // Audio is actively playing: jump audio playback to prev/next page marker
        const idx = MARKERS.findIndex(m => m.page === currentPage);
        if (direction < 0 && idx > 0) {
          jumpToPage(MARKERS[idx - 1].page);
        } else if (direction > 0 && idx >= 0 && idx < MARKERS.length - 1) {
          jumpToPage(MARKERS[idx + 1].page);
        }
      }
    }

    // Seeking
    progressTrack.addEventListener('click', (e) => {
      if (!audio.duration) return;
      const rect = progressTrack.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const targetTime = pos * audio.duration;
      audio.currentTime = targetTime;
      progressFill.style.width = (pos * 100) + '%';
      timeReadout.textContent = fmt(targetTime) + ' / ' + fmt(audio.duration);

      // Immediately sync the page even if paused
      const marker = getMarkerAtTime(targetTime);
      if (marker && marker.page !== currentPage) {
        currentPage = marker.page;
        updateSpreadDisplay();
        highlightActiveMarker(marker);
      }
      saveProgress(true);
      schedulePlayerMinimize(3500);
    });

    // Speed Stepper
    speedDownBtn.addEventListener('click', () => {
      stepPlaybackSpeed(-1);
      saveProgress(true);
    });
    speedUpBtn.addEventListener('click', () => {
      stepPlaybackSpeed(1);
      saveProgress(true);
    });
    speedLabel.addEventListener('click', () => {
      setPlaybackSpeed(1.0);
      saveProgress(true);
    });

    // Navigation & Skip Buttons
    document.getElementById('back-5-btn').addEventListener('click', () => {
      audio.currentTime = Math.max(0, audio.currentTime - 5);
      saveProgress(true);
    });
    document.getElementById('fwd-5-btn').addEventListener('click', () => {
      audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
      saveProgress(true);
    });

    document.getElementById('prev-page-btn').addEventListener('click', () => turnPage(-1));
    document.getElementById('next-page-btn').addEventListener('click', () => turnPage(1));
    if (sidePrevArrow) sidePrevArrow.addEventListener('click', () => turnPage(-1));
    if (sideNextArrow) sideNextArrow.addEventListener('click', () => turnPage(1));

    // Toggle Single vs Dual Page
    toggleViewBtn.addEventListener('click', () => {
      userHasExplicitlySetViewMode = true;
      isDualPage = !isDualPage;
      updateToggleViewBtn();
      saveProgress(true);
      currentRenderedLeft = null;
      currentRenderedRight = null;
      currentRenderedZoom = null;
      updateSpreadDisplay();
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        toggleAudio();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        audio.currentTime = Math.max(0, audio.currentTime - 5);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
      } else if (e.key === '[' || e.code === 'PageUp') {
        e.preventDefault();
        turnPage(-1);
      } else if (e.key === ']' || e.code === 'PageDown') {
        e.preventDefault();
        turnPage(1);
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        if (isDrawerOpen) closeDrawer(); else openDrawer();
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        document.getElementById('fullscreen-btn').click();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        zoomIn();
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        zoomOut();
      } else if (e.key.toLowerCase() === 'r') {
        e.preventDefault();
        resetPanAndZoom();
      }
    });

    let currentRenderedLeft = null;
    let currentRenderedRight = null;
    let currentRenderedZoom = null;
    let renderPending = false;
    let renderTaskLeft = null;
    let renderTaskRight = null;

    // PDF Dual-Spread Page Calculation (Aligned to Chapter/Start Page)
    function getSpread(page) {
      if (!isDualPage) {
        return { left: page, right: null };
      }
      const base = DEFAULT_START_PAGE;
      const diff = page - base;
      const spreadIndex = Math.floor(diff / 2);
      const left = base + (spreadIndex * 2);
      const right = left + 1;
      const maxPage = pdfDoc ? pdfDoc.numPages : 9999;
      return {
        left: (left >= 1 && left <= maxPage) ? left : null,
        right: (right >= 1 && right <= maxPage) ? right : null
      };
    }

    // Render Canvas with High DPI Sharpness
    async function renderPageToCanvas(pageNum, canvas, side) {
      const page = await pdfDoc.getPage(pageNum);
      const viewportBase = page.getViewport({ scale: 1.0 });

      const isPortrait = window.innerHeight > window.innerWidth;
      const availableHeight = (isPortrait ? (window.innerHeight * 0.90) : (window.innerHeight * 0.94)) * zoomLevel;
      const availableWidth = (isDualPage ? (window.innerWidth * (isPortrait ? 0.49 : 0.48)) : (window.innerWidth * (isPortrait ? 0.96 : 0.95))) * zoomLevel;

      const scale = Math.min(availableHeight / viewportBase.height, availableWidth / viewportBase.width);
      const viewport = page.getViewport({ scale: scale });

      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = Math.floor(viewport.width) + 'px';
      canvas.style.height = Math.floor(viewport.height) + 'px';

      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const task = page.render({
        canvasContext: ctx,
        viewport: viewport
      });

      if (side === 'left') renderTaskLeft = task;
      else if (side === 'right') renderTaskRight = task;

      await task.promise;
    }

    async function updateSpreadDisplay() {
      if (!pdfDoc) return;

      const spread = getSpread(currentPage);

      // If the spread pages and zoom haven't changed, only update the active-reading glow (0ms lag, no re-rendering!)
      if (spread.left === currentRenderedLeft && spread.right === currentRenderedRight && zoomLevel === currentRenderedZoom) {
        if (spread.left) {
          pageBoxLeft.classList.toggle('active-reading', spread.left === currentPage);
        }
        if (spread.right) {
          pageBoxRight.classList.toggle('active-reading', spread.right === currentPage);
        }
        return;
      }

      if (isRendering) {
        renderPending = true;
        return;
      }

      isRendering = true;
      renderPending = false;

      try {
        if (renderTaskLeft) {
          try { renderTaskLeft.cancel(); } catch (_) {}
          renderTaskLeft = null;
        }
        if (renderTaskRight) {
          try { renderTaskRight.cancel(); } catch (_) {}
          renderTaskRight = null;
        }

        // Left Page
        if (spread.left) {
          pageBoxLeft.style.display = 'flex';
          tagLeft.textContent = 'Page ' + spread.left;
          pageBoxLeft.classList.toggle('active-reading', spread.left === currentPage);
          await renderPageToCanvas(spread.left, canvasLeft, 'left');
        } else {
          pageBoxLeft.style.display = 'none';
        }

        // Right Page
        if (spread.right) {
          pageBoxRight.style.display = 'flex';
          tagRight.textContent = 'Page ' + spread.right;
          pageBoxRight.classList.toggle('active-reading', spread.right === currentPage);
          await renderPageToCanvas(spread.right, canvasRight, 'right');
        } else {
          pageBoxRight.style.display = 'none';
        }

        currentRenderedLeft = spread.left;
        currentRenderedRight = spread.right;
        currentRenderedZoom = zoomLevel;
        updateTransform();
      } catch (err) {
        if (err && err.name !== 'RenderingCancelledException') {
          console.warn('PDF Render Warning:', err);
        }
      } finally {
        isRendering = false;
        if (renderPending) {
          renderPending = false;
          updateSpreadDisplay();
        }
      }
    }

    // Load PDF Document
    function loadPdfBuffer(buffer) {
      loadDialog.style.display = 'none';
      pdfjsLib.getDocument({ data: buffer }).promise.then(doc => {
        pdfDoc = doc;
        updateSpreadDisplay();
        const activeMarker = getMarkerAtTime(audio.currentTime) || MARKERS.find(m => m.page === currentPage) || MARKERS[0];
        highlightActiveMarker(activeMarker);
      }).catch(err => {
        console.error('PDF Load Error:', err);
        loadDialog.style.display = 'flex';
      });
    }

    // Auto-fetch or use embedded PDF data to bypass file:// CORS restrictions
    function initPdf() {
      // 1. If embedded base64 data is present in global window object, use it immediately!
      // This works 100% offline and avoids all file:/// CORS restrictions.
      const b64Var = "${base64VarName || ''}";
      const embeddedB64 = (b64Var && typeof window[b64Var] === 'string' && window[b64Var].length > 1000)
        ? window[b64Var]
        : (typeof window.AI_AGENTS_IN_ACTION_PDF_BASE64 === 'string' && window.AI_AGENTS_IN_ACTION_PDF_BASE64.length > 1000)
          ? window.AI_AGENTS_IN_ACTION_PDF_BASE64
          : (typeof window.ELOQUENT_JAVASCRIPT_PDF_BASE64 === 'string' && window.ELOQUENT_JAVASCRIPT_PDF_BASE64.length > 1000)
            ? window.ELOQUENT_JAVASCRIPT_PDF_BASE64
            : null;

      if (embeddedB64) {
        try {
          const binaryStr = atob(embeddedB64);
          const len = binaryStr.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          loadPdfBuffer(bytes.buffer);
          return;
        } catch (e) {
          console.warn('Could not decode embedded PDF Base64:', e);
        }
      }

      // 2. Direct fetch (works when served over HTTP / localhost)
      fetch(PDF_FILENAME)
        .then(res => {
          if (!res.ok) throw new Error('Fetch failed: ' + res.status);
          return res.arrayBuffer();
        })
        .then(buf => loadPdfBuffer(buf))
        .catch(err => {
          console.warn('Direct PDF fetch failed. If opening via file://, use a local server or select file.');
          loadDialog.style.display = 'flex';
        });
    }

    initPdf();

    // Fallback file input
    document.getElementById('change-pdf-btn').addEventListener('click', () => pdfFileInput.click());
    pdfFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => loadPdfBuffer(reader.result);
        reader.readAsArrayBuffer(file);
      }
    });

    function handleOrientationOrResize() {
      const isLandscape = window.innerWidth >= window.innerHeight;
      if (!userHasExplicitlySetViewMode) {
        const targetDual = isLandscape;
        if (isDualPage !== targetDual) {
          isDualPage = targetDual;
          updateToggleViewBtn();
        }
      }
      if (pdfDoc) {
        currentRenderedLeft = null;
        currentRenderedRight = null;
        currentRenderedZoom = null;
        updateSpreadDisplay();
      }
    }

    window.addEventListener('resize', handleOrientationOrResize);
    window.addEventListener('orientationchange', () => {
      // Delay slightly for mobile browser window dimensions to update
      setTimeout(handleOrientationOrResize, 150);
    });

    window.addEventListener('beforeunload', () => saveProgress(true));
    window.addEventListener('pagehide', () => saveProgress(true));
  </script>
</body>
</html>`;
}

module.exports = { createPlayerHtml };
