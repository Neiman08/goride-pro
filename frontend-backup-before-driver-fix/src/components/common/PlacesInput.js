import React, { useState, useRef, useEffect } from 'react';
import usePlacesAutocomplete from '../../hooks/usePlacesAutocomplete';

const PlacesInput = ({ placeholder, onSelect, icon, value: externalValue }) => {
  const { inputValue, setInputValue, suggestions, getPlaceDetails, clearSuggestions } = usePlacesAutocomplete();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // Sync external value (e.g. when cleared)
  useEffect(() => {
    if (externalValue === '') setInputValue('');
  }, [externalValue, setInputValue]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = async (suggestion) => {
    setInputValue(suggestion.description);
    clearSuggestions();
    setOpen(false);
    try {
      const place = await getPlaceDetails(suggestion.place_id);
      onSelect(place);
    } catch (err) {
      console.error('Place details error:', err);
    }
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10,
        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 12, padding: '12px 16px' }}>
        <span style={{ fontSize: 10, color: icon === 'origin' ? '#10b981' : '#ef4444' }}>●</span>
        <input
          value={inputValue}
          onChange={(e) => { setInputValue(e.target.value); setOpen(true); }}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={placeholder}
          style={{
            flex: 1, background: 'none', border: 'none', color: '#fff',
            fontSize: 14, outline: 'none',
          }}
        />
      </div>

      {open && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 12, marginTop: 4, overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          {suggestions.map((s) => (
            <div
              key={s.place_id}
              onClick={() => handleSelect(s)}
              style={{
                padding: '12px 16px', cursor: 'pointer', fontSize: 13,
                color: 'rgba(255,255,255,0.8)', borderBottom: '1px solid rgba(255,255,255,0.05)',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(124,77,255,0.15)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ fontWeight: 500 }}>{s.structured_formatting.main_text}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                {s.structured_formatting.secondary_text}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PlacesInput;
