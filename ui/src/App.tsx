import React, { useState } from 'react';
import Layout from './components/Layout';
import ConfigManager from './components/ConfigManager/ConfigManager';
import Benchmark from './components/Benchmark/Benchmark';
import RoleChat from './components/RoleChat/RoleChat';

type Page = 'config' | 'benchmark' | 'rolechat';

export default function App() {
  const [page, setPage] = useState<Page>('config');

  return (
    <Layout currentPage={page} onNavigate={setPage}>
      {page === 'config' && <ConfigManager />}
      {page === 'benchmark' && <Benchmark />}
      {page === 'rolechat' && <RoleChat />}
    </Layout>
  );
}
