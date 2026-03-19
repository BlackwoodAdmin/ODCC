import React, { useState, useRef, useCallback, useEffect } from 'react';

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function ContactPicker({ contacts, value, onChange, placeholder }) {
  const [inputValue, setInputValue] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  const filtered = inputValue.trim()
    ? contacts.filter((c) => {
        const query = inputValue.toLowerCase();
        const nameMatch = c.name && c.name.toLowerCase().includes(query);
        const emailMatch = c.address && c.address.toLowerCase().includes(query);
        return nameMatch || emailMatch;
      })
    : [];

  const addRecipient = useCallback(
    (recipient) => {
      const exists = value.some(
        (v) => v.address.toLowerCase() === recipient.address.toLowerCase()
      );
      if (!exists) {
        onChange([...value, recipient]);
      }
      setInputValue('');
      setShowDropdown(false);
      setHighlightIndex(-1);
      inputRef.current?.focus();
    },
    [value, onChange]
  );

  const removeRecipient = useCallback(
    (index) => {
      const updated = value.filter((_, i) => i !== index);
      onChange(updated);
    },
    [value, onChange]
  );

  const handleInputKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightIndex >= 0 && highlightIndex < filtered.length) {
          addRecipient(filtered[highlightIndex]);
        } else if (inputValue.trim()) {
          const trimmed = inputValue.trim();
          if (isValidEmail(trimmed)) {
            addRecipient({ address: trimmed, name: '' });
          }
        }
      } else if (e.key === 'Backspace' && inputValue === '' && value.length > 0) {
        removeRecipient(value.length - 1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIndex((prev) =>
          prev < filtered.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIndex((prev) => (prev > 0 ? prev - 1 : 0));
      } else if (e.key === 'Escape') {
        setShowDropdown(false);
        setHighlightIndex(-1);
      }
    },
    [inputValue, value, filtered, highlightIndex, addRecipient, removeRecipient]
  );

  const handleInputChange = useCallback((e) => {
    setInputValue(e.target.value);
    setShowDropdown(true);
    setHighlightIndex(-1);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      {/* Tags + input */}
      <div
        className="flex flex-wrap items-center gap-1 px-2 py-1.5 border border-gray-300 rounded-md bg-white focus-within:ring-2 focus-within:ring-sage-500 focus-within:border-sage-500 min-h-[36px]"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((recipient, index) => (
          <span
            key={index}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-sage-100 text-sage-700 text-xs rounded-full"
          >
            <span className="truncate max-w-[150px]">
              {recipient.name || recipient.address}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeRecipient(index);
              }}
              className="text-sage-500 hover:text-sage-700 ml-0.5"
              aria-label={`Remove ${recipient.name || recipient.address}`}
            >
              &times;
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleInputKeyDown}
          onFocus={() => inputValue.trim() && setShowDropdown(true)}
          className="flex-1 min-w-[120px] text-sm outline-none border-none p-0 bg-transparent"
          placeholder={value.length === 0 ? placeholder : ''}
        />
      </div>

      {/* Dropdown */}
      {showDropdown && filtered.length > 0 && (
        <ul className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((contact, index) => (
            <li
              key={contact.address}
              onClick={() => addRecipient(contact)}
              onMouseEnter={() => setHighlightIndex(index)}
              className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-sm ${
                index === highlightIndex
                  ? 'bg-sage-50 text-sage-700'
                  : 'text-charcoal hover:bg-gray-50'
              }`}
            >
              <div className="w-6 h-6 rounded-full bg-sage-200 flex items-center justify-center text-xs font-medium text-sage-700">
                {(contact.name || contact.address).charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                {contact.name && (
                  <p className="text-sm font-medium truncate">{contact.name}</p>
                )}
                <p className="text-xs text-gray-500 truncate">{contact.address}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
