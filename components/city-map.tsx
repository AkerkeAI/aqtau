'use client';

import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useMemo } from 'react';
import { Report, ReportStatus, AKTAU_CENTER } from '@/lib/types';
import { CATEGORY_HEX, getCategoryLabel } from '@/lib/categories';
import { STATUS_LABELS } from '@/lib/types';
import { renderToStaticMarkup } from 'react-dom/server';

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })
  ._getIconUrl;

function createIcon(report: Report) {
  const color = CATEGORY_HEX[report.category];
  const iconHtml = renderToStaticMarkup(
    <div
      style={{
        background: color,
        width: '36px',
        height: '36px',
        borderRadius: '50% 50% 50% 0',
        transform: 'rotate(-45deg)',
        border: '2px solid white',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        style={{
          transform: 'rotate(45deg)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {report.status === 'resolved' && (
            <polyline points="20 6 9 17 4 12" />
          )}
          {report.status === 'new' && (
            <>
              <circle cx="12" cy="12" r="3" fill="white" />
              <circle cx="12" cy="12" r="8" opacity="0.4" />
            </>
          )}
          {report.status === 'in_progress' && (
            <>
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </>
          )}
        </svg>
      </span>
    </div>,
  );

  return L.divIcon({
    html: iconHtml,
    className: 'aqtau-custom-marker',
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -34],
  });
}

function createSelectionIcon() {
  const iconHtml = renderToStaticMarkup(
    <div
      style={{
        background: '#0ea5e9',
        width: '28px',
        height: '28px',
        borderRadius: '50%',
        border: '3px solid white',
        boxShadow: '0 2px 10px rgba(14,165,233,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="white"
        stroke="white"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="4" />
      </svg>
    </div>,
  );

  return L.divIcon({
    html: iconHtml,
    className: 'aqtau-selection-marker',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

const STATUS_COLORS: Record<ReportStatus, string> = {
  new: '#2563eb',
  in_progress: '#d97706',
  resolved: '#059669',
};

export interface CityMapProps {
  reports: Report[];
  height?: string;
  center?: [number, number];
  zoom?: number;
  onMarkerClick?: (id: string) => void;
  showPopups?: boolean;
  interactive?: boolean;
  selectionMode?: boolean;
  selectedPosition?: [number, number] | null;
  onMapClick?: (lat: number, lng: number) => void;
}

function ClickHandler({
  onMapClick,
}: {
  onMapClick?: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (onMapClick) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

export default function CityMap({
  reports,
  height = '500px',
  center = AKTAU_CENTER,
  zoom = 13,
  onMarkerClick,
  showPopups = true,
  interactive = true,
  selectionMode = false,
  selectedPosition = null,
  onMapClick,
}: CityMapProps) {
  const icons = useMemo(() => {
    const map: Record<string, L.DivIcon> = {};
    for (const r of reports) {
      map[r.id] = createIcon(r);
    }
    return map;
  }, [reports]);

  const selectionIcon = useMemo(() => createSelectionIcon(), []);

  return (
    <div style={{ height, width: '100%' }} className="overflow-hidden rounded-xl">
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={interactive}
        dragging={interactive}
        zoomControl={interactive}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap'
        />
        {onMapClick && <ClickHandler onMapClick={onMapClick} />}
        {reports.map((report) => (
          <Marker
            key={report.id}
            position={[report.lat, report.lng]}
            icon={icons[report.id]}
            eventHandlers={
              onMarkerClick
                ? {
                    click: () => onMarkerClick(report.id),
                  }
                : undefined
            }
          >
            {showPopups && (
              <Popup>
                <div className="w-64">
                  {report.photoUrl && (
                    <img
                      src={report.photoUrl}
                      alt={report.id}
                      className="h-32 w-full object-cover"
                    />
                  )}
                  <div className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-gray-500">
                        {report.id.slice(0, 8)}
                      </span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                        style={{
                          background: STATUS_COLORS[report.status],
                        }}
                      >
                        {STATUS_LABELS[report.status]}
                      </span>
                    </div>
                    <h4 className="mt-1.5 text-sm font-bold text-gray-900">
                      {getCategoryLabel(report.category)}
                    </h4>
                    <p className="mt-1 text-xs text-gray-600 line-clamp-2">
                      {report.description}
                    </p>
                    <div className="mt-2 text-xs text-gray-500">
                      {report.address}
                    </div>
                    <div className="mt-1 text-xs text-gray-400">
                      {new Date(report.createdAt).toLocaleDateString('ru-RU', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </div>
                  </div>
                </div>
              </Popup>
            )}
          </Marker>
        ))}
        {selectionMode && selectedPosition && (
          <Marker position={selectedPosition} icon={selectionIcon} />
        )}
      </MapContainer>
    </div>
  );
}
