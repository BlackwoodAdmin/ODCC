import React, { useEffect, useCallback, useState } from 'react';
import { useEditor, useEditorState, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { TextStyle, FontSize } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import Paragraph from '@tiptap/extension-paragraph';
import Heading from '@tiptap/extension-heading';
import api from '../../services/api';

const FONT_SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '36px'];
const DEFAULT_FONT_SIZE = '16px';

const ALIGNMENTS = ['left', 'center', 'right'];
// Tags whose `align` attribute aligns their text. `align` on <table> centers
// the table itself (common in pasted email newsletters), so it's ignored.
const ALIGN_ATTR_TAGS = new Set(['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TD', 'TH', 'CENTER']);
const BLOCK_CHILD_TAGS = new Set([
  'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'BLOCKQUOTE',
  'TABLE', 'CENTER', 'PRE', 'IMG', 'HR', 'FIGURE',
]);

// Left is the default, so it's stored as no alignment (null), like the Left button.
function normalizeAlign(value) {
  const v = value.trim().toLowerCase();
  if (v === '-webkit-center' || v === 'middle') return 'center';
  if (v === 'end') return 'right';
  return v === 'center' || v === 'right' ? v : null;
}

function ownAlign(el) {
  if (el.tagName === 'CENTER') return 'center';
  if (el.style?.textAlign) return el.style.textAlign;
  if (ALIGN_ATTR_TAGS.has(el.tagName)) return el.getAttribute('align');
  return null;
}

// Alignment of an element: its own style/align, else the nearest aligned
// wrapper (<center>, <div align=center>, ...). The walk stops at the editor
// root because ProseMirror also parses the live editor DOM.
function resolveAlign(el) {
  let node = el;
  while (node && node.nodeType === 1) {
    const value = ownAlign(node);
    if (value) return normalizeAlign(value);
    node = node.parentElement;
    if (node?.matches('.ProseMirror, [contenteditable]')) break;
  }
  return null;
}

const hasBlockChildren = el => Array.from(el.children).some(c => BLOCK_CHILD_TAGS.has(c.tagName));

// Reads alignment from style, `align` and wrappers on every parse path
// (paste, HTML source toggle, loading a saved post). Left = no alignment.
const BlogTextAlign = TextAlign.extend({
  addGlobalAttributes() {
    return this.parent().map(group => ({
      ...group,
      attributes: {
        ...group.attributes,
        textAlign: { ...group.attributes.textAlign, parseHTML: resolveAlign },
      },
    }));
  },
  addKeyboardShortcuts() {
    return {
      'Mod-Shift-l': () => this.editor.commands.unsetTextAlign(),
      'Mod-Shift-e': () => this.editor.commands.setTextAlign('center'),
      'Mod-Shift-r': () => this.editor.commands.setTextAlign('right'),
    };
  },
}).configure({ types: ['heading', 'paragraph'], alignments: ALIGNMENTS });

// Text sitting directly in <center> or an aligned <div> would otherwise land
// in an implicit paragraph that never sees the wrapper's alignment.
// definingForContent: on paste, the first pasted paragraph normally merges
// into the paragraph at the cursor and takes its (unaligned) attributes.
// This keeps it as its own block when its alignment differs; same-markup
// paragraphs still merge as before.
const BlogParagraph = Paragraph.extend({
  extendNodeSchema(extension) {
    return extension.name === 'paragraph' ? { definingForContent: true } : {};
  },
  parseHTML() {
    return [
      ...this.parent(),
      { tag: 'center', getAttrs: el => (hasBlockChildren(el) ? false : null) },
      { tag: 'div', getAttrs: el => (hasBlockChildren(el) || !resolveAlign(el) ? false : null) },
    ];
  },
});

// Pasted <h1> becomes H2 (the editor only offers H2/H3) and keeps its alignment.
const BlogHeading = Heading.extend({
  parseHTML() {
    return [...this.parent(), { tag: 'h1', attrs: { level: 2 } }];
  },
}).configure({ levels: [2, 3] });

// Keep only sizes the toolbar sets. Google Docs/Word paste 11pt/12pt on
// every span, which would shrink pasted posts below the blog's body size.
const ToolbarFontSize = FontSize.extend({
  addGlobalAttributes() {
    return this.parent().map(group => ({
      ...group,
      attributes: {
        ...group.attributes,
        fontSize: {
          ...group.attributes.fontSize,
          parseHTML: el => {
            const size = el.style.fontSize;
            return FONT_SIZES.includes(size) && size !== DEFAULT_FONT_SIZE ? size : null;
          },
        },
      },
    }));
  },
});

