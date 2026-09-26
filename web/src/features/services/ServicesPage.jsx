import React from 'react'
import { Search, Server } from 'lucide-react'
import { apiRequest } from '../../lib/api'
import InstallServiceModal from './InstallServiceModal'
import PhpOverviewCard from './PhpOverviewCard'
import ServiceCard from './ServiceCard'
import ServiceManagerModal from './ServiceManagerModal'

export default function ServicesPage() {
  const [catalog, setCatalog] = React.useState([])
  const [installed, setInstalled] = React.useState([])
  const [pinned, setPinned] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem('serverengine:pinned-services') || '[]') } catch { return [] }
  })
  const [query, setQuery] = React.useState('')
  const [category, setCategory] = React.useState('All')
  const [selected, setSelected] = React.useState(null)
  const [manage, setManage] = React.useState(null)

  React.useEffect(() => { localStorage.setItem('serverengine:pinned-services', JSON.stringify(pinned)) }, [pinned])
  React.useEffect(() => {
    let alive = true
    const load = () => Promise.all([apiRequest('/api/v1/services/catalog').then(r => r.json()), apiRequest('/api/v1/services/installed').then(r => r.json())]).then(([services, detected]) => { if (alive) { setCatalog(services); setInstalled(detected) } }).catch(() => {})
    load()
    const timer = setInterval(load, 5000)
    return () => { alive = false; clearInterval(timer) }
  }, [])

  const togglePin = serviceId => setPinned(current => current.includes(serviceId) ? current.filter(item => item !== serviceId) : [serviceId, ...current])
  const categories = ['All', ...new Set(catalog.map(service => service.category))]
  const visible = catalog.filter(service => (category === 'All' || category === service.category) && `${service.name} ${service.description}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Number(pinned.includes(b.id)) - Number(pinned.includes(a.id)))
  const matchesFor = service => installed.filter(item => item.id === service.id || item.id.startsWith(`${service.id}@`))

  return <div className="space-y-7"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-sm text-cyan-300">Infrastructure</p><h2 className="mt-1 text-3xl font-semibold tracking-tight">Services</h2><p className="mt-2 text-slate-400">Inspect installed software or add a supported service provider.</p></div><div className="service-summary"><Server size={17}/><span>{installed.filter(item => item.status === 'running').length} running</span><span>·</span><span>{installed.length} detected</span></div></div><div className="service-toolbar"><div className="search-box"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search services…"/></div><select value={category} onChange={event => setCategory(event.target.value)}>{categories.map(item => <option key={item}>{item}</option>)}</select></div><div className="service-grid">{visible.map(service => { const matches = matchesFor(service); if (service.id === 'php') return <PhpOverviewCard key={service.id} service={service} installed={matches} pinned={pinned.includes(service.id)} onTogglePin={togglePin}/>; return <ServiceCard key={service.id} service={service} installed={matches[0]} installedVersions={matches} pinned={pinned.includes(service.id)} onTogglePin={togglePin} onInstall={item => setSelected({ service: item })} onManage={(item, versions) => setManage({ service: item, versions })}/> })}</div>{selected && <InstallServiceModal service={selected.service} initialVersion={selected.initialVersion} onClose={() => setSelected(null)}/>} {manage && <ServiceManagerModal service={manage.service} installed={manage.versions} onClose={() => setManage(null)}/>}</div>
}
