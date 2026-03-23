import React, { useEffect, useCallback, useState, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { TextStyle, Color, FontSize } from '@tiptap/extension-text-style';
import api from '../../services/api';

const FONT_SIZES = [
  { label: 'Small',    value: '0.875rem' },
  { label: 'Normal',   value: '1rem' },
  { label: 'Large',    value: '1.25rem' },
  { label: 'X-Large',  value: '1.5rem' },
  { label: 'XX-Large', value: '2rem' },
];

const TEXT_COLORS = [
  '#000000','#374151','#6B7280','#DC2626','#EA580C',
  '#D97706','#16A34A','#0284C7','#7C3AED','#DB2777',
  '#ffffff','#FEF3C7','#DCFCE7','#DBEAFE','#EDE9FE',
];

function ToolbarButton({ onClick, active, children, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`px-2 py-1 rounded text-sm font-medium transition-colors ${
        active ? 'bg-sage text-white' : 'text-charcoal hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  );
}

function ColorPicker({ editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = editor.getAttributes('textStyle').color || '#000000';

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Text Color"
        className="flex flex-col items-center px-2 py-1 rounded hover:bg-gray-100 transition-colors"
      >
        <span className="text-sm font-medium text-charcoal leading-none">A</span>
        <span className="block w-4 h-1 rounded-sm mt-0.5" style={{ backgroundColor: current }} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-2 w-44">
          <div className="grid grid-cols-5 gap-1 mb-2">
            {TEXT_COLORS.map(c => (
              <button
                key={c}
                type="button"
                title={c}
                onClick={() => { editor.chain().focus().setColor(c).run(); setOpen(false); }}
                className="w-7 h-7 rounded border border-gray-200 hover:scale-110 transition-transform"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <label className="text-xs text-gray-500">Custom:</label>
            <input
              type="color"
              defaultValue={current}
              onChange={e => editor.chain().focus().setColor(e.target.value).run()}
              className="w-8 h-6 rounded cursor-pointer border border-gray-300"
            />
          </div>
          <button
            type="button"
            onClick={() => { editor.chain().focus().unsetColor().run(); setOpen(false); }}
            className="text-xs text-gray-400 hover:underline mt-1"
          >Reset</button>
        </div>
      )}
    </div>
  );
}

function FontSizePicker({ editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = editor.getAttributes('textStyle').fontSize;
  const currentLabel = FONT_SIZES.find(f => f.value === current)?.label || 'Size';

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Font Size"
        className="flex items-center gap-1 px-2 py-1 rounded text-sm text-charcoal hover:bg-gray-100 transition-colors min-w-[58px]"
      >
        <span>{currentLabel}</span>
        <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[110px]">
          <button
            type="button"
            onClick={() => { editor.chain().focus().unsetFontSize().run(); setOpen(false); }}
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 text-gray-500"
          >Default</button>
          {FONT_SIZES.map(({ label, value }) => (
            <button
              key={value}
              type="button"
              onClick={() => { editor.chain().focus().setFontSize(value).run(); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 hover:bg-gray-50 ${
                current === value ? 'font-semibold text-sage' : 'text-charcoal'
              }`}
              style={{ fontSize: value }}
            >{label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// Two-step image modal: step 1 = source, step 2 = alt/title
function ImageModal({ onClose, onInsert }) {
  const [tab, setTab] = useState('upload');
  const [url, setUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1); // 1 = source, 2 = metadata
  const [pendingUrl, setPendingUrl] = useState('');
  const [alt, setAlt] = useState('');
  const [title, setTitle] = useState('');

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('image', file);
      const data = await api.post('/uploads/image', formData);
      setPendingUrl(data.url);
      setStep(2);
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleUrlNext = () => {
    if (!url.trim()) return;
    setPendingUrl(url.trim());
    setStep(2);
  };

  const handleInsert = () => {
    onInsert({ src: pendingUrl, alt: alt.trim(), title: title.trim() });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
        {step === 1 ? (
          <>
            <h3 className="text-lg font-bold text-charcoal mb-4">Insert Image</h3>
            <div className="flex gap-2 mb-4">
              <button type="button" onClick={() => setTab('upload')} className={`px-3 py-1 rounded text-sm ${tab === 'upload' ? 'bg-sage text-white' : 'bg-gray-100'}`}>Upload</button>
              <button type="button" onClick={() => setTab('url')} className={`px-3 py-1 rounded text-sm ${tab === 'url' ? 'bg-sage text-white' : 'bg-gray-100'}`}>Paste URL</button>
            </div>
            {tab === 'upload' ? (
              <div>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleUpload} disabled={uploading} className="w-full text-sm" />
                {uploading && <p className="text-sm text-gray-500 mt-2">Uploading...</p>}
              </div>
            ) : (
              <div>
                <input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                <button type="button" onClick={handleUrlNext} className="btn-primary mt-2 text-sm">Next</button>
              </div>
            )}
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
            <button type="button" onClick={onClose} className="mt-4 text-sm text-gray-500 hover:underline">Cancel</button>
          </>
        ) : (
          <>
            <h3 className="text-lg font-bold text-charcoal mb-1">Image Details</h3>
            <p className="text-xs text-gray-400 mb-4">Both fields are optional but recommended for accessibility.</p>
            <img src={pendingUrl} alt="preview" className="w-full max-h-36 object-contain rounded-lg border border-gray-200 mb-4 bg-gray-50" />
            <label className="block text-sm font-medium text-charcoal mb-1">Alt text <span className="text-gray-400 font-normal">(describes the image)</span></label>
            <input
              type="text"
              value={alt}
              onChange={e => setAlt(e.target.value)}
              placeholder="e.g. Pastor speaking at Sunday service"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3"
              autoFocus
            />
            <label className="block text-sm font-medium text-charcoal mb-1">Title <span className="text-gray-400 font-normal">(tooltip on hover)</span></label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Sunday Morning Worship"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4"
            />
            <div className="flex gap-2">
              <button type="button" onClick={handleInsert} className="btn-primary text-sm flex-1">Insert Image</button>
              <button type="button" onClick={() => setStep(1)} className="px-3 py-2 text-sm text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50">Back</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Inline panel shown when an image node is selected in the editor
function ImageEditPanel({ editor }) {
  const attrs = editor.getAttributes('image');
  const [alt, setAlt] = useState(attrs.alt || '');
  const [title, setTitle] = useState(attrs.title || '');

  // Sync when selection changes to a different image
  useEffect(() => {
    setAlt(attrs.alt || '');
    setTitle(attrs.title || '');
  }, [attrs.src]);

  const apply = () => {
    editor.chain().focus().updateAttributes('image', { alt: alt.trim(), title: title.trim() }).run();
  };

  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-sage/20 bg-sage/5">
      <span className="text-xs font-semibold text-sage uppercase tracking-wide">Image</span>
      <div className="flex items-center gap-1">
        <label className="text-xs text-gray-500">Alt:</label>
        <input
          type="text"
          value={alt}
          onChange={e => setAlt(e.target.value)}
          onBlur={apply}
          onKeyDown={e => e.key === 'Enter' && apply()}
          placeholder="Alt text"
          className="border border-gray-300 rounded px-2 py-0.5 text-xs w-48"
        />
      </div>
      <div className="flex items-center gap-1">
        <label className="text-xs text-gray-500">Title:</label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={apply}
          onKeyDown={e => e.key === 'Enter' && apply()}
          placeholder="Tooltip text"
          className="border border-gray-300 rounded px-2 py-0.5 text-xs w-48"
        />
      </div>
      <button
        type="button"
        onClick={apply}
        className="text-xs px-2 py-0.5 bg-sage text-white rounded hover:bg-sage/80"
      >Apply</button>
    </div>
  );
}

export default function RichTextEditor({ value, onChange, placeholder = 'Start writing your post...' }) {
  const [showHtml, setShowHtml] = useState(false);
  const [htmlSource, setHtmlSource] = useState('');
  const [showImageModal, setShowImageModal] = useState(false);
  const [imageSelected, setImageSelected] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false }),
      Image.configure({ inline: false }),
      Placeholder.configure({ placeholder }),
      TextStyle,
      Color,
      FontSize,
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    onSelectionUpdate: ({ editor }) => {
      setImageSelected(editor.isActive('image'));
    },
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '');
    }
  }, [value]);

  const toggleHtml = useCallback(() => {
    if (!editor) return;
    if (showHtml) {
      editor.commands.setContent(htmlSource);
      onChange(htmlSource);
    } else {
      setHtmlSource(editor.getHTML());
    }
    setShowHtml(!showHtml);
  }, [editor, showHtml, htmlSource, onChange]);

  const handleImageInsert = useCallback(({ src, alt, title }) => {
    if (!editor) return;
    editor.chain().focus().setImage({ src, alt: alt || undefined, title: title || undefined }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Main toolbar */}
      <div className="flex flex-wrap items-center gap-1 px-3 py-2 border-b border-gray-200 bg-gray-50">
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold"><strong>B</strong></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic"><em>I</em></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline"><u>U</u></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough"><s>S</s></ToolbarButton>
        <span className="w-px h-5 bg-gray-300 mx-1" />
        <FontSizePicker editor={editor} />
        <ColorPicker editor={editor} />
        <span className="w-px h-5 bg-gray-300 mx-1" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading 2">H2</ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Heading 3">H3</ToolbarButton>
        <span className="w-px h-5 bg-gray-300 mx-1" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet List">&#8226; List</ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Ordered List">1. List</ToolbarButton>
        <span className="w-px h-5 bg-gray-300 mx-1" />
        <ToolbarButton onClick={() => { const url = window.prompt('Link URL:'); if (url) editor.chain().focus().setLink({ href: url }).run(); }} active={editor.isActive('link')} title="Link">Link</ToolbarButton>
        <ToolbarButton onClick={() => setShowImageModal(true)} title="Image">Img</ToolbarButton>
        <span className="w-px h-5 bg-gray-300 mx-1" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Blockquote">&ldquo;</ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="Code Block">&lt;/&gt;</ToolbarButton>
        <span className="w-px h-5 bg-gray-300 mx-1" />
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} title="Undo">Undo</ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} title="Redo">Redo</ToolbarButton>
        <span className="flex-1" />
        <ToolbarButton onClick={toggleHtml} active={showHtml} title="Toggle HTML Source">HTML</ToolbarButton>
      </div>

      {/* Image edit panel — shown when an image node is selected */}
      {imageSelected && !showHtml && <ImageEditPanel editor={editor} />}

      {showHtml ? (
        <textarea value={htmlSource} onChange={e => setHtmlSource(e.target.value)} className="w-full px-4 py-3 font-mono text-sm min-h-[300px] resize-none outline-none" />
      ) : (
        <div className="px-4 py-3 min-h-[300px] prose max-w-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[280px] [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-gray-400 [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0">
          <EditorContent editor={editor} />
        </div>
      )}
      {showImageModal && <ImageModal onClose={() => setShowImageModal(false)} onInsert={handleImageInsert} />}
    </div>
  );
}