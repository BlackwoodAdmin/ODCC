import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';

const IMAGE_KEYWORDS = /\b(image|picture|photo|illustration|graphic|banner|header image|hero image)\b/i;

export default function AiAssistant({ type, currentContent, onInsert, onReplace, onClose }) {
  const [prompt, setPrompt] = useState('');
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageSize, setImageSize] = useState('1024x1024');
  const [generatedImages, setGeneratedImages] = useState([]);
  const [imageSuggestions, setImageSuggestions] = useState([]);
  const [loading, setLoading] = useState({ generate: false, image: false, suggest: false });
  const [textError, setTextError] = useState('');
  const [imageError, setImageError] = useState('');
  const [lastAction, setLastAction] = useState(null);
  const [activeQuickAction, setActiveQuickAction] = useState(null);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Generate a DALL-E image and insert it directly
  const generateAndInsertImage = useCallback(async (description) => {
    setLoading(l => ({ ...l, image: true }));
    setImageError('');
    try {
      const data = await api.post('/ai/generate-image', { prompt: description, size: '1792x1024' });
      setGeneratedImages(prev => [...prev, data]);
      // Auto-insert the image
      const siteUrl = window.location.origin;
      const imgUrl = data.url.startsWith('/') ? `${siteUrl}${data.url}` : data.url;
      if (type === 'newsletter') {
        onInsert(`<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:10px 0;"><img src="${imgUrl}" alt="" width="560" style="max-width:100%;height:auto;display:block;" /></td></tr></table>`);
      } else {
        onInsert(`<img src="${imgUrl}" alt="" />`);
      }
      return true;
    } catch (err) {
      setImageError(err.message || 'Image generation failed');
      return false;
    } finally {
      setLoading(l => ({ ...l, image: false }));
    }
  }, [type, onInsert]);

  const handleGenerate = useCallback(async (action) => {
    const p = action === 'write' ? prompt : (prompt || `Please ${action} this content.`);
    if (!p.trim()) return;

    // If the user asks for an image in the text prompt, generate one with DALL-E
    if (action === 'write' && IMAGE_KEYWORDS.test(p)) {
      await generateAndInsertImage(p);
      return;
    }

    setLoading(l => ({ ...l, generate: true }));
    setTextError('');
    setLastAction(null);
    if (action !== 'write') setActiveQuickAction(action);

    try {
      const data = await api.post('/ai/generate', { type, prompt: p, currentContent, action });
      if (data.content) {
        // Always replace — appending causes content to appear below the fold invisibly
        onReplace(data.content);
        setLastAction(action);
      }
    } catch (err) {
      setTextError(err.message || 'Generation failed');
    } finally {
      setLoading(l => ({ ...l, generate: false }));
      setActiveQuickAction(null);
    }
  }, [prompt, currentContent, type, onReplace, generateAndInsertImage]);

  const handleGenerateImage = useCallback(async () => {
    if (!imagePrompt.trim()) return;
    await generateAndInsertImage(imagePrompt);
  }, [imagePrompt, generateAndInsertImage]);

  const handleSuggestImages = useCallback(async () => {
    if (!currentContent) return;
    setLoading(l => ({ ...l, suggest: true }));
    setImageError('');

    try {
      const data = await api.post('/ai/suggest-images', { content: currentContent });
      const suggestions = data.suggestions || [];
      setImageSuggestions(suggestions);
      if (suggestions.length === 0) {
        setImageError('No image suggestions found for this content.');
      }
    } catch (err) {
      setImageError(err.message || 'Failed to get suggestions');
    } finally {
      setLoading(l => ({ ...l, suggest: false }));
    }
  }, [currentContent]);

  const insertImage = useCallback((img) => {
    if (type === 'newsletter') {
      const siteUrl = window.location.origin;
      const imgUrl = img.url.startsWith('/') ? `${siteUrl}${img.url}` : img.url;
      onInsert(`<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:10px 0;"><img src="${imgUrl}" alt="" width="560" style="max-width:100%;height:auto;display:block;" /></td></tr></table>`);
    } else {
      onInsert(`<img src="${img.url}" alt="" />`);
    }
  }, [type, onInsert]);

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-2xl border-l border-gray-200 z-50 flex flex-col" role="dialog" aria-label="AI Assistant">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
        <h2 className="text-lg font-bold text-charcoal">AI Assistant</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl" aria-label="Close">&times;</button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
        {/* Text Generation */}
        <div>
          <label className="block text-sm font-semibold text-charcoal mb-2">What would you like?</label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder={type === 'newsletter' ? 'Describe the newsletter content... (mention "image" to generate one)' : 'Describe what you want to write...'}
            rows={3}
            maxLength={2000}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
          />
          <button
            onClick={() => handleGenerate('write')}
            disabled={loading.generate || loading.image || !prompt.trim()}
            className="btn-primary text-sm mt-2 w-full"
          >
            {loading.generate && !activeQuickAction ? 'Generating...' : loading.image ? 'Generating image (~15s)...' : 'Generate'}
          </button>
        </div>

        {/* Quick Actions */}
        <div>
          <p className="text-sm font-semibold text-charcoal mb-2">Quick Actions</p>
          <div className="grid grid-cols-2 gap-2">
            {['improve', 'shorten', 'expand', 'rewrite'].map(action => (
              <button
                key={action}
                onClick={() => handleGenerate(action)}
                disabled={loading.generate || !currentContent}
                className={`px-3 py-2 border rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 capitalize ${activeQuickAction === action ? 'border-sage bg-sage/10 text-sage' : 'border-gray-200 text-charcoal'}`}
              >
                {activeQuickAction === action ? `${action[0].toUpperCase() + action.slice(1)}ing...` : action}
              </button>
            ))}
          </div>
        </div>

        {/* Text generation feedback */}
        {textError && (
          <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{textError}</div>
        )}
        {lastAction && !loading.generate && (
          <div className="bg-green-50 text-green-700 text-sm px-3 py-2 rounded-lg">
            Content {lastAction === 'write' ? 'generated' : `${lastAction}ed`} and applied.
          </div>
        )}

        {/* Divider */}
        <hr className="border-gray-200" />

        {/* Image Generation */}
        <div>
          <p className="text-sm font-semibold text-charcoal mb-2">Images</p>
          <button
            onClick={handleSuggestImages}
            disabled={loading.suggest || !currentContent}
            className="w-full px-3 py-2 border border-sage text-sage rounded-lg text-sm hover:bg-sage/10 disabled:opacity-50 mb-3"
          >
            {loading.suggest ? 'Analyzing content...' : 'Suggest Images'}
          </button>

          {imageSuggestions.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {imageSuggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setImagePrompt(s.prompt)}
                  className="px-2 py-1 bg-sage/10 text-sage rounded-full text-xs hover:bg-sage/20"
                  title={`Placement: ${s.placement}`}
                >
                  {s.prompt.substring(0, 40)}...
                </button>
              ))}
            </div>
          )}

          <textarea
            value={imagePrompt}
            onChange={e => setImagePrompt(e.target.value)}
            placeholder="Describe an image..."
            rows={2}
            maxLength={2000}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
          />
          <div className="flex gap-2 mt-2">
            <select
              value={imageSize}
              onChange={e => setImageSize(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-2 text-sm"
            >
              <option value="1024x1024">Square</option>
              <option value="1792x1024">Landscape</option>
              <option value="1024x1792">Portrait</option>
            </select>
            <button
              onClick={handleGenerateImage}
              disabled={loading.image || !imagePrompt.trim()}
              className="btn-primary text-sm flex-1"
            >
              {loading.image ? 'Generating (~15s)...' : 'Generate Image'}
            </button>
          </div>

          {/* Image error */}
          {imageError && (
            <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg mt-2">{imageError}</div>
          )}
        </div>

        {/* Generated Images */}
        {generatedImages.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-charcoal mb-2">Generated Images (click to re-insert)</p>
            <div className="grid grid-cols-2 gap-2">
              {generatedImages.map((img, i) => (
                <div key={i} className="relative group">
                  <img src={img.url} alt="" className="w-full rounded-lg" />
                  <button
                    onClick={() => insertImage(img)}
                    className="absolute inset-0 bg-black/50 text-white text-sm font-medium flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Insert
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