function AlignIcon({ align }) {
  const short = { left: [3, 13], center: [6, 16], right: [9, 19] }[align];
  return (
    <svg width="16" height="16" viewBox="0 0 22 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="3" y1="4" x2="19" y2="4" />
      <line x1={short[0]} y1="10" x2={short[1]} y2="10" />
      <line x1="3" y1="16" x2="19" y2="16" />
    </svg>
  );
}

// Preserve style attributes on images — the schema drops undeclared
// attributes when HTML-source edits are parsed back into the editor.
const StyledImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      style: {
        default: null,
        parseHTML: el => el.getAttribute('style'),
        renderHTML: attrs => (attrs.style ? { style: attrs.style } : {}),
      },
    };
  },
});

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

function FontSizeDropdown({ value, onChange }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      title="Font Size"
      className="px-2 py-1 rounded text-sm border border-gray-300 text-charcoal hover:bg-gray-100 transition-colors"
    >
      {FONT_SIZES.map(size => <option key={size} value={size}>{size}</option>)}
    </select>
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

// `alignment` and `fontSize` shape the editor schema, which useEditor builds
// once on mount — they must not change for the life of the component.
export default function RichTextEditor({ value, onChange, placeholder = 'Start writing your post...', alignment = false, fontSize = false }) {
  const [showHtml, setShowHtml] = useState(false);
  const [htmlSource, setHtmlSource] = useState('');
  const [showImageModal, setShowImageModal] = useState(false);

  const editor = useEditor({
    extensions: [
      alignment
        ? StarterKit.configure({ paragraph: false, heading: false })
        : StarterKit.configure({ heading: { levels: [2, 3] } }),
      ...(alignment ? [BlogParagraph, BlogHeading, BlogTextAlign] : []),
      Underline,
      Link.configure({ openOnClick: false }),
      StyledImage.configure({ inline: false }),
      TextStyle,
      ...(fontSize ? [ToolbarFontSize] : []),
      Placeholder.configure({ placeholder }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Sync external value changes (e.g. when editing a different post).
  // Skipped while the HTML source view is open — value echoes textarea
  // keystrokes then, and toggleHtml applies them on return to visual.
  useEffect(() => {
    if (editor && !showHtml && value !== editor.getHTML()) {
      editor.commands.setContent(value || '');
    }
  }, [value, showHtml]);

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

  // Cursor-dependent toolbar state. Without this the toolbar only re-renders
  // on content changes, not when the cursor moves. Returns null (no
  // subscription effects) when neither feature is on.
  const toolbarState = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e || (!alignment && !fontSize)) return null;
      const size = e.getAttributes('textStyle').fontSize;
      return {
        fontSize: FONT_SIZES.includes(size) ? size : DEFAULT_FONT_SIZE,
        textAlign: ['center', 'right'].find(a => e.isActive({ textAlign: a })) || 'left',
      };
    },
  });

  if (!editor) return null;

  const fontSizeValue = fontSize ? toolbarState.fontSize : (editor.getAttributes('textStyle').fontSize || DEFAULT_FONT_SIZE);
  const handleFontSize = size => {
    if (!fontSize) {
      editor.chain().focus().setMark('textStyle', { fontSize: size }).run();
    } else if (size === DEFAULT_FONT_SIZE) {
      editor.chain().focus().unsetFontSize().run();
    } else {
      editor.chain().focus().setFontSize(size).run();
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 px-3 py-2 border-b border-gray-200 bg-gray-50">
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">B</ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic"><em>I</em></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline"><u>U</u></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough"><s>S</s></ToolbarButton>
        <span className="w-px h-5 bg-gray-300 mx-1" />
        <FontSizeDropdown value={fontSizeValue} onChange={handleFontSize} />
        <span className="w-px h-5 bg-gray-300 mx-1" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading 2">H2</ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Heading 3">H3</ToolbarButton>
        <span className="w-px h-5 bg-gray-300 mx-1" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet List">&#8226; List</ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Ordered List">1. List</ToolbarButton>
        <span className="w-px h-5 bg-gray-300 mx-1" />
        {alignment && (
          <>
            <ToolbarButton onClick={() => editor.chain().focus().unsetTextAlign().run()} active={toolbarState.textAlign === 'left'} title="Align Left"><AlignIcon align="left" /></ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()} active={toolbarState.textAlign === 'center'} title="Align Center"><AlignIcon align="center" /></ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()} active={toolbarState.textAlign === 'right'} title="Align Right"><AlignIcon align="right" /></ToolbarButton>
            <span className="w-px h-5 bg-gray-300 mx-1" />
          </>
        )}
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
          onChange={e => {
            setHtmlSource(e.target.value);
            onChange(e.target.value);
          }}
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