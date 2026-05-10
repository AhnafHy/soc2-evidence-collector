import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { Shield, FileCheck, LayoutDashboard, RefreshCw } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Controls from './pages/Controls'
import ControlDetail from './pages/ControlDetail'
import axios from 'axios'
import { useState } from 'react'

const API = import.meta.env.VITE_API_URL

export default function App() {
  const [collecting, setCollecting] = useState(false)

  const triggerCollection = async () => {
    setCollecting(true)
    try {
      await axios.post(`${API}/collect`)
      setTimeout(() => setCollecting(false), 3000)
    } catch {
      setCollecting(false)
    }
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="text-blue-600" size={24} />
              <span className="font-semibold text-gray-900">SOC 2 Evidence Collector</span>
            </div>
            <div className="flex items-center gap-6">
              <NavLink
                to="/"
                className={({ isActive }) =>
                  `flex items-center gap-1.5 text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'}`
                }
              >
                <LayoutDashboard size={16} />
                Dashboard
              </NavLink>
              <NavLink
                to="/controls"
                className={({ isActive }) =>
                  `flex items-center gap-1.5 text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'}`
                }
              >
                <FileCheck size={16} />
                Controls
              </NavLink>
              <button
                onClick={triggerCollection}
                disabled={collecting}
                className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
              >
                <RefreshCw size={14} className={collecting ? 'animate-spin' : ''} />
                {collecting ? 'Collecting...' : 'Collect Evidence'}
              </button>
            </div>
          </div>
        </nav>
        <main className="max-w-6xl mx-auto px-6 py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/controls" element={<Controls />} />
            <Route path="/controls/:controlId" element={<ControlDetail />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}