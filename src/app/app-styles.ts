export const APP_STYLES = `
:root {
  color-scheme: light;
  font-family: "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif;
  --bg: #efe8de;
  --paper: #fffdf8;
  --paper-2: rgba(255, 253, 248, 0.78);
  --line: rgba(73, 63, 52, 0.12);
  --line-strong: rgba(73, 63, 52, 0.24);
  --text: #1f2937;
  --muted: #6b7280;
  --accent: #195d7a;
  --accent-soft: rgba(25, 93, 122, 0.12);
  --warn: #ad7b1f;
  --warn-soft: rgba(173, 123, 31, 0.12);
  --success: #2f7d4b;
  --success-soft: rgba(47, 125, 75, 0.12);
  --danger: #b24a3e;
  --shadow: 0 22px 80px rgba(67, 51, 33, 0.12);
}

* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; }
body {
  background:
    radial-gradient(circle at top left, rgba(25, 93, 122, 0.08), transparent 24%),
    radial-gradient(circle at bottom right, rgba(173, 123, 31, 0.08), transparent 28%),
    linear-gradient(180deg, #f7f2e9 0%, var(--bg) 100%);
  color: var(--text);
}
button, input, textarea { font: inherit; }
a { color: inherit; text-decoration: none; }
button { cursor: pointer; }
button:disabled, input:disabled, textarea:disabled { cursor: not-allowed; }

.workbench-shell { min-height: 100vh; display: grid; grid-template-columns: 280px minmax(0, 1fr); }
.sidebar {
  position: sticky; top: 0; min-height: 100vh; display: flex; flex-direction: column; justify-content: flex-start;
  padding: 28px 22px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent),
    linear-gradient(180deg, #16202a 0%, #111923 100%);
  color: rgba(248, 250, 252, 0.94);
  border-right: 1px solid rgba(255, 255, 255, 0.08);
}
.sidebar-top { display: grid; gap: 22px; align-content: start; }
.brand-block h1, .workspace-header h2, .result-header h3, .card-header h3, .action-copy h3, .empty-state h4, .note-card h4, .review-group h4, .review-card h5 { margin: 0; letter-spacing: -0.03em; }
.brand-kicker, .section-kicker {
  display: inline-flex; align-items: center; gap: 8px; margin-bottom: 12px; font-size: 11px; font-weight: 700;
  letter-spacing: 0.14em; text-transform: uppercase;
}
.brand-kicker { color: rgba(229, 231, 235, 0.65); }
.section-kicker { color: #8b5e34; }
.brand-block p, .workspace-header p, .card-header p, .action-copy p, .empty-state p, .note-card p, .single-block p, .compare-block p {
  margin: 0; color: var(--muted); line-height: 1.65;
}
.brand-block p { color: rgba(229, 231, 235, 0.72); }
.tool-nav { display: grid; gap: 10px; margin-top: 8px; }
.tool-item {
  display: grid; gap: 4px; padding: 14px 14px 15px; border-radius: 18px; background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06); color: inherit; text-align: left;
  transition: transform 180ms ease, background-color 180ms ease, border-color 180ms ease;
}
.tool-item span { font-size: 15px; font-weight: 600; }
.tool-item small { font-size: 12px; color: rgba(229, 231, 235, 0.6); }
.tool-item.is-active { background: rgba(255,255,255,0.1); border-color: rgba(118,184,214,0.35); transform: translateX(2px); }
.tool-item:not(:disabled):hover { background: rgba(255,255,255,0.08); }
.tool-item:disabled { opacity: 0.62; }
.workspace { padding: 30px; }
.workspace-header { display: block; margin-bottom: 18px; }
.workspace-header h2 { font-size: clamp(24px, 3vw, 34px); line-height: 1.08; margin-top: 4px; }
.workspace-header p { max-width: 720px; }
.workspace-form { display: block; }
.card, .result-panel {
  background: var(--paper-2); border: 1px solid var(--line); border-radius: 28px; box-shadow: var(--shadow);
}
.unified-card { padding: 22px; }
.card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
.card-header.compact { margin-bottom: 14px; }
.card-header h3, .result-header h3 { font-size: 20px; margin-bottom: 6px; }
.unified-header { margin-bottom: 16px; }
.upload-button {
  position: relative; overflow: hidden; display: inline-flex; align-items: center; justify-content: center;
  min-height: 44px; padding: 0 16px; border-radius: 999px; background: var(--accent-soft); color: var(--accent);
  font-size: 14px; font-weight: 700; border: 1px solid rgba(25,93,122,0.16);
}
.upload-button input { position: absolute; inset: 0; opacity: 0; }
.support-input, .text-input {
  width: 100%; border: 1px solid var(--line); border-radius: 20px; background: rgba(255,255,255,0.92);
  color: var(--text); outline: none; transition: border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease;
}
.support-input:focus, .text-input:focus {
  border-color: rgba(25,93,122,0.45); box-shadow: 0 0 0 4px rgba(25,93,122,0.08);
}
.text-input { min-height: 54px; padding: 0 16px; }
.support-input { min-height: 220px; resize: vertical; padding: 15px 16px; line-height: 1.7; }
.upload-dropzone {
  display: block;
  margin-bottom: 18px;
  cursor: pointer;
  outline: none;
}
.upload-dropzone[aria-disabled="true"] {
  cursor: not-allowed;
}
.upload-dropzone:focus-visible .upload-strip {
  border-color: rgba(25,93,122,0.36);
  box-shadow: 0 0 0 4px rgba(25,93,122,0.08);
}
.upload-dropzone input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}
.upload-strip {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  padding: 16px 18px;
  border-radius: 20px;
  background: rgba(255,255,255,0.68);
  border: 1px solid var(--line);
  transition: border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease;
}
.upload-dropzone:hover .upload-strip {
  border-color: rgba(25,93,122,0.24);
  box-shadow: 0 14px 34px rgba(25, 93, 122, 0.08);
  transform: translateY(-1px);
}
.upload-dropzone.is-dragging .upload-strip {
  border-color: rgba(25,93,122,0.42);
  background: rgba(25,93,122,0.08);
  box-shadow: 0 0 0 4px rgba(25,93,122,0.08), 0 14px 34px rgba(25, 93, 122, 0.08);
}
.upload-strip-main { display: grid; gap: 6px; }
.upload-strip-main strong { font-size: 16px; color: var(--text); }
.upload-strip-main span { font-size: 14px; color: var(--muted); }
.upload-strip-side {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
}
.upload-cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 116px;
  min-height: 44px;
  padding: 0 16px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 14px;
  font-weight: 700;
  border: 1px solid rgba(25,93,122,0.16);
}
.unified-fields {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  align-items: start;
}
.field-block { display: grid; gap: 10px; }
.field-label { font-size: 14px; font-weight: 700; color: var(--text); }
.field-header-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}
.inline-action {
  min-height: 40px;
  padding: 0 14px;
  white-space: nowrap;
}
.segmented-row {
  display: inline-flex; gap: 10px; padding: 6px; width: fit-content;
  border-radius: 999px; background: rgba(255,255,255,0.74); border: 1px solid var(--line);
}
.custom-question-panel {
  display: grid;
  gap: 16px;
  padding: 18px;
  border-radius: 22px;
  background: rgba(255,255,255,0.56);
  border: 1px solid var(--line);
}
.selected-files {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 18px;
}
.file-chip {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  max-width: 100%;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(255,255,255,0.8);
  border: 1px solid var(--line);
}
.file-chip span {
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--text);
}
.file-chip-remove {
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(178,74,62,0.16);
  background: rgba(178,74,62,0.08);
  color: var(--danger);
  font-size: 12px;
  font-weight: 700;
}
.checkbox-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  font-size: 14px;
  color: var(--text);
}
.checkbox-row input {
  width: 16px;
  height: 16px;
}
.form-footer {
  display: grid;
  justify-items: center;
  gap: 14px;
  margin-top: 18px;
}
.form-note {
  margin: 0;
  max-width: 520px;
  font-size: 14px;
  line-height: 1.65;
  color: var(--muted);
  text-align: center;
}
.submit-button, .ghost-button, .tab {
  min-height: 48px; border-radius: 999px; border: 1px solid transparent;
  transition: transform 180ms ease, background-color 180ms ease, border-color 180ms ease, color 180ms ease;
}
.submit-button {
  min-width: 220px; background: linear-gradient(135deg, #174d64 0%, #236f8e 100%); color: white; font-weight: 700;
  box-shadow: 0 18px 40px rgba(25, 93, 122, 0.2);
}
.submit-button:hover:not(:disabled), .ghost-button:hover:not(:disabled), .tab:hover { transform: translateY(-1px); }
.inline-message, .error-banner, .warning-chip { border-radius: 18px; padding: 12px 14px; font-size: 14px; }
.inline-message { background: var(--success-soft); color: var(--success); }
.error-banner { background: rgba(178,74,62,0.1); color: var(--danger); }
.result-panel { margin-top: 24px; padding: 22px; }
.result-header { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; margin-bottom: 18px; }
.result-meta { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; align-items: center; }
.result-meta span {
  padding: 9px 12px; border-radius: 999px; background: rgba(255,255,255,0.78); border: 1px solid var(--line);
  font-size: 13px; color: var(--muted);
}
.ghost-button { padding: 0 15px; background: rgba(255,255,255,0.78); border-color: var(--line); color: var(--text); }
.tab-row {
  display: inline-flex; gap: 10px; padding: 6px; margin-bottom: 20px; border-radius: 999px;
  background: rgba(255,255,255,0.74); border: 1px solid var(--line);
}
.tab { padding: 0 18px; background: transparent; color: var(--muted); }
.tab.is-active { background: #173042; color: white; }
.empty-state, .loading-state {
  display: grid; gap: 10px; place-items: start; min-height: 280px; padding: 32px; border-radius: 24px;
  background: rgba(255,255,255,0.62); border: 1px dashed var(--line-strong);
}
.empty-state.subtle { min-height: 200px; }
.loading-state { align-content: center; }
.loading-line {
  height: 16px; width: 72%; border-radius: 999px;
  background: linear-gradient(90deg, rgba(25,93,122,0.1) 0%, rgba(25,93,122,0.22) 50%, rgba(25,93,122,0.1) 100%);
  animation: shimmer 1.4s linear infinite; background-size: 200% 100%;
}
.loading-line.long { width: 88%; }
.loading-line.short { width: 54%; }
.resume-paper {
  width: min(100%, 860px); margin: 0 auto; padding: 42px; border-radius: 28px; background: var(--paper);
  border: 1px solid rgba(31,41,55,0.08); box-shadow: 0 32px 90px rgba(77,58,34,0.12);
}
.markdown-body { line-height: 1.8; color: #1f2937; }
.markdown-body h1, .markdown-body h2, .markdown-body h3 { margin-top: 0; margin-bottom: 0.7em; letter-spacing: -0.03em; }
.markdown-body h1 { font-size: 32px; }
.markdown-body h2 { margin-top: 1.8em; padding-bottom: 0.35em; border-bottom: 1px solid rgba(31,41,55,0.08); font-size: 22px; }
.markdown-body h3 { margin-top: 1.4em; font-size: 18px; }
.markdown-body p, .markdown-body li { font-size: 15px; }
.markdown-body ul, .markdown-body ol { padding-left: 1.4rem; }
.markdown-body hr { border: 0; border-top: 1px solid rgba(31,41,55,0.08); margin: 1.5em 0; }
.notes-grid { display: grid; gap: 16px; }
.note-card { padding: 20px; border-radius: 24px; background: rgba(255,255,255,0.82); border: 1px solid var(--line); }
.note-top { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 14px; }
.note-category, .confidence, .warning-chip { display: inline-flex; align-items: center; justify-content: center; width: fit-content; }
.note-category { padding: 8px 12px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font-size: 12px; font-weight: 700; }
.confidence { padding: 7px 11px; border-radius: 999px; font-size: 12px; font-weight: 700; text-transform: uppercase; }
.confidence-high { background: var(--success-soft); color: var(--success); }
.confidence-medium { background: rgba(219,171,78,0.12); color: #9e6a09; }
.confidence-low { background: rgba(178,74,62,0.12); color: var(--danger); }
.warning-chip { margin: 12px 0 0; background: var(--warn-soft); color: var(--warn); }
.review-groups { display: grid; gap: 20px; }
.review-group {
  padding: 18px;
  border-radius: 26px;
  background: rgba(255,255,255,0.72);
  border: 1px solid var(--line);
}
.review-group-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  margin-bottom: 16px;
}
.review-group-header h4 { font-size: 18px; }
.review-group-header span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(25,93,122,0.1);
  color: var(--accent);
  font-size: 13px;
  font-weight: 700;
}
.review-cards { display: grid; gap: 14px; }
.review-card {
  padding: 18px;
  border-radius: 22px;
  background: rgba(255,255,255,0.88);
  border: 1px solid rgba(31,41,55,0.08);
}
.review-card-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
}
.review-card-meta-text {
  display: grid;
  gap: 6px;
}
.review-location {
  font-size: 13px;
  line-height: 1.5;
  color: #8b5e34;
  font-weight: 700;
}
.review-module-tag {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(25, 93, 122, 0.08);
  color: #195d7a;
  font-size: 12px;
  font-weight: 600;
}
.review-card h5 {
  font-size: 18px;
  margin-bottom: 0;
}
.review-anchor {
  color: var(--text) !important;
  font-family: "SFMono-Regular", "Menlo", "Consolas", monospace;
  font-size: 13px;
  line-height: 1.7;
}
.homework-page { display: grid; gap: 24px; }
.task-stack { display: grid; gap: 16px; }
.task-stack-head h3, .task-section h4, .task-card-heading h3 { margin: 0; letter-spacing: -0.03em; }
.task-card-list { display: grid; gap: 16px; }
.task-card {
  padding: 20px;
  border-radius: 26px;
  background: rgba(255,255,255,0.78);
  border: 1px solid var(--line);
  box-shadow: 0 18px 48px rgba(67, 51, 33, 0.08);
}
.task-card-top {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 14px;
}
.task-card-heading { display: grid; gap: 8px; }
.task-card-title-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}
.task-card-heading p {
  margin: 0;
  color: var(--muted);
  line-height: 1.6;
}
.task-card-dot { display: inline-block; margin: 0 8px; color: rgba(31,41,55,0.28); }
.task-status-group {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}
.task-status-badge, .task-mode-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}
.task-status-badge.status-transcribing {
  background: rgba(219,171,78,0.12);
  color: #9e6a09;
}
.task-status-badge.status-reviewing {
  background: rgba(25,93,122,0.1);
  color: var(--accent);
}
.task-status-badge.status-completed {
  background: var(--success-soft);
  color: var(--success);
}
.task-status-badge.status-failed {
  background: rgba(178,74,62,0.12);
  color: var(--danger);
}
.task-status-badge.status-uploading {
  background: rgba(25,93,122,0.1);
  color: var(--accent);
}
.task-mode-badge {
  background: rgba(139, 94, 52, 0.12);
  color: #8b5e34;
}
.task-progress-row {
  display: grid;
  gap: 6px;
  margin-bottom: 14px;
}
.task-progress-row span {
  font-size: 13px;
  font-weight: 700;
  color: #8b5e34;
}
.task-progress-row p {
  margin: 0;
  color: var(--muted);
  line-height: 1.6;
}
.task-card-result {
  display: grid;
  gap: 14px;
}
.task-section {
  display: grid;
  gap: 12px;
  padding: 18px;
  border-radius: 22px;
  background: rgba(255,255,255,0.82);
  border: 1px solid rgba(31,41,55,0.08);
}
.task-section-head {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: center;
}
.homework-result-text {
  white-space: pre-wrap;
  line-height: 1.8;
  color: var(--text);
}
.task-action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.modal-shell {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 24px;
}
.modal-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(16, 24, 32, 0.48);
  backdrop-filter: blur(4px);
}
.modal-panel {
  position: relative;
  z-index: 1;
  width: min(920px, 100%);
  max-height: min(82vh, 960px);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  border-radius: 28px;
  background: #fffdf8;
  border: 1px solid rgba(31,41,55,0.08);
  box-shadow: 0 36px 120px rgba(22, 32, 42, 0.24);
  overflow: hidden;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  padding: 22px 24px 0;
}
.modal-header h3 { margin: 0; font-size: 24px; letter-spacing: -0.03em; }
.modal-content {
  padding: 20px 24px 24px;
  overflow: auto;
}
.preview-text {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.8;
  font-size: 15px;
  color: var(--text);
}
.compare-block { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-top: 16px; }
.compare-block div, .single-block {
  padding: 14px; border-radius: 18px; background: rgba(255,255,255,0.72); border: 1px solid rgba(31,41,55,0.08);
}
.single-block { margin-top: 16px; }
.compare-block strong, .single-block strong { display: inline-block; margin-bottom: 8px; font-size: 13px; color: #8b5e34; }
@keyframes shimmer { 0% { background-position: 100% 50%; } 100% { background-position: -100% 50%; } }
@media (max-width: 1180px) {
  .workbench-shell { grid-template-columns: 1fr; }
  .sidebar { position: relative; min-height: auto; border-right: 0; border-bottom: 1px solid rgba(255,255,255,0.08); }
  .result-header { grid-template-columns: 1fr; display: grid; }
}
@media (max-width: 980px) {
  .workspace { padding: 18px; }
  .compare-block { grid-template-columns: 1fr; }
  .review-card-meta, .review-group-header {
    display: grid;
    justify-content: stretch;
  }
  .field-header-row {
    display: grid;
    justify-content: stretch;
  }
  .task-card-title-row, .task-section-head {
    display: grid;
    justify-content: stretch;
  }
  .upload-strip {
    flex-direction: column;
    align-items: flex-start;
  }
  .segmented-row {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .upload-strip-side {
    width: 100%;
    justify-content: flex-start;
  }
  .submit-button { width: 100%; min-width: 0; }
  .resume-paper { padding: 28px 22px; }
}
@media (max-width: 640px) {
  .sidebar, .workspace { padding: 16px; }
  .card, .result-panel, .unified-card, .modal-panel { border-radius: 22px; }
  .tab-row, .result-meta { width: 100%; justify-content: flex-start; }
  .task-status-group { justify-content: flex-start; }
  .tab { flex: 1; min-width: 0; }
}
`;
