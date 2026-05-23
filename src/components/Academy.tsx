'use client'

import { motion } from 'framer-motion'
import { GraduationCap, BookOpen, Award, Users, ArrowRight } from 'lucide-react'
import { fadeInLeft, fadeInRight, staggerContainer, staggerItem } from '@/lib/animations'

const programs = [
  { icon: BookOpen, title: 'Security Officer Certification', description: 'State-mandated training and licensing preparation' },
  { icon: Award, title: 'Advanced Guard Training', description: 'Tactical skills, de-escalation, and emergency protocols' },
  { icon: Users, title: 'Leadership Development', description: 'Supervisory and management track for senior officers' },
  { icon: GraduationCap, title: 'Continuing Education', description: 'Ongoing professional development and re-certification' },
]

export function Academy() {
  return (
    <section id="academy" className="py-24 bg-[#0F1628] relative overflow-hidden">
      {/* Decorative element */}
      <div className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-[#C9A227]/3 to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left: Programs */}
          <motion.div
            variants={fadeInLeft}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
          >
            <p className="text-[#C9A227] text-xs tracking-[0.35em] uppercase font-medium mb-4">Training & Education</p>
            <h2 className="font-heading text-5xl md:text-6xl text-white mb-4 leading-none">
              365 ACADEMY<br />
              <span className="text-[#C9A227]">GROUP</span>
            </h2>
            <div className="w-12 h-0.5 bg-[#C9A227] mb-8" />
            <p className="text-gray-400 leading-relaxed mb-10">
              The 365 Academy Group is our dedicated training division — developing the next generation of security professionals through rigorous, Florida-certified programs.
            </p>

            <motion.div
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-80px' }}
              className="space-y-4"
            >
              {programs.map((program) => {
                const Icon = program.icon
                return (
                  <motion.div
                    key={program.title}
                    variants={staggerItem}
                    className="flex items-start gap-4 bg-[#141D2E] border border-[#1E293B] hover:border-[#C9A227]/30 rounded-xl p-4 transition-all duration-300 group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-[#C9A227]/10 flex items-center justify-center flex-shrink-0 group-hover:bg-[#C9A227]/20 transition-colors">
                      <Icon className="w-5 h-5 text-[#C9A227]" strokeWidth={1.5} />
                    </div>
                    <div>
                      <h4 className="text-white font-bold text-sm mb-0.5">{program.title}</h4>
                      <p className="text-gray-500 text-xs">{program.description}</p>
                    </div>
                  </motion.div>
                )
              })}
            </motion.div>
          </motion.div>

          {/* Right: CTA card */}
          <motion.div
            variants={fadeInRight}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
          >
            <div className="relative bg-gradient-to-br from-[#141D2E] to-[#0A0E1A] border border-[#C9A227]/20 rounded-3xl p-10 overflow-hidden">
              {/* BG glow */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-[#C9A227]/5 rounded-full blur-3xl -translate-y-1/3 translate-x-1/3" />

              <GraduationCap className="w-16 h-16 text-[#C9A227] mb-6 relative" strokeWidth={1} />

              <h3 className="font-heading text-4xl text-white mb-4 relative">
                LAUNCH YOUR<br />
                <span className="text-[#C9A227]">SECURITY CAREER</span>
              </h3>

              <p className="text-gray-400 text-sm leading-relaxed mb-8 relative">
                Join the 365 Academy Group and receive world-class training from experienced security professionals. Upon completion, graduates are first-considered for positions with 365 SMG.
              </p>

              <div className="space-y-3 mb-8 relative">
                {['Florida State Certified Curriculum', 'Hands-on Field Training', 'Job Placement Assistance', 'Bilingual Programs Available'].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#C9A227] flex-shrink-0" />
                    <span className="text-gray-300 text-sm">{item}</span>
                  </div>
                ))}
              </div>

              <a
                href="#contact"
                className="group inline-flex items-center gap-2 bg-[#C9A227] hover:bg-[#E5C55A] text-black font-bold px-6 py-3 rounded-full transition-all duration-300 text-sm hover:shadow-[0_0_20px_rgba(201,162,39,0.4)] relative"
              >
                Enroll Today
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </a>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
