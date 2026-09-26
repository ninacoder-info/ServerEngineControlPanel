import React from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'

export default function ActionDialog({ dialog, onClose, onSubmit }) {
  if (!dialog) return null
  const close = () => { dialog.onCancel?.(); onClose() }
  const form = dialog.kind === 'form'
  const danger = dialog.kind === 'confirm' || dialog.kind === 'error'
  const Icon = dialog.kind === 'error' || dialog.kind === 'confirm' ? AlertTriangle : dialog.kind === 'success' ? CheckCircle2 : Info
  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && close()}><section className="modal-card action-dialog"><div className="modal-header"><div className="action-dialog-title"><Icon size={18} className={danger ? 'dialog-danger-icon' : 'dialog-info-icon'}/><div><p className="eyebrow">SERVER ENGINE</p><h2>{dialog.title}</h2></div></div><button className="icon-button" onClick={close}><X size={18}/></button></div>{dialog.message && <p className="modal-description">{dialog.message}</p>}{form && <label className="dialog-field">{dialog.label}<input autoFocus value={dialog.value} placeholder={dialog.placeholder || ''} onChange={event => dialog.onChange(event.target.value)} onKeyDown={event => event.key === 'Enter' && onSubmit(dialog.value)}/>{dialog.hint && <small>{dialog.hint}</small>}</label>}<div className="modal-actions"><button className="button-secondary" onClick={close}>Close</button>{(form || dialog.kind === 'confirm') && <button className={danger ? 'button-danger' : 'button-primary'} onClick={() => onSubmit(dialog.value)}>{dialog.submitLabel || (form ? 'Continue' : 'Confirm')}</button>}</div></section></div>
}
