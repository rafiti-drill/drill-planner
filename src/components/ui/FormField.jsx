import React from 'react'
import './FormField.css'

export function FormField({ label, children, required }) {
  return (
    <div className="form-field">
      <label className="form-label">
        {label}{required && <span className="form-required">*</span>}
      </label>
      {children}
    </div>
  )
}

export function Input({ ...props }) {
  return <input className="form-input" {...props} />
}

export function Select({ children, ...props }) {
  return (
    <select className="form-select" {...props}>
      {children}
    </select>
  )
}

export function Textarea({ ...props }) {
  return <textarea className="form-textarea" rows={3} {...props} />
}
