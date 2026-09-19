import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatNotionalBn } from '../lib/format';

export default function GexByExpirationChart({ data }) {
  return (
    <section className="panel chart-panel">
      <div className="panel-heading">
        <h3>Expiration Structure</h3>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2f3a51" />
          <XAxis dataKey="expiration" stroke="#93a2bf" />
          <YAxis stroke="#93a2bf" tickFormatter={(value) => formatNotionalBn(value)} />
          <Tooltip
            formatter={(value) => [formatNotionalBn(value), 'GEX']}
            contentStyle={{ backgroundColor: '#141a27', border: '1px solid #2a3246' }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="gex_bn"
            name="GEX (Bn)"
            stroke="#f97316"
            strokeWidth={2.2}
            dot={{ r: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
}
