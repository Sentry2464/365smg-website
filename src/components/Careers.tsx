'use client'

import { motion } from 'framer-motion'
import { Briefcase, ArrowRight, ShieldCheck, Clock, TrendingUp, Heart } from 'lucide-react'
import { fadeInUp, staggerContainer, staggerItem } from '@/lib/animations'

const benefits = [
  { icon: ShieldCheck, label: 'Full Training Provided', description: 'State-certified courses included' },
  { icon: Clock, label: 'Flexible Schedules', description: 'Day, evening & overnight shifts' },
  { icon: TrendingUp, label: 'Career Growth', description: 'Advance to supervisor & management' },
  { icon: Heart, label: 'Family Culture', description: 'We treat our officers like family' },
]

export function Careers() {
  return (
    <section id="careers" className="py-24 bg-[#0F1628] relative overflow-hidden">
      {/* Background accent */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(201,162,39,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(201,162,39,0.03)_1px,transparent_1px)] bg-[size:40px_40px]" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0F1628] via-transparent to-[#0F1628]" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Banner */}
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          className="bg-gradient-to-r from-[#C9A227] to-[#E5C55A] rounded-3xl p-10 md:p-14 mb-12 relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.1)_1px,transparent_1px)] bg-[size:30px_30px]" />
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <Briefcase className="w-6 h-6 text-black/70" />
                <span className="text-black/70 text-xs font-bold tracking-[0.3em] uppercase">We&apos;re Hiring</span>
              </div>
              <h2 className="font-heading text-5xl md:text-6xl text-black leading-none mb-3">
                JOIN OUR TEAM
              </h2>
              <p className="text-black/70 text-base max-w-xl">
                365 Security Management Group is always seeking talented, dedicated individuals to grow with our team across Florida.
              </p>
            </div>
            <a
              href="#contact"
              className="group flex-shrink-0 flex items-center gap-2 bg-black hover:bg-[#0F1628] text-white font-bold px-8 py-4 rounded-full transition-all duration-300 text-sm"
            >
              Apply Now
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </a>
          </div>
        </motion.div>

        {/* Benefits grid */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          {benefits.map((b) => {
            const Icon = b.icon
            return (
              <motion.div
                key={b.label}
                variants={staggerItem}
                className="bg-[#141D2E] border border-[#1E293B] hover:border-[#C9A227]/30 rounded-2xl p-6 text-center transition-all duration-300 group"
              >
                <div className="w-12 h-12 rounded-xl bg-[#C9A227]/10 flex items-center justify-center mx-auto mb-4 group-hover:bg-[#C9A227]/20 transition-colors">
                  <Icon className="w-6 h-6 text-[#C9A227]" strokeWidth={1.5} />
                </div>
                <h4 className="text-white font-bold text-sm mb-1">{b.label}</h4>
                <p className="text-gray-500 text-xs">{b.description}</p>
              </motion.div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}
