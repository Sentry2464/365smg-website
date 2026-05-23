'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, Menu, X } from 'lucide-react'
import Link from 'next/link'

const navLinks = [
  { label: 'Services', href: '#services' },
  { label: 'About', href: '#about' },
  { label: 'Government', href: '#government' },
  { label: 'Academy', href: '#academy' },
  { label: 'Careers', href: '#careers' },
  { label: 'Contact', href: '#contact' },
]

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <motion.header
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? 'bg-[#0A0E1A]/95 backdrop-blur-xl border-b border-[#C9A227]/10 shadow-lg shadow-black/20'
          : 'bg-transparent'
      }`}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between py-4">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="relative">
            <Shield
              className="w-9 h-9 text-[#C9A227] transition-all duration-300 group-hover:scale-110 group-hover:drop-shadow-[0_0_8px_rgba(201,162,39,0.6)]"
              strokeWidth={1.5}
            />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-white font-bold text-sm tracking-wider">365 SECURITY</span>
            <span className="text-[#C9A227] text-[10px] tracking-[0.25em] font-medium">MANAGEMENT GROUP</span>
          </div>
        </Link>

        <div className="hidden md:flex items-center gap-7">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-gray-400 hover:text-[#C9A227] text-sm font-medium transition-colors duration-200 relative group"
            >
              {link.label}
              <span className="absolute -bottom-0.5 left-0 w-0 h-px bg-[#C9A227] transition-all duration-300 group-hover:w-full" />
            </Link>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link
            href="tel:+1-407-000-0000"
            className="text-gray-400 hover:text-white text-sm transition-colors duration-200"
          >
            (407) 000-0000
          </Link>
          <Link
            href="#contact"
            className="bg-[#C9A227] hover:bg-[#E5C55A] text-black font-bold text-sm px-5 py-2.5 rounded-full transition-all duration-200 hover:shadow-[0_0_20px_rgba(201,162,39,0.4)]"
          >
            Get a Quote
          </Link>
        </div>

        <button
          className="md:hidden text-gray-400 hover:text-white p-2 transition-colors"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </nav>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="md:hidden bg-[#0F1628]/98 backdrop-blur-xl border-t border-[#1E293B] overflow-hidden"
          >
            <div className="px-4 py-5 flex flex-col gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-gray-300 hover:text-[#C9A227] font-medium py-3 px-2 transition-colors border-b border-[#1E293B]/50"
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <Link
                href="#contact"
                className="bg-[#C9A227] text-black font-bold px-5 py-3 rounded-full text-center mt-4"
                onClick={() => setMobileOpen(false)}
              >
                Get a Quote
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  )
}
