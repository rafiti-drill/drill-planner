import React from 'react'
import './Card.css'

export default function Card({ children, className = '', glowColor = 'green', onClick, style }) {
  return (
    <div
      className={`card card--glow-${glowColor} ${className} ${onClick ? 'card--clickable' : ''}`}
      onClick={onClick}
      style={style}
    >
      {children}
    </div>
  )
}
