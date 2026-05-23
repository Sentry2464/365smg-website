'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useInView } from 'framer-motion'
import { staggerContainer, staggerItem } from '@/lib/animations'

const stats = [
  { value: 10, suffix: '+', label: 'Years of Excellence', description: 'Serving Florida communities' },
  { value: 500, suffix: '+', label: 'Clients Protected', description: 'Across businesses & residences' },
  { value: 24, suffix: '/7', label: 'Operations', description: 'Round-the-clock security' },
  { value: 2, suffix: '', label: 'State Licenses', description: 'B1400302 & DS1900071' },
]

function AnimatedCounter({ value, suffix }: { value: number; suffix: string }) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true })

  useEffect(() => {
    if (!isInView) return
    const duration = 1800
    const steps = 50
    const increment = value / steps
    let current = 0
    const timer = setInterval(() => {
      current += increment
      if (current >= value) {
        setCount(value)
        clearInterval(timer)
      } else {
        setCount(Math.floor(current))
      }
    }, duration / steps)
    return () => clearInterval(timer)
  }, [isInView, value])

  return (
    <span ref={ref} className="tabular-nums">
      {count}
      {suffix}
    </span>
  )
}

export function Stats() {
  return (
    <section id="stats" className="bg-[#0F1628] border-y border-[#1E293B] py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          className="grid grid-cols-2 md:grid-cols-4 gap-0"
        >
          {stats.map((stat, i) => (
            <motion.div
              key={i}
              variants={staggerItem}
              className={`flex flex-col items-center text-center px-6 py-8 ${
                i < stats.length - 1 ? 'border-r border-[#1E293B]' : ''
              }`}
            >
              <div className="font-heading text-5xl md:text-6xl text-[#C9A227] mb-2 drop-shadow-[0_0_15px_rgba(201,162,39,0.3)]">
                <AnimatedCounter value={stat.value} suffix={stat.suffix} />
              </div>
              <div className="text-white font-semibold text-sm md:text-base mb-1">{stat.label}</div>
              <div className="text-gray-500 text-xs">{stat.description}</div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
