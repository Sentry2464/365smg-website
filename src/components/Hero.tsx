'use client'

import { motion } from 'framer-motion'
import { Shield, ArrowRight, Phone, ChevronDown } from 'lucide-react'
import Link from 'next/link'
import { staggerContainer, fadeInUp } from '@/lib/animations'

export function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-[#0A0E1A]">
      {/* Grid background */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(rgba(201,162,39,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(201,162,39,0.06) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />
      {/* Radial glow */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(201,162,39,0.08) 0%, transparent 70%)' }} />
      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-[#0A0E1A] to-transparent" />

      <div className="relative z-10 text-center px-4 max-w-6xl mx-auto w-full pt-24">
        {/* Shield icon */}
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: [0.34, 1.56, 0.64, 1] }}
          className="flex justify-center mb-8"
        >
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-[#C9A227]/10 blur-2xl scale-150 animate-pulse" />
            <Shield className="w-20 h-20 md:w-24 md:h-24 text-[#C9A227] relative drop-shadow-[0_0_20px_rgba(201,162,39,0.5)]" strokeWidth={1.2} />
          </div>
        </motion.div>

        {/* Pre-title */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="text-[#C9A227] text-xs md:text-sm tracking-[0.35em] uppercase font-medium mb-6"
        >
          Florida&apos;s Premier Security Agency · Lic. B1400302 / DS1900071
        </motion.p>

        {/* Main headline */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="mb-6"
        >
          <motion.h1
            variants={fadeInUp}
            className="font-heading text-[clamp(4rem,14vw,12rem)] text-white leading-[0.9] tracking-wide"
          >
            365
          </motion.h1>
          <motion.h1
            variants={fadeInUp}
            className="font-heading text-[clamp(2.5rem,9vw,8rem)] text-[#C9A227] leading-[0.9] tracking-wide"
          >
            SECURITY
          </motion.h1>
          <motion.h1
            variants={fadeInUp}
            className="font-heading text-[clamp(1.5rem,5vw,4.5rem)] text-white/80 leading-[1.1] tracking-widest"
          >
            MANAGEMENT GROUP
          </motion.h1>
        </motion.div>

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.7 }}
          className="text-gray-400 text-base md:text-lg max-w-2xl mx-auto mb-10 leading-relaxed"
        >
          Competent, trustworthy, and reliable security solutions for Florida&apos;s communities, businesses, and institutions.
        </motion.p>

        {/* CTA buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.9 }}
          className="flex flex-col sm:flex-row gap-4 justify-center items-center"
        >
          <Link
            href="#contact"
            className="group flex items-center gap-2 bg-[#C9A227] hover:bg-[#E5C55A] text-black font-bold px-8 py-4 rounded-full text-base transition-all duration-300 hover:shadow-[0_0_30px_rgba(201,162,39,0.5)] hover:-translate-y-0.5"
          >
            Get a Free Quote
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link
            href="#services"
            className="group flex items-center gap-2 border border-[#C9A227]/40 hover:border-[#C9A227] text-white hover:text-[#C9A227] font-semibold px-8 py-4 rounded-full text-base transition-all duration-300 hover:-translate-y-0.5"
          >
            <Shield className="w-4 h-4" />
            Our Services
          </Link>
          <Link
            href="tel:+14070000000"
            className="flex items-center gap-2 text-gray-400 hover:text-[#C9A227] text-base transition-colors duration-200"
          >
            <Phone className="w-4 h-4" />
            (407) 000-0000
          </Link>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4, duration: 0.5 }}
          className="flex justify-center mt-16"
        >
          <Link href="#stats" className="flex flex-col items-center gap-2 text-gray-600 hover:text-[#C9A227] transition-colors group">
            <span className="text-xs tracking-widest uppercase">Scroll</span>
            <ChevronDown className="w-4 h-4 animate-bounce" />
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
