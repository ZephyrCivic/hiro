import JSZip from "jszip";
import { parseCsv } from "./csv.ts";
import { haversineDistanceMeters } from "./geo.ts";

export type Agency = {
  agency_id: string;
  agency_name: string;
};

export type Stop = {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
};

export type Route = {
  route_id: string;
  agency_id: string;
  route_short_name?: string;
  route_long_name?: string;
};

export type Trip = {
  trip_id: string;
  route_id: string;
  service_id: string;
  trip_headsign?: string;
};

export type StopTime = {
  trip_id: string;
  arrival_time: string;
  departure_time: string;
  stop_id: string;
  stop_sequence: number;
};

export type GtfsDataset = {
  id: string; // ファイル名ベース
  agencies: Agency[];
  stops: Stop[];
  routes: Route[];
  trips: Trip[];
  stopTimes: StopTime[];
  isHiroden: boolean;
};

export type AggregatedStop = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  normalizedName: string;
  members: { datasetId: string; stopId: string }[];
};

export type TimetableRow = {
  operator: "hiroden" | "other";
  agencyName: string;
  route: string;
  headsign: string;
  departureTime: string;
};

export async function parseGtfsZip(file: File): Promise<GtfsDataset> {
  const zip = await JSZip.loadAsync(file);

  const text = async (name: string) => {
    const entry = zip.file(name);
    if (!entry) return null;
    return entry.async("string");
  };

  const agencies = await readAgencies(await text("agency.txt"));
  const stops = await readStops(await text("stops.txt"));
  const routes = await readRoutes(await text("routes.txt"));
  const trips = await readTrips(await text("trips.txt"));
  const stopTimes = await readStopTimes(await text("stop_times.txt"));

  const isHiroden =
    agencies.findIndex((a) => a.agency_name.includes("広島電鉄")) >= 0;

  return {
    id: file.name,
    agencies,
    stops,
    routes,
    trips,
    stopTimes,
    isHiroden
  };
}

async function readAgencies(content: string | null): Promise<Agency[]> {
  if (!content) return [];
  return parseCsv(content).map((r) => ({
    agency_id: r.agency_id ?? "",
    agency_name: r.agency_name ?? ""
  }));
}

async function readStops(content: string | null): Promise<Stop[]> {
  if (!content) return [];
  return parseCsv(content)
    .map((r) => ({
      stop_id: r.stop_id ?? "",
      stop_name: r.stop_name ?? "",
      stop_lat: Number(r.stop_lat),
      stop_lon: Number(r.stop_lon)
    }))
    .filter((s) => !Number.isNaN(s.stop_lat) && !Number.isNaN(s.stop_lon));
}

async function readRoutes(content: string | null): Promise<Route[]> {
  if (!content) return [];
  return parseCsv(content).map((r) => ({
    route_id: r.route_id ?? "",
    agency_id: r.agency_id ?? "",
    route_short_name: r.route_short_name ?? "",
    route_long_name: r.route_long_name ?? ""
  }));
}

async function readTrips(content: string | null): Promise<Trip[]> {
  if (!content) return [];
  return parseCsv(content).map((r) => ({
    trip_id: r.trip_id ?? "",
    route_id: r.route_id ?? "",
    service_id: r.service_id ?? "",
    trip_headsign: r.trip_headsign ?? ""
  }));
}

async function readStopTimes(content: string | null): Promise<StopTime[]> {
  if (!content) return [];
  return parseCsv(content)
    .map((r) => ({
      trip_id: r.trip_id ?? "",
      arrival_time: r.arrival_time ?? "",
      departure_time: r.departure_time ?? "",
      stop_id: r.stop_id ?? "",
      stop_sequence: Number(r.stop_sequence ?? "0")
    }))
    .filter((s) => !!s.trip_id && !!s.stop_id);
}

export function normalizeStopName(raw: string): string {
  return raw
    .replace(/[　\s]/g, "")
    .replace(/[（）()]/g, "")
    .replace(/バス停/gi, "")
    .replace(/のりば\d+/gi, "")
    .toLowerCase();
}

export function aggregateStops(datasets: GtfsDataset[]): AggregatedStop[] {
  const aggregated: AggregatedStop[] = [];
  datasets.forEach((ds) => {
    ds.stops.forEach((stop) => {
      const norm = normalizeStopName(stop.stop_name);
      const found = aggregated.find(
        (agg) =>
          agg.normalizedName === norm &&
          haversineDistanceMeters(
            agg.lat,
            agg.lon,
            stop.stop_lat,
            stop.stop_lon
          ) <= 30
      );
      if (found) {
        found.members.push({ datasetId: ds.id, stopId: stop.stop_id });
      } else {
        aggregated.push({
          id: `${norm}-${aggregated.length + 1}`,
          name: stop.stop_name,
          lat: stop.stop_lat,
          lon: stop.stop_lon,
          normalizedName: norm,
          members: [{ datasetId: ds.id, stopId: stop.stop_id }]
        });
      }
    });
  });
  return aggregated;
}

export function getTimetableRows(
  datasets: GtfsDataset[],
  aggregatedStop: AggregatedStop | null
): TimetableRow[] {
  if (!aggregatedStop) return [];
  const rows: TimetableRow[] = [];

  datasets.forEach((ds) => {
    const memberStopIds = aggregatedStop.members
      .filter((m) => m.datasetId === ds.id)
      .map((m) => m.stopId);
    if (memberStopIds.length === 0) return;

    const tripById = new Map(ds.trips.map((t) => [t.trip_id, t]));
    const routeById = new Map(ds.routes.map((r) => [r.route_id, r]));
    const agencyById = new Map(ds.agencies.map((a) => [a.agency_id, a]));

    ds.stopTimes
      .filter((st) => memberStopIds.includes(st.stop_id))
      .forEach((st) => {
        const trip = tripById.get(st.trip_id);
        if (!trip) return;
        const route = routeById.get(trip.route_id);
        const agency = route
          ? agencyById.get(route.agency_id)
          : ds.agencies[0];

        const routeLabel =
          route?.route_short_name?.trim() ||
          route?.route_long_name?.trim() ||
          "系統不明";
        rows.push({
          operator: ds.isHiroden ? "hiroden" : "other",
          agencyName: agency?.agency_name || "事業者不明",
          route: routeLabel,
          headsign: trip.trip_headsign || "",
          departureTime: st.departure_time
        });
      });
  });

  return rows.sort(
    (a, b) => parseTimeToSeconds(a.departureTime) - parseTimeToSeconds(b.departureTime)
  );
}

function parseTimeToSeconds(time: string): number {
  const [h, m, s] = time.split(":").map((v) => Number(v));
  if (Number.isNaN(h) || Number.isNaN(m) || Number.isNaN(s)) return Number.MAX_SAFE_INTEGER;
  return h * 3600 + m * 60 + s;
}
