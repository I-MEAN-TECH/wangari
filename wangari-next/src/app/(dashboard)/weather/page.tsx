"use client";
import * as React from "react";
import { motion } from "framer-motion";
import { Sun, Cloud, CloudRain, Droplets, Wind, Thermometer, AlertTriangle, RefreshCw, MapPin, Calendar, Leaf, Umbrella } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import api from "@/lib/api-client";

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };

const WeatherIcon = ({ condition, className }: { condition: string; className?: string }) => {
  const c = (condition || "").toLowerCase();
  if (c.includes("clear") || c.includes("sun")) return <Sun className={className || "h-6 w-6"} />;
  if (c.includes("rain") || c.includes("drizzle") || c.includes("thunder")) return <CloudRain className={className || "h-6 w-6"} />;
  return <Cloud className={className || "h-6 w-6"} />;
};

export default function WeatherPage() {
  const [weather, setWeather] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [gpsStatus, setGpsStatus] = React.useState<"idle" | "requesting" | "granted" | "denied">("idle");
  const [searchLocation, setSearchLocation] = React.useState("");
  const [isSearching, setIsSearching] = React.useState(false);

  const fetchWeather = async (lat?: number, lon?: number, locName?: string, saveLoc = false) => {
    setLoading(true);
    setError("");
    try {
      let url = "/api/weather";
      const params = new URLSearchParams();
      if (lat && lon) {
        params.append("lat", String(lat));
        params.append("lon", String(lon));
      } else if (locName) {
        params.append("location", locName);
        if (saveLoc) params.append("save", "true");
      }
      if (params.toString()) url += `?${params.toString()}`;
      const data = await api.get(url);
      setWeather(data);
    } catch {
      setError("Unable to load weather data.");
    } finally {
      setLoading(false);
      setIsSearching(false);
    }
  };

  // Request GPS on mount
  React.useEffect(() => {
    if ("geolocation" in navigator) {
      setGpsStatus("requesting");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGpsStatus("granted");
          fetchWeather(pos.coords.latitude, pos.coords.longitude);
        },
        () => {
          setGpsStatus("denied");
          fetchWeather(); // Server will fallback to farm location or Nairobi, Kenya
        },
        { timeout: 8000, maximumAge: 300000 }
      );
    } else {
      fetchWeather();
    }
  }, []);

  const handleLocationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchLocation.trim()) return;
    setIsSearching(true);
    fetchWeather(undefined, undefined, searchLocation.trim(), true);
  };

  const handleQuickLocation = (loc: string) => {
    setSearchLocation(loc);
    setIsSearching(true);
    fetchWeather(undefined, undefined, loc, true);
  };

  if (loading && !weather) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 text-wangari-green-800 animate-spin mx-auto mb-3" />
          <p className="text-sm text-wangari-muted">{gpsStatus === "requesting" ? "Getting your location..." : "Loading live weather..."}</p>
        </div>
      </div>
    );
  }

  const { today, forecast, location, temperature, feelsLike, humidity, windSpeed, condition, description, sunrise, sunset } = weather || {};

  // Farm-specific alerts
  const alerts: { type: "danger" | "warning" | "info"; text: string }[] = [];
  if (today?.willRain) alerts.push({ type: "warning", text: "Rain expected today. Avoid spraying pesticides or herbicides." });
  if (today?.rainMm > 10) alerts.push({ type: "danger", text: `Heavy rainfall (${today.rainMm}mm). Check drainage and protect seedlings.` });
  if (today?.tempMax > 35) alerts.push({ type: "danger", text: "Very hot. Ensure extra water for livestock and shade for poultry." });
  if (today?.tempMin < 10) alerts.push({ type: "warning", text: "Cool temperatures. Protect young stock from cold stress." });
  if (humidity > 85) alerts.push({ type: "info", text: "High humidity. Watch for fungal diseases on crops." });
  if (windSpeed > 30) alerts.push({ type: "warning", text: "Strong winds. Secure lightweight structures and check poultry housing." });

  // Spray recommendation
  const willRainSoon = forecast?.slice(0, 2).some((d: any) => d.rain > 0 || (d.condition || "").toLowerCase().includes("rain"));
  const sprayOk = !today?.willRain && !willRainSoon;

  return (
    <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-6">
      {/* Header */}
      <motion.div variants={fadeUp} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-wangari-heading tracking-tight">Weather</h1>
          <div className="flex items-center gap-1.5 mt-1 text-sm text-wangari-muted font-medium">
            <MapPin className="h-4 w-4 text-wangari-green-800" />
            <span>{location || "Nairobi, Kenya"}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if ("geolocation" in navigator) {
                setGpsStatus("requesting");
                navigator.geolocation.getCurrentPosition(
                  (pos) => {
                    setGpsStatus("granted");
                    fetchWeather(pos.coords.latitude, pos.coords.longitude);
                  },
                  () => {
                    setGpsStatus("denied");
                    fetchWeather();
                  },
                  { timeout: 8000 }
                );
              }
            }}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-wangari-green-800 bg-wangari-green-50 border border-wangari-green-200 rounded-xl hover:bg-wangari-green-100 active:scale-95 transition-all cursor-pointer min-h-[44px]"
          >
            <MapPin className="h-3.5 w-3.5" />
            {gpsStatus === "requesting" ? "Locating..." : "Use GPS"}
          </button>
          <button
            type="button"
            onClick={() => fetchWeather()}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-wangari-muted border border-wangari-border rounded-xl hover:bg-wangari-gray-50 active:scale-95 transition-all cursor-pointer min-h-[44px]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </motion.div>

      {/* Location Search Bar & Quick Chips */}
      <motion.div variants={fadeUp} className="bg-white p-3.5 rounded-2xl border border-wangari-border shadow-xs space-y-2.5">
        <form onSubmit={handleLocationSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-wangari-subtle" />
            <input
              type="text"
              value={searchLocation}
              onChange={(e) => setSearchLocation(e.target.value)}
              placeholder="Search town/county (e.g. Nakuru, Eldoret, Kiambu)..."
              className="w-full pl-9 pr-3 py-2.5 bg-tone-neutral-bg border border-wangari-border rounded-xl text-xs font-medium text-wangari-heading focus:outline-hidden focus:ring-2 focus:ring-wangari-green-800 min-h-[44px]"
            />
          </div>
          <button
            type="submit"
            disabled={isSearching || !searchLocation.trim()}
            className="px-4 py-2.5 bg-wangari-green-800 text-white rounded-xl text-xs font-bold hover:bg-wangari-green-900 disabled:opacity-50 transition-all cursor-pointer min-h-[44px]"
          >
            {isSearching ? "Searching..." : "Set Location"}
          </button>
        </form>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs text-wangari-muted">
          <span className="font-semibold text-[10px] uppercase tracking-wider text-wangari-subtle whitespace-nowrap">Quick:</span>
          {["Nairobi", "Nakuru", "Eldoret", "Kiambu", "Nyeri", "Machakos", "Meru", "Mombasa"].map((town) => (
            <button
              key={town}
              type="button"
              onClick={() => handleQuickLocation(town)}
              className="px-2.5 py-1 bg-wangari-sunken hover:bg-tone-neutral-border active:scale-95 text-wangari-text font-medium rounded-lg text-[11px] whitespace-nowrap cursor-pointer transition-all"
            >
              {town}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Current weather hero */}
      <motion.div variants={fadeUp} className="rounded-2xl bg-gradient-to-br from-wangari-ink via-wangari-green-900 to-wangari-green-800 p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/50 text-xs font-semibold uppercase tracking-wider">Now</p>
            <div className="flex items-end gap-2 mt-1">
              <span className="text-5xl font-extrabold">{temperature !== undefined ? Math.round(temperature) : "--"}°</span>
              <span className="text-white/60 text-sm mb-2">{description || condition}</span>
            </div>
            <p className="text-sm text-white/50 mt-1">Feels like {feelsLike !== undefined ? Math.round(feelsLike) : "--"}°</p>
          </div>
          <WeatherIcon condition={condition} className="h-16 w-16 text-white/80" />
        </div>
        <div className="grid grid-cols-3 gap-3 mt-5">
          {[
            { icon: Droplets, label: "Humidity", value: `${humidity || 0}%` },
            { icon: Wind, label: "Wind", value: `${windSpeed || 0} km/h` },
            { icon: Thermometer, label: "High/Low", value: `${today?.tempMax || "--"}°/${today?.tempMin || "--"}°` },
          ].map((item) => (
            <div key={item.label} className="bg-white/10 rounded-xl p-2.5 text-center">
              <item.icon className="h-4 w-4 text-white/50 mx-auto mb-1" />
              <p className="text-sm font-bold">{item.value}</p>
              <p className="text-[9px] text-white/40">{item.label}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Farm alerts */}
      {alerts.length > 0 && (
        <motion.div variants={fadeUp} className="space-y-2">
          {alerts.map((alert, i) => (
            <Card key={i} className={`border ${alert.type === "danger" ? "border-wangari-red-300 bg-tone-bad-bg" : alert.type === "warning" ? "border-wangari-amber-300 bg-tone-warn-bg" : "border-wangari-blue-300 bg-wangari-blue-50"}`}>
              <CardContent className="flex items-start gap-3 p-3">
                <AlertTriangle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${alert.type === "danger" ? "text-wangari-red-600" : alert.type === "warning" ? "text-wangari-amber-600" : "text-wangari-blue-600"}`} />
                <p className={`text-xs font-medium ${alert.type === "danger" ? "text-tone-bad-text" : alert.type === "warning" ? "text-wangari-amber-800" : "text-wangari-blue-800"}`}>{alert.text}</p>
              </CardContent>
            </Card>
          ))}
        </motion.div>
      )}

      {/* Spray recommendation */}
      <motion.div variants={fadeUp}>
        <Card className={`border ${sprayOk ? "border-wangari-green-200 bg-wangari-green-50" : "border-tone-warn-border bg-tone-warn-bg"}`}>
          <CardContent className="flex items-center gap-3 p-4">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${sprayOk ? "bg-wangari-green-100 text-wangari-green-700" : "bg-wangari-amber-100 text-tone-warn-text"}`}>
              {sprayOk ? <Leaf className="h-5 w-5" /> : <Umbrella className="h-5 w-5" />}
            </div>
            <div>
              <p className={`text-sm font-bold ${sprayOk ? "text-wangari-green-800" : "text-wangari-amber-800"}`}>{sprayOk ? "Good day for spraying" : "Not ideal for spraying"}</p>
              <p className={`text-xs ${sprayOk ? "text-wangari-green-600" : "text-wangari-amber-600"}`}>{sprayOk ? "No rain expected. Safe to apply pesticides or herbicides." : "Rain expected soon. Wait for dry conditions."}</p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Sunrise/Sunset */}
      <motion.div variants={fadeUp}>
        <Card className="border border-wangari-border">
          <CardContent className="flex items-center justify-around p-4">
            <div className="text-center">
              <Sun className="h-5 w-5 text-wangari-amber-500 mx-auto mb-1" />
              <p className="text-xs text-wangari-subtle">Sunrise</p>
              <p className="text-sm font-bold text-wangari-heading">{sunrise || "06:30"}</p>
            </div>
            <div className="h-8 w-px bg-wangari-border" />
            <div className="text-center">
              <Sun className="h-5 w-5 text-wangari-orange-500 mx-auto mb-1" />
              <p className="text-xs text-wangari-subtle">Sunset</p>
              <p className="text-sm font-bold text-wangari-heading">{sunset || "18:45"}</p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Forecast — scrollable on mobile */}
      <motion.div variants={fadeUp}>
        <Card className="border border-wangari-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="h-4 w-4 text-wangari-green-800" />
              <p className="text-xs font-bold text-wangari-heading">Forecast</p>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
              {forecast?.map((day: any, i: number) => {
                const d = new Date(day.date || day.day);
                const dayName = i === 0 ? "Today" : d.toLocaleDateString("en-US", { weekday: "short" });
                return (
                  <div key={i} className={`flex-shrink-0 w-20 text-center p-3 rounded-xl ${i === 0 ? "bg-wangari-green-50 border border-wangari-green-200" : "bg-tone-neutral-bg"}`}>
                    <p className="text-[10px] font-semibold text-wangari-muted">{dayName}</p>
                    <WeatherIcon condition={day.condition} className="h-5 w-5 text-wangari-muted mx-auto my-2" />
                    <p className="text-sm font-bold text-wangari-heading">{day.tempMax || day.maxTemp}°</p>
                    <p className="text-[10px] text-wangari-subtle">{day.tempMin || day.minTemp}°</p>
                    {day.rain > 0 && <p className="text-[9px] text-wangari-blue-500 font-bold mt-1">{day.rain}mm</p>}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Temperature trend */}
      {forecast && forecast.length > 0 && (
        <motion.div variants={fadeUp}>
          <Card className="border border-wangari-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Thermometer className="h-4 w-4 text-wangari-green-800" />
                <p className="text-xs font-bold text-wangari-heading">Temperature Range</p>
              </div>
              <div className="flex items-end gap-2 h-32">
                {forecast.map((day: any, i: number) => {
                  const maxT = day.tempMax || day.maxTemp || 30;
                  const minT = day.tempMin || day.minTemp || 15;
                  const maxH = (maxT / 40) * 100;
                  const minH = (minT / 40) * 100;
                  const d = new Date(day.date || day.day);
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <p className="text-[9px] font-bold text-wangari-heading">{maxT}°</p>
                      <div className="w-full relative" style={{ height: "60px" }}>
                        <div className="absolute bottom-0 w-full rounded-t-md bg-wangari-green-800/20" style={{ height: `${maxH}%` }} />
                        <div className="absolute bottom-0 w-full rounded-t-md bg-wangari-green-800" style={{ height: `${minH}%` }} />
                      </div>
                      <p className="text-[9px] text-wangari-subtle">{minT}°</p>
                      <p className="text-[8px] text-wangari-subtle">{i === 0 ? "Now" : d.toLocaleDateString("en-US", { weekday: "short" })}</p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}
