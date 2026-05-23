'use client'

import { motion } from 'framer-motion'
import { Shield, Share2, Camera, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { fadeInUp } from '@/lib/animations'

const footerLinks = {
  Services: [
    'AI Surveillance',
    'School Security',
    'Loss Prevention',
    'Events Security',
    'Armed & Unarmed Guards',
    'Residential Security',
    'Virtual Guard & Monitoring',
  ],
  Company: ['About Us', 'Vision & Mission', 'Government', '365 Academy Group', 'Careers', 'Blog'],
  Legal: ['Privacy Notice', 'Terms of Service', 'Licensing Info'],
}

export function Footer() {
  return (
    <footer className="bg-[#060912] border-t border-[#1E293B]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main footer */}
        <div className="py-16 grid grid-cols-2 md:grid-cols-5 gap-10">
          {/* Brand */}
          <motion.div
            variants={fadeInUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="col-span-2"
          >
            <Link href="/" className="flex items-center gap-3 mb-4 group">
              <Shield className="w-10 h-10 text-[#C9A227]" strokeWidth={1.2} />
              <div className="flex flex-col leading-none">
                <span className="text-white font-bold tracking-wider">365 SECURITY</span>
                <span className="text-[#C9A227] text-[10px] tracking-[0.25em] font-medium">MANAGEMENT GROUP</span>
              </div>
            </Link>
            <p className="text-gray-500 text-sm leading-relaxed max-w-xs mb-6">
              Florida&apos;s premier security management agency — protecting communities, businesses, and institutions with excellence since day one.
            </p>

            {/* Social */}
            <div className="flex gap-3 mb-6">
              <a
                href="#"
                className="w-9 h-9 rounded-full border border-[#1E293B] hover:border-[#C9A227]/40 flex items-center justify-center text-gray-500 hover:text-[#C9A227] transition-all"
                aria-label="Facebook"
              >
                <Share2 className="w-4 h-4" />
              </a>
              <a
                href="#"
                className="w-9 h-9 rounded-full border border-[#1E293B] hover:border-[#C9A227]/40 flex items-center justify-center text-gray-500 hover:text-[#C9A227] transition-all"
                aria-label="Instagram"
              >
                <Camera className="w-4 h-4" />
              </a>
            </div>

            {/* Spanish version link */}
            <a
              href="#"
              className="inline-flex items-center gap-1.5 text-gray-500 hover:text-[#C9A227] text-xs transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Versión en Español (Bienvenidos)
            </a>
          </motion.div>

          {/* Links */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <motion.div
              key={category}
              variants={fadeInUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
            >
              <h4 className="text-white font-bold text-xs tracking-[0.2em] uppercase mb-5">{category}</h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-gray-500 hover:text-[#C9A227] text-sm transition-colors duration-200"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="border-t border-[#1E293B] py-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-gray-600 text-xs text-center md:text-left">
            © {new Date().getFullYear()} 365 Security Management Group. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-[#C9A227]/60" strokeWidth={1.5} />
              <span className="text-gray-600 text-xs">Lic. B1400302</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-[#C9A227]/60" strokeWidth={1.5} />
              <span className="text-gray-600 text-xs">Lic. DS1900071</span>
            </div>
            <span className="text-gray-600 text-xs">State of Florida</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
