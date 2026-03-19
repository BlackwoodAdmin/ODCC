import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../../services/api';

export default function EmailPreview({ bodyHtml, onChange }) {
  const [template, setTemplate] = useState(null);
  const [width, setWidth] = useState(600);
  const iframeRef = useRef(null);
  const isEditable = !!onChange;
  const suppressExtract = useRef(false);
  const initialized = useRef(false);

  useEffect(() => {
    api.get('/newsletter/template')
      .then(data => setTemplate(data.template))
      .catch(() => setTemplate(null));
  }, []);

  const extractContent = useCallback(() => {
    if (!iframeRef.current || !isEditable || suppressExtract.current) return;
    const doc = iframeRef.current.contentDocument;
    if (!doc) return;
    const editableEl = doc.getElementById('editable-content');
    if (editableEl) {
      onChange(editableEl.innerHTML);
    }
  }, [onChange, isEditable]);

  // Build the full document HTML (used only for initial render)
  const buildDocument = useCallback((contentHtml) => {
    const editableWrapper = isEditable
      ? `<div id="editable-content" contenteditable="true" style="outline:none;min-height:100px;cursor:text;">${contentHtml}</div>`
      : contentHtml;
    const html = template.replace('{{CONTENT}}', editableWrapper);
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<style>
body { margin:0; padding:20px; background:#f3f4f6; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; }
#editable-content:empty::before { content:'Click here to start editing...'; color:#9ca3af; font-style:italic; }
#editable-content img {
  max-width: 100%;
  height: auto;
  cursor: grab;
  border: 2px solid transparent;
  transition: border-color 0.15s;
}
#editable-content img:hover { border-color: #7C9A72; }
#editable-content img.resizing { border-color: #7C9A72; }
#editable-content img.selected { border: 3px solid #7C9A72; box-shadow: 0 0 0 2px rgba(124,154,114,0.3); }
.delete-btn {
  position: absolute;
  top: -10px;
  right: -10px;
  width: 24px;
  height: 24px;
  background: #ef4444;
  color: #fff;
  border: 2px solid #fff;
  border-radius: 50%;
  font-size: 14px;
  line-height: 20px;
  text-align: center;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
  z-index: 10;
}
.delete-btn:hover { background: #dc2626; }
.img-wrapper {
  position: relative;
  display: inline-block;
  max-width: 100%;
}
.resize-handle {
  position: absolute;
  bottom: 4px;
  right: 4px;
  width: 16px;
  height: 16px;
  background: #7C9A72;
  border-radius: 2px;
  cursor: nwse-resize;
  opacity: 0;
  transition: opacity 0.15s;
}
.img-wrapper:hover .resize-handle { opacity: 0.8; }
</style></head><body>${html}</body></html>`;
  }, [template, isEditable]);

  // Initialize iframe document (first render only)
  useEffect(() => {
    if (!iframeRef.current || !template) return;
    if (initialized.current) return;

    const doc = iframeRef.current.contentDocument;
    if (!doc) return;

    suppressExtract.current = true;
    doc.open();
    doc.write(buildDocument(bodyHtml || ''));
    doc.close();
    initialized.current = true;

    if (isEditable) {
      setupEditable(doc, extractContent, suppressExtract);
      setupImageInteractions(doc, extractContent, suppressExtract);
    }

    requestAnimationFrame(() => { suppressExtract.current = false; });
  }, [template]); // Only on template load

  // Update content in-place (preserves scroll position)
  useEffect(() => {
    if (!iframeRef.current || !template || !initialized.current) return;

    const doc = iframeRef.current.contentDocument;
    if (!doc) return;
    const editableEl = doc.getElementById('editable-content');
    if (!editableEl) return;

    // Don't update if the iframe content already matches (prevents cursor jump during typing)
    if (editableEl.innerHTML === (bodyHtml || '')) return;

    suppressExtract.current = true;
    editableEl.innerHTML = bodyHtml || '';

    // Re-setup image interactions on new content
    if (isEditable) {
      setupImageInteractions(doc, extractContent, suppressExtract);
    }

    requestAnimationFrame(() => { suppressExtract.current = false; });
  }, [bodyHtml, template, isEditable, extractContent]);

  // Re-init if template changes after first load (unlikely but safe)
  const prevTemplate = useRef(template);
  useEffect(() => {
    if (template && prevTemplate.current && template !== prevTemplate.current) {
      initialized.current = false;
    }
    prevTemplate.current = template;
  }, [template]);

  if (!template) {
    return <div className="text-center text-gray-500 py-8">Loading preview...</div>;
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm text-gray-500">{isEditable ? 'Edit & Preview:' : 'Preview:'}</span>
        <button
          type="button"
          onClick={() => setWidth(600)}
          className={`px-3 py-1 rounded text-xs ${width === 600 ? 'bg-sage text-white' : 'bg-gray-100 text-gray-600'}`}
        >
          Desktop
        </button>
        <button
          type="button"
          onClick={() => setWidth(320)}
          className={`px-3 py-1 rounded text-xs ${width === 320 ? 'bg-sage text-white' : 'bg-gray-100 text-gray-600'}`}
        >
          Mobile
        </button>
        {isEditable && (
          <span className="text-xs text-gray-400 ml-auto">Drag images to move, drag corners to resize</span>
        )}
      </div>
      <div className="bg-gray-200 rounded-lg p-4 flex justify-center">
        <iframe
          ref={iframeRef}
          sandbox="allow-same-origin allow-scripts"
          title="Email Preview"
          style={{ width: `${width}px`, minHeight: '800px', border: 'none', background: '#f3f4f6', borderRadius: '8px' }}
        />
      </div>
    </div>
  );
}

// Attach input/paste listeners to the editable area
function setupEditable(doc, extractContent, suppressExtract) {
  const editableEl = doc.getElementById('editable-content');
  if (!editableEl) return;

  editableEl.addEventListener('input', () => {
    suppressExtract.current = false;
    extractContent();
  });

  editableEl.addEventListener('paste', (e) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    doc.execCommand('insertHTML', false, html || text);
  });
}

// Make images draggable and resizable within the editable area
function setupImageInteractions(doc, extractContent, suppressExtract) {
  const editableEl = doc.getElementById('editable-content');
  if (!editableEl) return;

  const imgs = editableEl.querySelectorAll('img');
  imgs.forEach(img => {
    // Skip already-setup images
    if (img.dataset.interactive) return;
    img.dataset.interactive = 'true';
    img.setAttribute('draggable', 'true');

    // --- Click to select + delete ---
    img.addEventListener('click', (e) => {
      e.stopPropagation();
      // Deselect all other images first
      editableEl.querySelectorAll('img.selected').forEach(i => {
        i.classList.remove('selected');
        const oldBtn = i._deleteBtn;
        if (oldBtn && oldBtn.parentNode) oldBtn.parentNode.removeChild(oldBtn);
        i._deleteBtn = null;
      });
      img.classList.add('selected');

      // Add delete button
      const wrapper = img.closest('td') || img.parentElement;
      if (wrapper && !img._deleteBtn) {
        wrapper.style.position = 'relative';
        const btn = doc.createElement('div');
        btn.className = 'delete-btn';
        btn.textContent = '\u00d7';
        btn.title = 'Delete image';
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const tableWrapper = img.closest('table');
          if (tableWrapper && editableEl.contains(tableWrapper)) {
            tableWrapper.remove();
          } else {
            img.remove();
          }
          if (btn.parentNode) btn.parentNode.removeChild(btn);
          suppressExtract.current = false;
          extractContent();
        });
        wrapper.appendChild(btn);
        img._deleteBtn = btn;
      }
    });

    // --- Drag to move ---
    img.addEventListener('dragstart', (e) => {
      // Store the image's parent table (newsletter) or the img itself
      const wrapper = img.closest('table') || img;
      e.dataTransfer.setData('text/html', wrapper.outerHTML);
      e.dataTransfer.effectAllowed = 'move';
      // Mark for removal after drop
      wrapper._pendingRemove = true;
      setTimeout(() => { wrapper.style.opacity = '0.3'; }, 0);
    });

    img.addEventListener('dragend', () => {
      const wrapper = img.closest('table') || img;
      wrapper.style.opacity = '';
    });

    // --- Resize via mouse drag on bottom-right corner ---
    img.addEventListener('mousedown', (e) => {
      const rect = img.getBoundingClientRect();
      const inResizeZone = (e.clientX > rect.right - 20) && (e.clientY > rect.bottom - 20);
      if (!inResizeZone) return;

      e.preventDefault();
      img.classList.add('resizing');
      const startX = e.clientX;
      const startW = img.offsetWidth;
      const aspectRatio = img.naturalWidth / img.naturalHeight;

      const onMove = (ev) => {
        const newW = Math.max(60, startW + (ev.clientX - startX));
        img.style.width = newW + 'px';
        img.style.height = Math.round(newW / aspectRatio) + 'px';
        img.setAttribute('width', newW);
      };

      const onUp = () => {
        img.classList.remove('resizing');
        doc.removeEventListener('mousemove', onMove);
        doc.removeEventListener('mouseup', onUp);
        suppressExtract.current = false;
        extractContent();
      };

      suppressExtract.current = true;
      doc.addEventListener('mousemove', onMove);
      doc.addEventListener('mouseup', onUp);
    });

    // Show resize cursor in bottom-right corner
    img.addEventListener('mousemove', (e) => {
      const rect = img.getBoundingClientRect();
      const inResizeZone = (e.clientX > rect.right - 20) && (e.clientY > rect.bottom - 20);
      img.style.cursor = inResizeZone ? 'nwse-resize' : 'grab';
    });
  });

  // --- Click outside image to deselect ---
  if (!editableEl.dataset.deselectSetup) {
    editableEl.dataset.deselectSetup = 'true';
    editableEl.addEventListener('click', (e) => {
      if (e.target.tagName === 'IMG') return;
      editableEl.querySelectorAll('img.selected').forEach(i => {
        i.classList.remove('selected');
        if (i._deleteBtn && i._deleteBtn.parentNode) i._deleteBtn.parentNode.removeChild(i._deleteBtn);
        i._deleteBtn = null;
      });
    });

    // Delete selected image with Delete/Backspace key
    doc.addEventListener('keydown', (e) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const selected = editableEl.querySelector('img.selected');
      if (!selected) return;
      e.preventDefault();
      const tableWrapper = selected.closest('table');
      if (selected._deleteBtn && selected._deleteBtn.parentNode) selected._deleteBtn.parentNode.removeChild(selected._deleteBtn);
      if (tableWrapper && editableEl.contains(tableWrapper)) {
        tableWrapper.remove();
      } else {
        selected.remove();
      }
      suppressExtract.current = false;
      extractContent();
    });
  }

  // --- Drop zone: allow dropping images at new positions ---
  if (!editableEl.dataset.dropSetup) {
    editableEl.dataset.dropSetup = 'true';

    editableEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });

    editableEl.addEventListener('drop', (e) => {
      e.preventDefault();
      const html = e.dataTransfer.getData('text/html');
      if (!html) return;

      // Remove the original element (marked during dragstart)
      const tables = editableEl.querySelectorAll('table');
      tables.forEach(t => { if (t._pendingRemove) t.remove(); });
      const standaloneImgs = editableEl.querySelectorAll('img');
      standaloneImgs.forEach(i => {
        if (i.closest('table')) return;
        if (i._pendingRemove) i.remove();
      });

      // Insert at drop position
      const range = doc.caretRangeFromPoint?.(e.clientX, e.clientY);
      if (range) {
        const sel = doc.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
      doc.execCommand('insertHTML', false, html);

      // Re-setup interactions on the newly inserted image
      setupImageInteractions(doc, extractContent, suppressExtract);

      suppressExtract.current = false;
      extractContent();
    });
  }
}
