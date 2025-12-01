import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  Marker,
  Popup,
  Polyline,
  TileLayer,
  useMapEvents
} from "react-leaflet";
import { DivIcon, LatLngBounds, LatLngExpression, icon } from "leaflet";
import { Button } from "./components/ui/button.tsx";
import {
  AggregatedStop,
  GtfsDataset,
  TimetableRow,
  aggregateStops,
  getTimetableRows,
  parseGtfsZip
} from "./lib/gtfs.ts";
import Supercluster from "supercluster";

const defaultCenter: LatLngExpression = [34.3853, 132.4553]; // 広島駅付近

const markerIcon = icon({
  iconUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png"
});

type OperatorFilter = "all" | "hiroden" | "other";

function App() {
  const [datasets, setDatasets] = useState<GtfsDataset[]>([]);
  const [enabledIds, setEnabledIds] = useState<Record<string, boolean>>({});
  const [selectedStop, setSelectedStop] = useState<AggregatedStop | null>(null);
  const [filter, setFilter] = useState<OperatorFilter>("all");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapBounds, setMapBounds] = useState<LatLngBounds | null>(null);
  const [zoom, setZoom] = useState<number>(11);
  const [showStops, setShowStops] = useState(true);
  const [showShapes, setShowShapes] = useState(false);

  // 有効になっているデータセットのみを対象にする
  const activeDatasets = useMemo(
    () => datasets.filter((ds) => enabledIds[ds.id] !== false),
    [datasets, enabledIds]
  );

  const aggregatedStops = useMemo(() => {
    const agg = aggregateStops(activeDatasets);
    setSelectedStop(null);
    return agg;
  }, [activeDatasets]);

  const clusterIndex = useMemo(() => {
    const features = aggregatedStops.map((s) => ({
      type: "Feature" as const,
      properties: {
        cluster: false,
        stopId: s.id,
        name: s.name
      },
      geometry: {
        type: "Point" as const,
        coordinates: [s.lon, s.lat]
      }
    }));
    const index = new Supercluster({
      radius: 60,
      maxZoom: 16
    });
    index.load(features);
    return index;
  }, [aggregatedStops]);

  const clusters = useMemo(() => {
    if (!mapBounds) return [];
    const bounds = mapBounds.toBBoxString().split(",").map(Number);
    // bounds: west,south,east,north
    return clusterIndex.getClusters(bounds as [number, number, number, number], zoom);
  }, [clusterIndex, mapBounds, zoom]);

  const shapePolylines = useMemo(() => {
    if (!showShapes) return [];
    const lines: { id: string; coords: [number, number][]; isHiroden: boolean }[] = [];
    activeDatasets.forEach((ds) => {
      const group = new Map<string, { coords: [number, number][] }>();
      ds.shapes.forEach((pt) => {
        if (!group.has(pt.shape_id)) {
          group.set(pt.shape_id, { coords: [] });
        }
        group.get(pt.shape_id)!.coords.push([pt.lat, pt.lon]);
      });
      group.forEach((g, shapeId) => {
        const sorted = g.coords;
        lines.push({
          id: `${ds.id}-${shapeId}`,
          coords: sorted,
          isHiroden: ds.isHiroden
        });
      });
    });
    return lines;
  }, [activeDatasets, showShapes]);

  const timetableRows: TimetableRow[] = useMemo(() => {
    const rows = getTimetableRows(activeDatasets, selectedStop);
    if (filter === "all") return rows;
    return rows.filter((r) =>
      filter === "hiroden" ? r.operator === "hiroden" : r.operator === "other"
    );
  }, [activeDatasets, selectedStop, filter]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsLoading(true);
    setError(null);
    try {
      const parsed: GtfsDataset[] = [];
      for (const file of Array.from(files)) {
        const ds = await parseGtfsZip(file);
        parsed.push(ds);
      }
      setDatasets((prev) => [...prev, ...parsed]);
      setEnabledIds((prev) => {
        const next = { ...prev };
        parsed.forEach((ds) => {
          if (!(ds.id in next)) next[ds.id] = true;
        });
        return next;
      });
    } catch (e) {
      console.error(e);
      setError("GTFS の読み込みに失敗しました。ファイルを確認してください。");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleDataset = (id: string) => {
    setEnabledIds((prev) => ({ ...prev, [id]: prev[id] === false }));
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-lg font-semibold">
              GTFS可視化・配布時刻表スタジオ（フェーズ1試作）
            </h1>
            <p className="text-xs text-slate-500">
              地図上で停留所を確認し、広電＋その他事業者の統合時刻表を表示します
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 md:flex-row md:items-center">
            <label className="text-xs text-slate-600">
            GTFS ZIP を選択（複数可）:
            <input
              type="file"
              accept=".zip"
              multiple
              className="mt-1 block text-xs"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </label>
          <Button
            onClick={() => setDatasets([])}
            className="bg-slate-200 text-slate-800 hover:bg-slate-300"
          >
            読み込みリセット
          </Button>
        </div>
      </div>
    </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-3 px-4 py-4 md:flex-row">
        <section className="flex-1 rounded-md border bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">地図（バス停の全可視化）</h2>
            <span className="text-xs text-slate-500">
              読み込み済み: {datasets.length} ファイル / 統合停留所 {aggregatedStops.length} 件
            </span>
          </div>
          <p className="mb-2 text-xs text-slate-500">
            GTFS ZIP を読み込むと停留所が地図に表示されます。クリックすると右側に統合時刻表が表示されます。
          </p>
          <div className="relative h-[420px] overflow-hidden rounded-md border">
            <MapContainer
              center={defaultCenter}
              zoom={11}
              className="h-full w-full"
              whenCreated={(map) => {
                setMapBounds(map.getBounds());
                setZoom(map.getZoom());
              }}
            >
              <TileLayer
                attribution='&copy; <a href="http://osm.org/copyright">OSM</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapWatcher onChange={(b, z) => { setMapBounds(b); setZoom(z); }} />
              {showShapes &&
                shapePolylines.map((line) => (
                  <Polyline
                    key={line.id}
                    positions={line.coords}
                    pathOptions={{
                      color: line.isHiroden ? "#0f766e" : "#334155",
                      weight: 3,
                      opacity: 0.6
                    }}
                  />
                ))}
              {showStops &&
                clusters.map((feature) => {
                  const [lon, lat] = feature.geometry.coordinates;
                  const pos: LatLngExpression = [lat, lon];
                  const isCluster = (feature.properties as any).cluster;
                  if (isCluster) {
                    const count = (feature.properties as any).point_count;
                    const icon = createClusterIcon(count);
                    return (
                      <Marker
                        key={`cluster-${feature.id}`}
                        position={pos}
                        icon={icon}
                        eventHandlers={{
                          click: () => {
                            const expansionZoom = clusterIndex.getClusterExpansionZoom(
                              feature.id as number
                            );
                            setZoom(expansionZoom);
                          }
                        }}
                      />
                    );
                  }
                  const stopId = (feature.properties as any).stopId as string;
                  const stop = aggregatedStops.find((s) => s.id === stopId);
                  if (!stop) return null;
                  return (
                    <Marker
                      key={stop.id}
                      position={pos}
                      icon={markerIcon}
                      eventHandlers={{
                        click: () => setSelectedStop(stop)
                      }}
                    >
                      <Popup>
                        <div className="text-sm font-semibold">{stop.name}</div>
                        <div className="text-xs text-slate-600">
                          事業者数: {new Set(stop.members.map((m) => m.datasetId)).size}
                        </div>
                        <Button
                          className="mt-2 w-full bg-slate-900 text-white hover:bg-slate-800"
                          onClick={() => setSelectedStop(stop)}
                        >
                          時刻表を表示
                        </Button>
                      </Popup>
                    </Marker>
                  );
                })}
            </MapContainer>
            {isLoading && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/70 text-sm font-semibold text-slate-700">
                読み込み中...
              </div>
            )}
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </section>

        <section className="flex-1 rounded-md border bg-white p-3">
          <div className="mb-2 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex-1">
              <h2 className="text-sm font-semibold">
                選択停留所の統合時刻表（広電＋その他）
              </h2>
              <p className="text-xs text-slate-500">
                停留所をクリックすると、便を時刻順に表示します。
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex gap-1">
                <FilterButton
                  label="全社"
                  active={filter === "all"}
                  onClick={() => setFilter("all")}
                />
                <FilterButton
                  label="広電のみ"
                  active={filter === "hiroden"}
                  onClick={() => setFilter("hiroden")}
                />
                <FilterButton
                  label="その他のみ"
                  active={filter === "other"}
                  onClick={() => setFilter("other")}
                />
              </div>
              <div className="rounded border p-2 space-y-2">
                <p className="text-xs font-semibold text-slate-700">表示オプション</p>
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={showStops}
                    onChange={(e) => setShowStops(e.target.checked)}
                  />
                  バス停を表示
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={showShapes}
                    onChange={(e) => setShowShapes(e.target.checked)}
                  />
                  ルート（shapes.txt）を表示
                </label>
                <hr className="border-slate-200" />
                <p className="text-xs font-semibold text-slate-700">事業者ごとの表示</p>
                <div className="flex flex-col gap-1 text-xs text-slate-700">
                  {datasets.length === 0 && (
                    <span className="text-slate-500">読み込み済みファイルはありません</span>
                  )}
                  {datasets.map((ds) => (
                    <label key={ds.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={enabledIds[ds.id] !== false}
                        onChange={() => toggleDataset(ds.id)}
                      />
                      <span>
                        {ds.id}{" "}
                        <span className="text-slate-500">
                          ({ds.isHiroden ? "広電" : "その他"})
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-md border">
            {selectedStop ? (
              <div className="overflow-hidden">
                <div className="border-b bg-slate-50 px-3 py-2">
                  <div className="text-sm font-semibold">{selectedStop.name}</div>
                  <div className="text-xs text-slate-500">
                    停留所統合キー: {selectedStop.normalizedName} / {selectedStop.members.length} stop_id
                  </div>
                </div>
                <div className="max-h-[360px] overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-100 text-xs text-slate-600">
                      <tr>
                        <th className="px-2 py-2 text-left">事業者</th>
                        <th className="px-2 py-2 text-left">系統・路線</th>
                        <th className="px-2 py-2 text-left">行き先</th>
                        <th className="px-2 py-2 text-left">発時刻</th>
                      </tr>
                    </thead>
                    <tbody>
                      {timetableRows.map((row, idx) => (
                        <tr
                          key={`${row.departureTime}-${idx}`}
                          className={row.operator === "hiroden" ? "bg-slate-50" : ""}
                        >
                          <td className="px-2 py-1 text-xs text-slate-700">
                            {row.agencyName}
                          </td>
                          <td className="px-2 py-1 text-xs text-slate-700">{row.route}</td>
                          <td className="px-2 py-1 text-xs text-slate-700">{row.headsign}</td>
                          <td className="px-2 py-1 text-xs font-semibold text-slate-900">
                            {row.departureTime}
                          </td>
                        </tr>
                      ))}
                      {timetableRows.length === 0 && (
                        <tr>
                          <td
                            className="px-2 py-3 text-center text-xs text-slate-500"
                            colSpan={4}
                          >
                            該当する便がありません
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="p-4 text-center text-sm text-slate-500">
                地図上の停留所をクリックすると、ここに統合時刻表を表示します。
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function FilterButton({
  label,
  active,
  onClick
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      onClick={onClick}
      className={`border px-3 py-1 text-xs ${
        active
          ? "bg-slate-900 text-white hover:bg-slate-800"
          : "bg-white text-slate-700 hover:bg-slate-100"
      }`}
    >
      {label}
    </Button>
  );
}

export default App;

function MapWatcher({
  onChange
}: {
  onChange: (bounds: LatLngBounds, zoom: number) => void;
}) {
  useMapEvents({
    moveend: (e) => {
      onChange(e.target.getBounds(), e.target.getZoom());
    },
    zoomend: (e) => {
      onChange(e.target.getBounds(), e.target.getZoom());
    }
  });
  return null;
}

function createClusterIcon(count: number) {
  const size = count < 10 ? 28 : count < 50 ? 32 : 36;
  return new DivIcon({
    html: `<div style="
      background: rgba(15,23,42,0.9);
      color: white;
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
      border: 2px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    ">${count}</div>`,
    className: "cluster-marker",
    iconSize: [size, size]
  });
}
