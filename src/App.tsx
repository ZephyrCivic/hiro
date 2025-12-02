import { Fragment, useMemo, useState } from "react";
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
  const [showPreview, setShowPreview] = useState(false);

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
      const group = new Map<string, { coords: { lat: number; lon: number; seq: number }[] }>();
      ds.shapes.forEach((pt) => {
        if (!group.has(pt.shape_id)) {
          group.set(pt.shape_id, { coords: [] });
        }
        group.get(pt.shape_id)!.coords.push({ lat: pt.lat, lon: pt.lon, seq: pt.sequence });
      });
      group.forEach((g, shapeId) => {
        const sorted = g.coords
          .slice()
          .sort((a, b) => a.seq - b.seq)
          .map((c) => [c.lat, c.lon] as [number, number]);
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
      <header className="border-b bg-white no-print">
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

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-3 px-4 py-4 md:flex-row no-print">
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
                <div className="border-b bg-slate-50 px-3 py-2 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{selectedStop.name}</div>
                    <div className="text-xs text-slate-500">
                      停留所統合キー: {selectedStop.normalizedName} / {selectedStop.members.length} stop_id
                    </div>
                  </div>
                  <Button
                    onClick={() => setShowPreview(true)}
                    className="bg-slate-900 text-white hover:bg-slate-800 text-xs px-3 py-1"
                  >
                    配布時刻表プレビュー
                  </Button>
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

      <PreviewPanel
        visible={showPreview && !!selectedStop}
        onClose={() => setShowPreview(false)}
        stopName={selectedStop?.name || ""}
        rows={timetableRows}
      />
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

function toSeconds(time: string): number {
  const [h, m, s] = time.split(":").map((v) => Number(v));
  if (Number.isNaN(h) || Number.isNaN(m) || Number.isNaN(s)) return Number.MAX_SAFE_INTEGER;
  return h * 3600 + m * 60 + s;
}

function Legend({ color, bg, label }: { color: string; bg: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full px-3 py-1" style={{ background: bg }}>
      <span className="h-3 w-3 rounded-full" style={{ background: color }} />
      <span className="text-xs font-semibold text-slate-800">{label}</span>
    </span>
  );
}

function PreviewPanel({
  visible,
  onClose,
  stopName,
  rows
}: {
  visible: boolean;
  onClose: () => void;
  stopName: string;
  rows: TimetableRow[];
}) {
  const now = new Date();
  const formatted = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;

  const grouped = useMemo(() => {
    const map = new Map<string, TimetableRow[]>();
    rows.forEach((r) => {
      const hour = r.departureTime.split(":")[0] ?? "??";
      if (!map.has(hour)) map.set(hour, []);
      map.get(hour)!.push(r);
    });
    Array.from(map.values()).forEach((list) =>
      list.sort(
        (a, b) => toSeconds(a.departureTime) - toSeconds(b.departureTime)
      )
    );
    return Array.from(map.entries()).sort((a, b) => Number(a[0]) - Number(b[0]));
  }, [rows]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 print:bg-white print:static">
      <div className="max-h-[90vh] w-[960px] max-w-[95vw] overflow-auto rounded-md bg-white shadow-lg print:max-h-none print:w-full print:max-w-none print:shadow-none">
        <div className="flex items-center justify-between border-b px-4 py-3 print:hidden">
          <div>
            <div className="text-sm font-semibold">配布時刻表プレビュー（A4縦想定）</div>
            <div className="text-xs text-slate-500">印刷ボタンから PDF 保存または紙出力できます</div>
          </div>
          <div className="flex items-center gap-2">
            <Button className="bg-slate-900 text-white hover:bg-slate-800 text-xs px-3 py-1" onClick={() => window.print()}>
              印刷 / PDF 保存
            </Button>
            <Button
              onClick={onClose}
              className="bg-white text-slate-700 hover:bg-slate-100 border text-xs px-3 py-1"
            >
              閉じる
            </Button>
          </div>
        </div>
        <div className="print-page px-8 py-6 text-slate-900">
          <header className="mb-4 border-b pb-3">
            <div className="text-lg font-bold leading-tight">{stopName}</div>
            <div className="text-xs text-slate-600">
              改正ラベル: 2026年春ダイヤ（例） / 運行日: 平日ダイヤ / 出力日: {formatted}
            </div>
          </header>
          <section className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <Legend color="#0f766e" label="広電" bg="#e0f2f1" />
              <Legend color="#334155" label="その他" bg="#e2e8f0" />
            </div>
            <div className="text-slate-600">
              備考: 印刷時はブラウザの「背景のグラフィック」を有効にすると色分けが再現されます。
            </div>
          </section>
          <section className="rounded-md border border-slate-200">
            <div className="grid grid-cols-[52px_1fr] text-sm">
              <div className="bg-slate-100 px-2 py-2 text-[11px] font-semibold text-slate-700 border-r border-slate-200">
                時台
              </div>
              <div className="bg-slate-100 px-2 py-2 text-[11px] font-semibold text-slate-700">
                発時刻 / 事業者 / 系統・路線 / 行き先
              </div>
              {grouped.map(([hour, hourRows]) => (
                <Fragment key={`hour-${hour}`}>
                  <div
                    className="border-r border-slate-200 px-2 py-2 text-center text-xs font-semibold text-slate-800"
                  >
                    {hour}時台
                  </div>
                  <div className="border-b border-slate-200 px-0 py-0">
                    <table className="w-full border-collapse text-[11px]">
                      <tbody>
                        {hourRows.map((row, idx) => (
                          <tr
                            key={`${hour}-${idx}`}
                            className={row.operator === "hiroden" ? "bg-[#e0f2f1]" : "bg-[#e2e8f0]"}
                          >
                            <td className="px-2 py-1 w-[70px] font-semibold text-slate-900">
                              {row.departureTime}
                            </td>
                            <td className="px-2 py-1 w-[90px] text-slate-800">
                              {row.operator === "hiroden" ? "【広電】" : "【その他】"}
                              {row.agencyName}
                            </td>
                            <td className="px-2 py-1 w-[120px] text-slate-800">{row.route}</td>
                            <td className="px-2 py-1 text-slate-800">{row.headsign}</td>
                          </tr>
                        ))}
                        {hourRows.length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-2 py-2 text-center text-slate-500">
                              便なし
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Fragment>
              ))}
              {grouped.length === 0 && (
                <div className="col-span-2 px-3 py-6 text-center text-sm text-slate-500">
                  表示対象の便がありません（平日ダイヤ判定後の結果）。
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
