'use client'

import { motion } from 'framer-motion'
import { ShieldCheck, Globe, Building2, Users } from 'lucide-react'
import { staggerContainer, staggerItem, fadeInUp } from '@/lib/animations'

const partnerships = [
  { icon: Building2, label: 'Federal Agencies', description: 'Contracted security services' },
  { icon: Globe, label: 'State of Florida', description: 'Licensed & certified provider' },
  { icon: ShieldCheck, label: 'Local Government', description: 'Municipal partnerships' },
  { icon: Users, label: 'Public Institutions', description: 'Schools & public facilities' },
]

export function Government() {
  return (
    <section id="government" className="py-24 bg-[#0A0E1A] relative overflow-hidden">
      {/* Background accents */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-[#C9A227]/3 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-[#C9A227]/3 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          className="text-center mb-16"
        >
          <p className="text-[#C9A227] text-xs tracking-[0.35em] uppercase font-medium mb-4">
            Trusted Partners
          </p>
          <h2 className="font-heading text-5xl md:text-7xl text-white mb-5">
            GOVERNMENT<br />
            <span className="text-[#C9A227]">PARTNERSHIPS</span>
          </h2>
          <div className="w-16 h-0.5 bg-[#C9A227] mx-auto mb-6" />
          <p className="text-gray-400 max-w-xl mx-auto text-base leading-relaxed">
            365 Security Management Group works closely with government agencies and public institutions across the State of Florida.
          </p>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16"
        >
          {partnerships.map((p) => {
            const Icon = p.icon
            return (
              <motion.div
                key={p.label}
                variants={staggerItem}
                className="group bg-[#141D2E] border border-[#1E293B] hover:border-[#C9A227]/30 rounded-2xl p-8 text-center transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.3)]"
              >
                <div className="w-14 h-14 rounded-2xl bg-[#C9A227]/10 flex items-center justify-center mx-auto mb-4 group-hover:bg-[#C9A227]/20 transition-colors">
                  <Icon className="w-7 h-7 text-[#C9A227]" strokeWidth={1.2} />
                </div>
                <h3 className="text-white font-bold text-sm mb-1">{p.label}</h3>
                <p className="text-gray-500 text-xs">{p.description}</p>
              </motion.div>
            )
          })}
        </motion.div>

        {/* Government section CTA banner */}
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          className="bg-gradient-to-r from-[#141D2E] to-[#0F1628] border border-[#C9A227]/20 rounded-3xl p-10 text-center"
        >
          <ShieldCheck className="w-12 h-12 text-[#C9A227] mx-auto mb-4" strokeWidth={1.2} />
          <h3 className="font-heading text-3xl md:text-4xl text-white mb-3">
            GOVERNMENT CONTRACT READY
          </h3>
          <p className="text-gray-400 max-w-lg mx-auto text-sm leading-relaxed mb-6">
            365 SMG is fully licensed, bonded, and insured to fulfill government and public sector security contracts across the State of Florida.
          </p>
          <a
            href="#contact"
            className="inline-flex items-center gap-2 bg-[#C9A227] hover:bg-[#E5C55A] text-black font-bold px-8 py-3 rounded-full transition-all duration-300 hover:shadow-[0_0_20px_rgba(201,162,39,0.4)] text-sm"
          >
            Request Government Proposal
          </a>
        </motion.div>
      </div>
    </section>
  )
}
