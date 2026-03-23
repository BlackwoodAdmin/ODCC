import React, { useState, useRef, useEffect } from 'react';
import { Link, NavLink } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import RegisterModal from '../RegisterModal';
import PrayerRequestModal from '../PrayerRequestModal';

export default function Header() {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [prayerOpen, setPrayerOpen] = useState(false);
  const aboutRef = useRef(null);
  const mobileAboutRef = useRef(null);
  const aboutTimeout = useRef(null);

  const navLinks = [
    { to: '/', label: 'Home' },
    { to: '/services', label: 'Services' },
    { to: '/events', label: 'Events' },
    { to: '/give', label: 'Give' },
  ];

  // Close About dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      const inDesktop = aboutRef.current && aboutRef.current.contains(e.target);
      const inMobile = mobileAboutRef.current && mobileAboutRef.current.contains(e.target);
      if (!inDesktop && !inMobile) setAboutOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleAboutEnter = () => {
    clearTimeout(aboutTimeout.current);
    setAboutOpen(true);
  };
  const handleAboutLeave = () => {
    aboutTimeout.current = setTimeout(() => setAboutOpen(false), 200);
  };

  const linkClass = ({ isActive }) =>
    `font-medium transition-colors duration-200 ${isActive ? 'text-sage' : 'text-charcoal hover:text-sage'}`;

  const aboutIsActive = ['/about', '/joy-ladies-circle', '/contact', '/blog'].includes(location.pathname);

  return (
    <>
      <header className="bg-white/95 backdrop-blur-sm shadow-sm sticky top-0 z-40">
        <div className="container-custom">
          <div className="flex items-center justify-between h-20">
            <Link to="/" className="flex items-center gap-3">
              <div className="w-10 h-10 bg-sage rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21V9l9-7 9 7v12H3z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 21V12h6v9" /></svg>
              </div>
              <div>
                <h1 className="text-lg font-bold text-charcoal leading-tight">Open Door</h1>
                <p className="text-xs text-sage font-medium -mt-0.5">Christian Church</p>
              </div>
            </Link>

            <nav className="hidden lg:flex items-center gap-6">
              {navLinks.map(link => (
                <NavLink key={link.to} to={link.to} className={linkClass} end={link.to === '/'} >{link.label}</NavLink>
              ))}

              {/* About dropdown */}
              <div ref={aboutRef} className="relative" onMouseEnter={handleAboutEnter} onMouseLeave={handleAboutLeave}>
                <button
                  onClick={() => setAboutOpen(!aboutOpen)}
                  className={`font-medium transition-colors duration-200 flex items-center gap-1 ${aboutIsActive ? 'text-sage' : 'text-charcoal hover:text-sage'}`}
                >
                  About
                  <svg className={`w-3.5 h-3.5 transition-transform ${aboutOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </button>
                {aboutOpen && (
                  <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-100 py-2 z-50">
                    <NavLink
                      to="/about"
                      onClick={() => setAboutOpen(false)}
                      className={({ isActive }) => `block px-4 py-2 text-sm transition-colors ${isActive ? 'text-sage bg-sage/5 font-medium' : 'text-charcoal hover:text-sage hover:bg-sage/5'}`}
                    >
                      About Us
                    </NavLink>
                    <NavLink
                      to="/joy-ladies-circle"
                      onClick={() => setAboutOpen(false)}
                      className={({ isActive }) => `block px-4 py-2 text-sm transition-colors ${isActive ? 'text-sage bg-sage/5 font-medium' : 'text-charcoal hover:text-sage hover:bg-sage/5'}`}
                    >
                      J.O.Y. Ladies
                    </NavLink>
                    {!user && (
                      <button
                        onClick={() => { setAboutOpen(false); setRegisterOpen(true); }}
                        className="block w-full text-left px-4 py-2 text-sm font-medium text-sage hover:bg-sage/5 transition-colors"
                      >
                        Join Us
                      </button>
                    )}
                    <NavLink
                      to="/contact"
                      onClick={() => setAboutOpen(false)}
                      className={({ isActive }) => `block px-4 py-2 text-sm transition-colors ${isActive ? 'text-sage bg-sage/5 font-medium' : 'text-charcoal hover:text-sage hover:bg-sage/5'}`}
                    >
                      Contact Us
                    </NavLink>
                    <NavLink
                      to="/blog"
                      onClick={() => setAboutOpen(false)}
                      className={({ isActive }) => `block px-4 py-2 text-sm transition-colors ${isActive ? 'text-sage bg-sage/5 font-medium' : 'text-charcoal hover:text-sage hover:bg-sage/5'}`}
                    >
                      Blog
                    </NavLink>
                    <button
                      onClick={() => { setAboutOpen(false); setPrayerOpen(true); }}
                      className="block w-full text-left px-4 py-2 text-sm text-charcoal hover:text-sage hover:bg-sage/5 transition-colors"
                    >
                      Prayer Request
                    </button>
                  </div>
                )}
              </div>

              {user ? (
                <div className="flex items-center gap-3 ml-4">
                  <Link to="/dashboard" className="btn-primary text-sm !py-2 !px-4">Dashboard</Link>
                  <button onClick={logout} className="text-sm text-gray-500 hover:text-charcoal">Logout</button>
                </div>
              ) : (
                <div className="flex items-center gap-3 ml-4">
                  <button onClick={() => setRegisterOpen(true)} className="btn-primary text-sm !py-2 !px-4">Sign Up</button>
                  <Link to="/login" className="text-sm font-medium text-charcoal hover:text-sage">Login</Link>
                </div>
              )}
            </nav>

            <button onClick={() => setMobileOpen(!mobileOpen)} className="lg:hidden p-2">
              <svg className="w-6 h-6 text-charcoal" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {mobileOpen ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /> : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
              </svg>
            </button>
          </div>

          {mobileOpen && (
            <nav className="lg:hidden pb-4 border-t border-gray-100 pt-4">
              <div className="flex flex-col gap-3">
                {navLinks.map(link => (
                  <NavLink key={link.to} to={link.to} className={linkClass} onClick={() => setMobileOpen(false)} end={link.to === '/'} >{link.label}</NavLink>
                ))}

                {/* Mobile About submenu */}
                <div ref={mobileAboutRef}>
                  <button
                    onClick={() => setAboutOpen(!aboutOpen)}
                    className={`font-medium transition-colors duration-200 flex items-center gap-1 w-full ${aboutIsActive ? 'text-sage' : 'text-charcoal hover:text-sage'}`}
                  >
                    About
                    <svg className={`w-3.5 h-3.5 transition-transform ${aboutOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {aboutOpen && (
                    <div className="ml-4 mt-2 flex flex-col gap-2">
                      <NavLink to="/about" className={linkClass} onClick={() => { setMobileOpen(false); setAboutOpen(false); }}>About Us</NavLink>
                      <NavLink to="/joy-ladies-circle" className={linkClass} onClick={() => { setMobileOpen(false); setAboutOpen(false); }}>J.O.Y. Ladies</NavLink>
                      {!user && (
                        <button
                          onClick={() => { setMobileOpen(false); setAboutOpen(false); setRegisterOpen(true); }}
                          className="font-medium transition-colors duration-200 text-sage text-left"
                        >
                          Join Us
                        </button>
                      )}
                      <NavLink to="/contact" className={linkClass} onClick={() => { setMobileOpen(false); setAboutOpen(false); }}>Contact Us</NavLink>
                      <NavLink to="/blog" className={linkClass} onClick={() => { setMobileOpen(false); setAboutOpen(false); }}>Blog</NavLink>
                      <button
                        onClick={() => { setMobileOpen(false); setAboutOpen(false); setPrayerOpen(true); }}
                        className="font-medium transition-colors duration-200 text-charcoal hover:text-sage text-left"
                      >
                        Prayer Request
                      </button>
                    </div>
                  )}
                </div>

                {user ? (
                  <>
                    <Link to="/dashboard" className="btn-primary text-center text-sm" onClick={() => setMobileOpen(false)}>Dashboard</Link>
                    <button onClick={() => { logout(); setMobileOpen(false); }} className="text-sm text-gray-500">Logout</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { setRegisterOpen(true); setMobileOpen(false); }} className="btn-primary text-center text-sm">Sign Up</button>
                    <Link to="/login" className="text-sm font-medium text-charcoal text-center" onClick={() => setMobileOpen(false)}>Login</Link>
                  </>
                )}
              </div>
            </nav>
          )}
        </div>
      </header>

      <RegisterModal isOpen={registerOpen} onClose={() => setRegisterOpen(false)} />
      <PrayerRequestModal isOpen={prayerOpen} onClose={() => setPrayerOpen(false)} />
    </>
  );
}