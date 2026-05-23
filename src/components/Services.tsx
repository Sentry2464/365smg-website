'use client'

import { motion } from 'framer-motion'
import { Brain, BookOpen, ShoppingBag, Calendar, Building, ShieldCheck, Home, Music, AlertTriangle, Monitor } from 'lucide-react'
import { staggerContainer, staggerItem } from '@/lib/animations'

const services = [
  {
    icon: Brain,
    title: 'AI Surveillance',
    subtitle: 'Sentry365',
    description: 'Next-generation AI-powered surveillance technology providing intelligent monitoring and threat detection.',
    color: '#C9A227',
  },
  {
    icon: BookOpen,
    title: 'School Security',
    subtitle: 'Education Campuses',
    description: 'Dedicated security officers trained specifically for K-12 and university campus environments.',
    color: '#3B82F6',
  },
  {
    icon: ShoppingBag,
    title: 'Loss Prevention',
    subtitle: 'Retail & Commercial',
    description: 'Advanced fraud detection and loss prevention services for retail and commercial real estate.',
    color: '#8B5CF6',
  },
  {
    icon: Calendar,
    title: 'Events Security',
    subtitle: 'Concerts & Special Events',
    description: 'Professional event security management for concerts, festivals, and large-scale gatherings.',
    color: '#EC4899',
  },
  {
    icon: Building,
    title: 'Construction Security',
    subtitle: 'Worksites',
    description: 'Protecting construction sites, equipment, and personnel around the clock.',
    color: '#F97316',
  },
  {
    icon: ShieldCheck,
    title: 'Armed & Unarmed Guards',
    subtitle: 'Guard & Patrol',
    description: 'Highly trained armed and unarmed security personnel for any environment or threat level.',
    color: '#C9A227',
  },
  {
    icon: Home,
    title: 'Residential Communities',
    subtitle: 'Gated Communities & HOAs',
    description: 'Comprehensive security solutions for residential communities, gate access, and patrol.',
    color: '#10B981',
  },
  {
    icon: Music,
    title: 'Bar & Nightclub Security',
    subtitle: 'Entertainment Venues',
    description: 'Specialized security with fraud detection technology for bars, clubs, and entertainment venues.',
    color: '#6366F1',
  },
  {
    icon: AlertTriangle,
    title: 'Emergency Response',
    subtitle: 'Disaster Recovery',
    description: 'Rapid emergency response and disaster recovery services for critical situations.',
    color: '#EF4444',
  },
  {
    icon: Monitor,
    title: 'Virtual Guard & Monitoring',
    subtitle: '24/7 Remote Operations',
    description: 'Remote video monitoring and virtual guard services operating around the clock.',
    color: '#06B6D4',
  },
]

export function Services() {
  return (
    <section id="services" className="py-24 bg-[#0A0E1A]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7 }}
          className="text-center mb-16"
        >
          <p className="text-[#C9A227] text-xs tracking-[0.35em] uppercase font-medium mb-4">What We Offer</p>
          <h2 className="font-heading text-5xl md:text-7xl text-white mb-5">OUR SERVICES</h2>
          <div className="w-16 h-0.5 bg-[#C9A227] mx-auto mb-6" />
          <p className="text-gray-400 max-w-2xl mx-auto text-base leading-relaxed">
            From AI-powered surveillance to armed patrols, we deliver comprehensive security solutions tailored to Florida&apos;s most demanding environments.
          </p>
        </motion.div>

        {/* Services grid */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4"
        >
          {services.map((service) => {
            const Icon = service.icon
            return (
              <motion.div
                key={service.title}
                variants={staggerItem}
                whileHover={{ y: -6, transition: { duration: 0.25 } }}
                className="group relative bg-[#141D2E] border border-[#1E293B] hover:border-[#C9A227]/40 rounded-2xl p-6 cursor-default transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)] overflow-hidden"
              >
                {/* Glow on hover */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl"
                  style={{ background: `radial-gradient(circle at 50% 0%, ${service.color}08 0%, transparent 70%)` }}
                />
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 transition-all duration-300 group-hover:scale-110"
                  style={{ backgroundColor: `${service.color}15` }}
                >
                  <Icon className="w-5 h-5" style={{ color: service.color }} strokeWidth={1.5} />
                </div>
                <h3 className="text-white font-bold text-sm mb-0.5 group-hover:text-[#C9A227] transition-colors duration-300">
                  {service.title}
                </h3>
                <p className="text-[#C9A227]/60 text-xs mb-3 font-medium">{service.subtitle}</p>
                <p className="text-gray-500 text-xs leading-relaxed">{service.description}</p>
              </motion.div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}
