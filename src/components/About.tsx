'use client'

import { motion } from 'framer-motion'
import { Shield, Eye, Target, Award } from 'lucide-react'
import { fadeInLeft, fadeInRight, staggerContainer, staggerItem } from '@/lib/animations'

const pillars = [
  { icon: Eye, title: 'Prevention First', description: 'We emphasize prevention and protection over detection and apprehension.' },
  { icon: Target, title: 'Precision Service', description: 'Every assignment handled with meticulous attention to detail, exceeding expectations.' },
  { icon: Award, title: 'Licensed & Trusted', description: 'Fully licensed under B1400302 & DS1900071 — Florida-certified excellence.' },
  { icon: Shield, title: 'Family Values', description: 'We serve clients as true partners and treat our employees like family.' },
]

export function About() {
  return (
    <section id="about" className="py-24 bg-[#0F1628]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left: Text */}
          <motion.div
            variants={fadeInLeft}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
          >
            <p className="text-[#C9A227] text-xs tracking-[0.35em] uppercase font-medium mb-4">Who We Are</p>
            <h2 className="font-heading text-5xl md:text-6xl text-white mb-6 leading-none">
              ABOUT<br />
              <span className="text-[#C9A227]">365 SMG</span>
            </h2>
            <div className="w-12 h-0.5 bg-[#C9A227] mb-8" />

            {/* Vision */}
            <div className="mb-8">
              <h3 className="text-white font-bold text-sm tracking-widest uppercase mb-3 flex items-center gap-2">
                <span className="w-4 h-px bg-[#C9A227]" />
                Our Vision
              </h3>
              <p className="text-gray-400 leading-relaxed">
                To become <span className="text-white font-medium">Florida&apos;s highest-quality, most dependable security agency</span> — serving as a true partner to every client, treating every officer as family.
              </p>
            </div>

            {/* Mission */}
            <div className="mb-8 bg-[#141D2E] border border-[#C9A227]/20 rounded-2xl p-6">
              <h3 className="text-white font-bold text-sm tracking-widest uppercase mb-3 flex items-center gap-2">
                <span className="w-4 h-px bg-[#C9A227]" />
                Our Mission
              </h3>
              <p className="text-gray-300 leading-relaxed italic">
                &ldquo;Provide safe environments for customers through highly trained personnel who handle every assignment with meticulous attention to detail, striving to exceed expectations.&rdquo;
              </p>
            </div>

            {/* Licenses */}
            <div className="flex gap-4 flex-wrap">
              <div className="flex items-center gap-2 bg-[#141D2E] border border-[#1E293B] rounded-full px-4 py-2">
                <Shield className="w-3.5 h-3.5 text-[#C9A227]" />
                <span className="text-gray-300 text-xs font-medium">Lic. B1400302</span>
              </div>
              <div className="flex items-center gap-2 bg-[#141D2E] border border-[#1E293B] rounded-full px-4 py-2">
                <Shield className="w-3.5 h-3.5 text-[#C9A227]" />
                <span className="text-gray-300 text-xs font-medium">Lic. DS1900071</span>
              </div>
              <div className="flex items-center gap-2 bg-[#141D2E] border border-[#1E293B] rounded-full px-4 py-2">
                <span className="text-gray-300 text-xs font-medium">Estado de Florida</span>
              </div>
            </div>
          </motion.div>

          {/* Right: Pillars */}
          <motion.div
            variants={fadeInRight}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
          >
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-80px' }}
              className="grid grid-cols-1 sm:grid-cols-2 gap-4"
            >
              {pillars.map((pillar) => {
                const Icon = pillar.icon
                return (
                  <motion.div
                    key={pillar.title}
                    variants={staggerItem}
                    className="bg-[#141D2E] border border-[#1E293B] hover:border-[#C9A227]/30 rounded-2xl p-6 transition-all duration-300 group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[#C9A227]/10 flex items-center justify-center mb-4 group-hover:bg-[#C9A227]/20 transition-colors">
                      <Icon className="w-5 h-5 text-[#C9A227]" strokeWidth={1.5} />
                    </div>
                    <h4 className="text-white font-bold text-sm mb-2">{pillar.title}</h4>
                    <p className="text-gray-500 text-xs leading-relaxed">{pillar.description}</p>
                  </motion.div>
                )
              })}
            </motion.div>

            {/* Tagline card */}
            <motion.div
              variants={staggerItem}
              className="mt-4 bg-gradient-to-r from-[#C9A227]/10 to-[#C9A227]/5 border border-[#C9A227]/20 rounded-2xl p-6"
            >
              <p className="text-[#C9A227] font-heading text-2xl leading-snug">
                &ldquo;If you need competent, trustworthy and reliable security — 365 Security Management is the answer.&rdquo;
              </p>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
