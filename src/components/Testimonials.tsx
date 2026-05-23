'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Quote, ChevronLeft, ChevronRight, Star } from 'lucide-react'
import { fadeInUp } from '@/lib/animations'

const testimonials = [
  {
    quote: 'Personnel from 365 Security Management Group emphasize prevention and protection over detection and apprehension — a philosophy that has transformed the safety of our community.',
    author: 'Community Manager',
    role: 'Royal Cypress Preserve, Orlando FL',
    rating: 5,
  },
  {
    quote: 'The professionalism and attention to detail from the 365 SMG team exceeded our expectations. Their officers are well-trained, courteous, and proactive.',
    author: 'Event Coordinator',
    role: 'Special Events, Central Florida',
    rating: 5,
  },
  {
    quote: '365 Security Management Group has been an outstanding partner for our facility. Their 24/7 monitoring and rapid response capabilities give us complete peace of mind.',
    author: 'Facilities Director',
    role: 'Commercial Property, Orlando FL',
    rating: 5,
  },
]

export function Testimonials() {
  const [current, setCurrent] = useState(0)

  const prev = () => setCurrent((c) => (c === 0 ? testimonials.length - 1 : c - 1))
  const next = () => setCurrent((c) => (c === testimonials.length - 1 ? 0 : c + 1))

  return (
    <section id="testimonials" className="py-24 bg-[#0A0E1A]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          className="text-center mb-16"
        >
          <p className="text-[#C9A227] text-xs tracking-[0.35em] uppercase font-medium mb-4">Client Feedback</p>
          <h2 className="font-heading text-5xl md:text-7xl text-white mb-5">TESTIMONIALS</h2>
          <div className="w-16 h-0.5 bg-[#C9A227] mx-auto" />
        </motion.div>

        <div className="relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={current}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className="bg-[#141D2E] border border-[#1E293B] rounded-3xl p-10 md:p-14 text-center relative overflow-hidden"
            >
              {/* Glow */}
              <div className="absolute inset-0 bg-gradient-to-b from-[#C9A227]/3 to-transparent rounded-3xl" />

              <Quote className="w-10 h-10 text-[#C9A227]/30 mx-auto mb-6 relative" />

              {/* Stars */}
              <div className="flex justify-center gap-1 mb-6 relative">
                {Array.from({ length: testimonials[current].rating }).map((_, i) => (
                  <Star key={i} className="w-4 h-4 text-[#C9A227] fill-[#C9A227]" />
                ))}
              </div>

              <blockquote className="text-gray-300 text-lg md:text-xl leading-relaxed italic mb-8 relative">
                &ldquo;{testimonials[current].quote}&rdquo;
              </blockquote>

              <div className="relative">
                <div className="w-8 h-px bg-[#C9A227]/50 mx-auto mb-4" />
                <p className="text-white font-bold text-sm">{testimonials[current].author}</p>
                <p className="text-gray-500 text-xs mt-0.5">{testimonials[current].role}</p>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Navigation */}
          <div className="flex items-center justify-center gap-6 mt-8">
            <button
              onClick={prev}
              className="w-10 h-10 rounded-full border border-[#1E293B] hover:border-[#C9A227]/40 flex items-center justify-center text-gray-500 hover:text-[#C9A227] transition-all duration-200"
              aria-label="Previous testimonial"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex gap-2">
              {testimonials.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrent(i)}
                  className={`transition-all duration-300 rounded-full ${
                    i === current ? 'w-6 h-2 bg-[#C9A227]' : 'w-2 h-2 bg-[#1E293B] hover:bg-[#C9A227]/40'
                  }`}
                  aria-label={`Go to testimonial ${i + 1}`}
                />
              ))}
            </div>

            <button
              onClick={next}
              className="w-10 h-10 rounded-full border border-[#1E293B] hover:border-[#C9A227]/40 flex items-center justify-center text-gray-500 hover:text-[#C9A227] transition-all duration-200"
              aria-label="Next testimonial"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* CTA to leave review */}
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          className="text-center mt-12"
        >
          <p className="text-gray-500 text-sm mb-3">Happy with our services?</p>
          <a
            href="#contact"
            className="text-[#C9A227] hover:text-[#E5C55A] text-sm font-medium underline underline-offset-4 transition-colors"
          >
            Share your experience →
          </a>
        </motion.div>
      </div>
    </section>
  )
}
