import SummaryCards from './SummaryCards';
import { formatNotionalBn, formatPrice } from '../lib/format';

export default function GammaSummaryStrip({ gamma }) {
  const cards = [
    { label: 'Underlying Spot', value: formatPrice(gamma?.spot_price) },
    { label: 'Total GEX', value: formatNotionalBn(gamma?.total_gex) },
    { label: 'Total Delta (M)', value: gamma?.total_delta !== undefined ? Number(gamma.total_delta).toFixed(2) : '-' },
    { label: 'Gamma Regime', value: gamma?.gamma_regime || '-' },
    { label: 'Key Call Wall', value: formatPrice(gamma?.key_levels?.call_wall) },
    { label: 'Key Put Wall', value: formatPrice(gamma?.key_levels?.put_wall) },
    { label: 'Nearest Pivot', value: formatPrice(gamma?.key_levels?.nearest_pivot) },
    { label: 'Gamma Flip', value: formatPrice(gamma?.key_levels?.gamma_flip) },
    { label: 'Last Updated', value: gamma?.last_updated ? new Date(gamma.last_updated).toLocaleString() : '-' },
  ];

  return <SummaryCards cards={cards} />;
}
