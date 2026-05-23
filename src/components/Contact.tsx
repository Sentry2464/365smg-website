'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Send, Phone, Mail, MapPin, CheckCircle } from 'lucide-react'
import { fadeInLeft, fadeInRight } from '@/lib/animations'

const services = [
  'AI Surveillance (Sentry365)',
  'School Security',
  'Loss Prevention',
  'Events Security',
  'Construction Security',
  'Armed & Unarmed Guards',
  'Residential Communities',
  'Bar/Nightclub Security',
  'Emergency Response',
  'Virtual Guard & Monitoring',
  '365 Academy Group',
  'Government Contract',
]

export function Contact() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', service: '', message: '' })
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    // Placeholder — connect to your preferred form handler (Formspree, EmailJS, etc.)
    await new Promise((r) => setTimeout(r, 1200))
    setLoading(false)
    setSubmitted(true)
  }

  return (
    <section id="contact" className="py-24 bg-[#0A0E1A]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7 }}
          className="text-center mb-16"
        >
          <p className="text-[#C9A227] text-xs tracking-[0.35em] uppercase font-medium mb-4">Reach Out</p>
          <h2 className="font-heading text-5xl md:text-7xl text-white mb-5">CONTACT US</h2>
          <div className="w-16 h-0.5 bg-[#C9A227] mx-auto mb-6" />
          <p className="text-gray-400 max-w-xl mx-auto text-base">
            Ready to secure your property, event, or community? Get in touch for a free consultation.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-5 gap-10">
          {/* Left: Info */}
          <motion.div
            variants={fadeInLeft}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            className="lg:col-span-2 space-y-6"
          >
            <div className="bg-[#141D2E] border border-[#1E293B] rounded-2xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#C9A227]/10 flex items-center justify-center flex-shrink-0">
                  <Phone className="w-5 h-5 text-[#C9A227]" strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-white font-bold text-sm mb-1">Phone</p>
                  <a href="tel:+14070000000" className="text-gray-400 hover:text-[#C9A227] text-sm transition-colors">
                    (407) 000-0000
                  </a>
                </div>
              </div>
            </div>

            <div className="bg-[#141D2E] border border-[#1E293B] rounded-2xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#C9A227]/10 flex items-center justify-center flex-shrink-0">
                  <Mail className="w-5 h-5 text-[#C9A227]" strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-white font-bold text-sm mb-1">Email</p>
                  <a href="mailto:info@365securitymg.com" className="text-gray-400 hover:text-[#C9A227] text-sm transition-colors break-all">
                    info@365securitymg.com
                  </a>
                </div>
              </div>
            </div>

            <div className="bg-[#141D2E] border border-[#1E293B] rounded-2xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#C9A227]/10 flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-5 h-5 text-[#C9A227]" strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-white font-bold text-sm mb-1">Service Area</p>
                  <p className="text-gray-400 text-sm">State of Florida</p>
                  <p className="text-gray-500 text-xs mt-1">Central Florida headquarters</p>
                </div>
              </div>
            </div>

            {/* Social */}
            <div className="bg-[#141D2E] border border-[#1E293B] rounded-2xl p-6">
              <p className="text-white font-bold text-sm mb-4">Follow Us</p>
              <div className="flex gap-3">
                <a
                  href="#"
                  className="flex-1 flex items-center justify-center gap-2 border border-[#1E293B] hover:border-[#C9A227]/40 rounded-xl py-3 text-gray-400 hover:text-[#C9A227] text-xs font-medium transition-all"
                >
                  Facebook
                </a>
                <a
                  href="#"
                  className="flex-1 flex items-center justify-center gap-2 border border-[#1E293B] hover:border-[#C9A227]/40 rounded-xl py-3 text-gray-400 hover:text-[#C9A227] text-xs font-medium transition-all"
                >
                  Instagram
                </a>
              </div>
            </div>

            {/* License badge */}
            <div className="bg-gradient-to-br from-[#C9A227]/10 to-transparent border border-[#C9A227]/20 rounded-2xl p-6">
              <p className="text-[#C9A227] font-bold text-xs tracking-widest uppercase mb-2">Licensed & Insured</p>
              <p className="text-gray-400 text-xs">Agency License: B1400302</p>
              <p className="text-gray-400 text-xs">Instructor License: DS1900071</p>
              <p className="text-gray-500 text-xs mt-2">State of Florida, Department of Agriculture & Consumer Services</p>
            </div>
          </motion.div>

          {/* Right: Form */}
          <motion.div
            variants={fadeInRight}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            className="lg:col-span-3"
          >
            <div className="bg-[#141D2E] border border-[#1E293B] rounded-3xl p-8 md:p-10">
              {submitted ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center py-16 text-center"
                >
                  <CheckCircle className="w-16 h-16 text-[#C9A227] mb-6" strokeWidth={1} />
                  <h3 className="font-heading text-3xl text-white mb-3">MESSAGE SENT!</h3>
                  <p className="text-gray-400 text-sm max-w-sm">
                    Thank you for reaching out. A member of our team will contact you within 24 hours.
                  </p>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <h3 className="font-heading text-2xl text-white mb-6">GET A FREE QUOTE</h3>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-gray-400 text-xs font-medium mb-2 tracking-wider uppercase">Full Name *</label>
                      <input
                        type="text"
                        required
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className="w-full bg-[#0F1628] border border-[#1E293B] focus:border-[#C9A227]/50 focus:outline-none rounded-xl px-4 py-3 text-white text-sm placeholder:text-gray-600 transition-colors"
                        placeholder="John Smith"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-400 text-xs font-medium mb-2 tracking-wider uppercase">Phone</label>
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        className="w-full bg-[#0F1628] border border-[#1E293B] focus:border-[#C9A227]/50 focus:outline-none rounded-xl px-4 py-3 text-white text-sm placeholder:text-gray-600 transition-colors"
                        placeholder="(407) 000-0000"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-gray-400 text-xs font-medium mb-2 tracking-wider uppercase">Email Address *</label>
                    <input
                      type="email"
                      required
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="w-full bg-[#0F1628] border border-[#1E293B] focus:border-[#C9A227]/50 focus:outline-none rounded-xl px-4 py-3 text-white text-sm placeholder:text-gray-600 transition-colors"
                      placeholder="john@example.com"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-400 text-xs font-medium mb-2 tracking-wider uppercase">Service Needed</label>
                    <select
                      value={form.service}
                      onChange={(e) => setForm({ ...form, service: e.target.value })}
                      className="w-full bg-[#0F1628] border border-[#1E293B] focus:border-[#C9A227]/50 focus:outline-none rounded-xl px-4 py-3 text-sm transition-colors text-white"
                    >
                      <option value="" className="text-gray-600">Select a service...</option>
                      {services.map((s) => (
                        <option key={s} value={s} className="bg-[#141D2E]">{s}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-gray-400 text-xs font-medium mb-2 tracking-wider uppercase">Message *</label>
                    <textarea
                      required
                      rows={4}
                      value={form.message}
                      onChange={(e) => setForm({ ...form, message: e.target.value })}
                      className="w-full bg-[#0F1628] border border-[#1E293B] focus:border-[#C9A227]/50 focus:outline-none rounded-xl px-4 py-3 text-white text-sm placeholder:text-gray-600 transition-colors resize-none"
                      placeholder="Tell us about your security needs..."
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="group w-full flex items-center justify-center gap-3 bg-[#C9A227] hover:bg-[#E5C55A] disabled:opacity-60 text-black font-bold px-8 py-4 rounded-xl transition-all duration-300 hover:shadow-[0_0_25px_rgba(201,162,39,0.4)] text-sm"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                        Sending...
                      </span>
                    ) : (
                      <>
                        Send Message
                        <Send className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
