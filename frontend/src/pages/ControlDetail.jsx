import { useQuery } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { CheckCircle, XCircle, AlertTriangle, ArrowLeft } from 'lucide-react'

const API = import.meta.env.VITE_API_URL

const StatusIcon = ({ status, size = 18 }) => {
  if (status === 'PASS') return <CheckCircle size={size} className="text-green-500" />
  if (status === 'FAIL') return <XCircle size={size} className="text-red-500" />
  return <AlertTriangle size={size} className="text-amber-500" />
}

export default function ControlDetail() {
  const { controlId } = useParams()
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['control', controlId],
    queryFn: () => axios.get(`${API}/controls/${controlId}`).then(r => r.data)
  })

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  )

  const items = data || []
  const latest = items.reduce((acc, item) => {
    const key = item.evidence_type
    if (!acc[key] || item.collected_at > acc[key].collected_at) acc[key] = item
    return acc
  }, {})
  const evidenceList = Object.values(latest)

  return (
    <div>
      <button
        onClick={() => navigate('/controls')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors"
      >
        <ArrowLeft size={16} />
        Back to controls
      </button>

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-sm text-gray-400 font-medium">{controlId}</span>
        </div>
        <h1 className="text-2xl font-semibold text-gray-900">
          {evidenceList[0]?.control_name || controlId}
        </h1>
        <p className="text-gray-500 text-sm mt-1">{evidenceList.length} evidence items collected</p>
      </div>

      <div className="space-y-3">
        {evidenceList.map((item, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <StatusIcon status={item.status} />
                <span className="font-medium text-gray-900 text-sm">{item.evidence_type}</span>
              </div>
              <span className="text-xs text-gray-400">
                {new Date(item.collected_at).toLocaleString()}
              </span>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 mb-3">
              <p className="text-sm text-gray-700 font-mono">{item.details}</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <span>Resource:</span>
              <span className="font-medium text-gray-600">{item.resource}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}