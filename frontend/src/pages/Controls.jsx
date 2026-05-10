import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { CheckCircle, XCircle, AlertTriangle, ChevronRight } from 'lucide-react'

const API = import.meta.env.VITE_API_URL

const StatusIcon = ({ status }) => {
  if (status === 'PASS') return <CheckCircle size={18} className="text-green-500" />
  if (status === 'FAIL') return <XCircle size={18} className="text-red-500" />
  return <AlertTriangle size={18} className="text-amber-500" />
}

const StatusBadge = ({ status }) => {
  const styles = {
    PASS: 'bg-green-50 text-green-700 border-green-200',
    FAIL: 'bg-red-50 text-red-700 border-red-200',
    WARN: 'bg-amber-50 text-amber-700 border-amber-200'
  }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${styles[status] || styles.WARN}`}>
      {status}
    </span>
  )
}

export default function Controls() {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['controls'],
    queryFn: () => axios.get(`${API}/controls`).then(r => r.data)
  })

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  )

  const controls = data || []

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Trust Service Criteria</h1>
        <p className="text-gray-500 text-sm mt-1">{controls.length} controls monitored — click any control to view evidence</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {controls.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <p>No controls found — run evidence collection first</p>
          </div>
        ) : (
          controls.map(control => (
            <div
              key={control.control_id}
              onClick={() => navigate(`/controls/${control.control_id}`)}
              className="flex items-center justify-between p-4 hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-3">
                <StatusIcon status={control.status} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-gray-400 font-medium">{control.control_id}</span>
                    <StatusBadge status={control.status} />
                  </div>
                  <p className="text-sm font-medium text-gray-900 mt-0.5">{control.control_name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{control.evidence.length} evidence items</p>
                </div>
              </div>
              <ChevronRight size={18} className="text-gray-400" />
            </div>
          ))
        )}
      </div>
    </div>
  )
}