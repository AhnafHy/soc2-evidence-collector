import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { RadialBarChart, RadialBar, ResponsiveContainer } from 'recharts'
import { CheckCircle, XCircle, AlertTriangle, Clock } from 'lucide-react'

const API = import.meta.env.VITE_API_URL

export default function Dashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => axios.get(`${API}/dashboard`).then(r => r.data)
  })

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  )

  if (error || data?.error) return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
      <AlertTriangle className="mx-auto mb-2 text-yellow-500" size={32} />
      <p className="text-yellow-800 font-medium">No evidence collected yet</p>
      <p className="text-yellow-600 text-sm mt-1">Click "Collect Evidence" in the navbar to run your first collection</p>
    </div>
  )

  const c = data?.latest_collection
  const score = c?.compliance_score || 0
  const chartData = [{ name: 'score', value: score, fill: score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : '#dc2626' }]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Compliance Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">SOC 2 Trust Service Criteria — evidence collected automatically</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5 md:col-span-1 flex flex-col items-center justify-center">
          <ResponsiveContainer width="100%" height={120}>
            <RadialBarChart cx="50%" cy="50%" innerRadius="60%" outerRadius="80%" data={chartData} startAngle={90} endAngle={-270}>
              <RadialBar dataKey="value" cornerRadius={10} background={{ fill: '#f3f4f6' }} />
            </RadialBarChart>
          </ResponsiveContainer>
          <p className="text-3xl font-semibold text-gray-900 -mt-2">{score.toFixed(0)}%</p>
          <p className="text-sm text-gray-500 mt-1">Compliance score</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-green-600 mb-2">
            <CheckCircle size={20} />
            <span className="text-sm font-medium">Passing</span>
          </div>
          <p className="text-4xl font-semibold text-gray-900">{c?.controls_pass || 0}</p>
          <p className="text-sm text-gray-400">controls</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-red-500 mb-2">
            <XCircle size={20} />
            <span className="text-sm font-medium">Failing</span>
          </div>
          <p className="text-4xl font-semibold text-gray-900">{c?.controls_fail || 0}</p>
          <p className="text-sm text-gray-400">controls</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-amber-500 mb-2">
            <AlertTriangle size={20} />
            <span className="text-sm font-medium">Warnings</span>
          </div>
          <p className="text-4xl font-semibold text-gray-900">{c?.controls_warn || 0}</p>
          <p className="text-sm text-gray-400">controls</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <Clock size={16} />
          <span>Last collected: {c?.collected_at ? new Date(c.collected_at).toLocaleString() : 'Never'}</span>
          <span className="mx-2">·</span>
          <span>{c?.total_evidence || 0} evidence items</span>
          <span className="mx-2">·</span>
          <span>{data?.total_collections || 0} total collections</span>
        </div>
      </div>
    </div>
  )
}