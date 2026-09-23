'use client';

import dynamic from 'next/dynamic';

const CityMap = dynamic(() => import('@/components/city-map'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-muted">
      <div className="flex flex-col items-center gap-2 text-muted-foreground">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="text-sm">Загрузка карты...</span>
      </div>
    </div>
  ),
});

export default CityMap;
