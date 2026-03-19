import React, { useEffect, useCallback, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import api from '../../services/api';

function ToolbarButton({ onClick, active, children, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`px-2 py-1 rounded text-sm font-medium transition-colors ${active ? 'bg-sage text-white' : 'text-charcoal hover:bg-gray-100'}`}
    >
      {children}
    </button>
  );
}

function ImageModal({ onClose, onInsert }) {
  const [tab, setTab] = useState('upload');
  const [url, setUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('image', file);
      const data = await api.post('/uploads/image', formData);
      onInsert(data.url);
      onClose();
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleUrlInsert = () => {
    if (!url.trim()) return;
    onInsert(url.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
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
            <button type="button" onClick={handleUrlInsert} className="btn-primary mt-2 text-sm">Insert</button>
          </div>
        )}
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        <button type="button" onClick={onClose} className="mt-4 text-sm text-gray-500 hover:underline">Cancel</button>
      </div>
    </div>
  );
}

export default function RichTextEditor({ value, onChange, placeholder = 'Start writing your post...' }) {
  const [showHtml, setShowHtml] = useState(false);
  const [htmlSource, setHtmlSource] = useState('');
  const [showImageModal, setShowImageModal] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false }),
      Image.configure({ inline: false }),
      Placeholder.configure({ placeholder }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Sync external value changes (e.g. when editing a different post)
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '');
    }
  }, [value]);

  // Toggle HTML source view
  const toggleHtml = useCallback(() => {
    if (!editor) return;
    if (showHtml) {
      // Apply HTML source back to editor
      editor.commands.setContent(htmlSource);
      onChange(htmlSource);
    } else {
      setHtmlSource(editor.getHTML());
    }
    setShowHtml(!showHtml);
  }, [editor, showHtml, htmlSource, onChange]);

  const handleImageInsert = useCallback((url) => {
    if (!editor) return;
    editor.chain().focus().setImage({ src: url }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 px-3 py-2 border-b border-gray-200 bg-gray-50">
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">B</ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic"><em>I</em></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline"><u>U</u></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough"><s>S</s></ToolbarButton>
        <span className="w-px h-5 bg-gray-300 mx-1" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading 2">H2</ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Heading 3">H3</ToolbarButton>
        <span className="w-px h-5 bg-gray-300 mx-1" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet List">&#8226; List</ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Ordered List">1. List</ToolbarButton>
        <span className="w-px h-5 bg-gray-300 mx-1" />
        <ToolbarButton
          onClick={() => {
            const url = window.prompt('Link URL:');
            if (url) editor.chain().focus().setLink({ href: url }).run();
          }}
          active={editor.isActive('link')}
          title="Link"
        >Link</ToolbarButton>
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

      {/* Editor or HTML source */}
      {showHtml ? (
        <textarea
          value={htmlSource}
          onChange={e => setHtmlSource(e.target.value)}
          className="w-full px-4 py-3 font-mono text-sm min-h-[300px] resize-none outline-none"
        />
      ) : (
        <div className="px-4 py-3 min-h-[300px] prose max-w-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[280px] [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-gray-400 [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0">
          <EditorContent editor={editor} />
        </div>
      )}

      {showImageModal && <ImageModal onClose={() => setShowImageModal(false)} onInsert={handleImageInsert} />}
    </div>
  );
}
