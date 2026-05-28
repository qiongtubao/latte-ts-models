import React from 'react';
import { Radar, RadarChart as ReRadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';

interface Props {
  dimensions: Record<string, number>;
}

export default function RadarChart({ dimensions }: Props) {
  const data = Object.entries(dimensions).map(([dim, val]) => ({ dimension: dim, score: val, fullMark: 10 }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <ReRadarChart data={data}>
        <PolarGrid />
        <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11 }} />
        <PolarRadiusAxis angle={30} domain={[0, 10]} />
        <Radar name="评分" dataKey="score" stroke="#4361ee" fill="#4361ee" fillOpacity={0.3} />
      </ReRadarChart>
    </ResponsiveContainer>
  );
}
