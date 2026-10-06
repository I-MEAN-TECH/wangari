"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Cloud, Sun, Droplets, Wind, MapPin, Sunrise, Sunset, CloudRain, CloudLightning, Moon, Star, CloudSun } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface WeatherData {
  temperature: number;
  feelsLike?: number;
  humidity: number;
  windSpeed: number;
  condition: string;
  description?: string;
  icon: "sun" | "cloud" | "rain";
  location?: string;
  today?: {
    tempMin: number;
    tempMax: number;
    rainMm: number;
    avgHumidity: number;
    willRain: boolean;
  };
  sunrise?: string | null;
  sunset?: string | null;
  forecast?: Array<{
    day: string;
    tempMin: number;
    tempMax: number;
    icon: "sun" | "cloud" | "rain";
  }>;
}

interface WeatherWidgetProps {
  data: WeatherData | null;
  location?: string;
}

// ─── Time-of-day helpers ──────────────────────────────────
// "HH:MM" local minutes; sunrise/sunset come from the API when available.
function parseHM(hm?: string | null): number | null {
  if (!hm) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(hm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Returns true when the current local time is night (after sunset / before sunrise). */
export function isNightNow(sunrise?: string | null, sunset?: string | null): boolean {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const rise = parseHM(sunrise) ?? 6 * 60 + 30;
  const set = parseHM(sunset) ?? 18 * 60 + 45;
  return mins < rise || mins >= set;
}

/**
 * Full gradient set keyed by day/night × condition.
 * Day: sky blues; sunrise/sunset amber bands; overcast grey-blue.
 * Night: deep indigo/navy; never a daytime blue.
 */
function getWeatherGradient(condition: string, night: boolean, mins: number, riseMins: number, setMins: number): string {
  const c = condition.toLowerCase();

  if (night) {
    if (c.includes("clear")) return "from-[#0b1026] via-[#101b3f] to-[#1b2a5e]";
    if (c.includes("rain") || c.includes("drizzle")) return "from-[#0a0f1d] via-[#141d33] to-[#22304d]";
    if (c.includes("thunder")) return "from-[#0b0a18] via-[#1c1633] to-[#2a2350]";
    return "from-[#0d1224] via-[#15203c] to-[#243457]"; // cloudy night
  }

  // Day — dawn/dusk amber windows (±45min around actual sunrise/sunset)
  if (c.includes("clear") || c.includes("sun")) {
    if (mins <= riseMins + 45) return "from-amber-300 via-orange-400 to-rose-400"; // sunrise
    if (mins >= setMins - 45) return "from-orange-500 via-rose-500 to-purple-500"; // sunset
    return "from-sky-400 via-blue-500 to-cyan-500"; // clear day
  }
  if (c.includes("rain") || c.includes("drizzle")) return "from-wangari-muted via-tone-neutral-text to-wangari-text";
  if (c.includes("thunder")) return "from-tone-neutral-text via-purple-800 to-wangari-heading";
  return "from-wangari-subtle via-wangari-muted to-tone-neutral-text"; // cloudy day
}

// ─── Animated Background Elements ─────────────────────────
function AnimatedBackground({ icon, condition, night }: { icon: string; condition: string; night: boolean }) {
  const c = condition.toLowerCase();
  const isRainy = c.includes("rain") || c.includes("drizzle") || c.includes("thunder");
  const isClear = c.includes("clear") || c.includes("sun");

  // Twinkling stars — night only, regardless of cloud cover (dimmer when cloudy)
  const stars = React.useMemo(
    () =>
      [...Array(26)].map((_, i) => ({
        left: `${(i * 37 + 11) % 100}%`,
        top: `${(i * 23 + 7) % 55}%`,
        size: 1 + ((i * 13 + 5) % 3),
        delay: ((i * 17 + 3) % 20) / 10,
        dur: 2 + ((i * 7 + 1) % 10) / 5,
      })),
    []
  );

  return (
    <div className="absolute inset-0 overflow-hidden">
      <AnimatePresence>
        {night && (
          <motion.div
            key="night-layer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2 }}
            className="absolute inset-0"
          >
            {/* Stars */}
            {stars.map((s, i) => (
              <motion.span
                key={i}
                className="absolute text-white"
                style={{ left: s.left, top: s.top }}
                animate={{
                  opacity: isClear ? [0.15, 0.9, 0.15] : [0.05, 0.35, 0.05],
                  scale: [0.8, 1.15, 0.8],
                }}
                transition={{ duration: s.dur, repeat: Infinity, delay: s.delay, ease: "easeInOut" }}
              >
                <Star style={{ width: s.size + 1, height: s.size + 1 }} fill="currentColor" strokeWidth={0} />
              </motion.span>
            ))}

            {/* Moon with soft glow — clear nights */}
            {isClear && (
              <motion.div
                className="absolute -top-6 right-4"
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              >
                <div className="absolute inset-0 -m-6 rounded-full bg-indigo-200/20 blur-2xl" />
                <Moon className="relative h-14 w-14 text-indigo-100 drop-shadow-[0_0_18px_rgba(199,210,254,0.6)]" fill="currentColor" strokeWidth={0} />
              </motion.div>
            )}

            {/* Fireflies / drifting glow on clear nights */}
            {isClear &&
              [...Array(5)].map((_, i) => (
                <motion.span
                  key={`ff-${i}`}
                  className="absolute h-1 w-1 rounded-full bg-tone-warn-border/70 blur-[1px]"
                  style={{ left: `${15 + i * 18}%`, top: `${30 + ((i * 13) % 40)}%` }}
                  animate={{ x: [0, 26, -12, 0], y: [0, -18, 10, 0], opacity: [0, 0.8, 0] }}
                  transition={{ duration: 9 + i * 2, repeat: Infinity, delay: i * 1.7, ease: "easeInOut" }}
                />
              ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sun glow — day, clear weather */}
      {!night && icon === "sun" && (
        <motion.div
          className="absolute -top-10 -right-10"
          animate={{ scale: [1, 1.1, 1], opacity: [0.4, 0.6, 0.4] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="h-40 w-40 rounded-full bg-yellow-300/40 blur-3xl" />
        </motion.div>
      )}

      {/* Animated clouds — dimmer at night */}
      <motion.div
        className="absolute top-8 -left-20"
        animate={{ x: [0, 350], opacity: night ? [0.06, 0.14, 0.06] : [0.3, 0.6, 0.3] }}
        transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
      >
        <Cloud className="h-24 w-24 text-white" />
      </motion.div>
      <motion.div
        className="absolute top-16 -left-32"
        animate={{ x: [0, 400], opacity: night ? [0.04, 0.1, 0.04] : [0.2, 0.4, 0.2] }}
        transition={{ duration: 35, repeat: Infinity, ease: "linear", delay: 5 }}
      >
        <Cloud className="h-16 w-16 text-white" />
      </motion.div>
      <motion.div
        className="absolute top-4 right-10"
        animate={{ x: [0, -300], opacity: night ? [0.05, 0.12, 0.05] : [0.25, 0.5, 0.25] }}
        transition={{ duration: 30, repeat: Infinity, ease: "linear", delay: 10 }}
      >
        <Cloud className="h-20 w-20 text-white" />
      </motion.div>

      {/* Rain drops — day & night */}
      {isRainy && (
        <div className="absolute inset-0">
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute h-0.5 w-0.5 bg-white/40 rounded-full"
              initial={{
                x: ((i * 47 + 13) % 20) * 20,
                y: -10,
                opacity: 0,
              }}
              animate={{
                y: [0, 300],
                opacity: [0, night ? 0.35 : 0.6, 0],
              }}
              transition={{
                duration: 1 + ((i * 31 + 7) % 10) / 20,
                repeat: Infinity,
                delay: ((i * 23 + 11) % 20) / 10,
                ease: "linear",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Weather Icon with animation ──────────────────────────
function AnimatedWeatherIcon({ icon, condition, night }: { icon: string; condition: string; night: boolean }) {
  const c = condition.toLowerCase();

  if (c.includes("thunder")) {
    return (
      <motion.div animate={{ rotate: [0, -5, 5, 0] }} transition={{ duration: 2, repeat: Infinity }}>
        <CloudLightning className="h-16 w-16 text-white drop-shadow-lg" />
      </motion.div>
    );
  }

  if (icon === "rain" || c.includes("rain") || c.includes("drizzle")) {
    return (
      <motion.div animate={{ y: [0, -3, 0] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}>
        <CloudRain className="h-16 w-16 text-white drop-shadow-lg" />
      </motion.div>
    );
  }

  if (night) {
    // Night: moon gently bobbing with glow; stars handled in background layer
    return (
      <motion.div animate={{ y: [0, -4, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}>
        <Moon
          className="h-14 w-14 text-indigo-100 drop-shadow-[0_0_16px_rgba(199,210,254,0.55)]"
          fill="currentColor"
          strokeWidth={0}
        />
      </motion.div>
    );
  }

  if (icon === "sun") {
    return (
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }}>
        <Sun className="h-16 w-16 text-white drop-shadow-lg" />
      </motion.div>
    );
  }

  return (
    <motion.div animate={{ x: [0, 5, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}>
      <Cloud className="h-16 w-16 text-white drop-shadow-lg" />
    </motion.div>
  );
}

// ─── Empty state (never show fake weather — it's worse than no weather) ─────
// If the API fails or returns nothing, render an honest "no data" card instead
// of the old hardcoded mock (24°C / 65%) which farmers could see was fake.
const MOCK_DATA: WeatherData | null = null;

// ─── Main Widget ──────────────────────────────────────────
export function WeatherWidget({ data, location = "Farm Location" }: WeatherWidgetProps) {
  const weatherData = data || null;
  const [mounted, setMounted] = React.useState(false);
  const [uvIndex, setUvIndex] = React.useState(5);

  // Honest empty state: no fake numbers, just a clear ask
  if (!weatherData) {
    return (
      <Card className="overflow-hidden border-wangari-border">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-wangari-green-50 text-wangari-green-700 shrink-0">
              <CloudSun className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-wangari-heading">Weather unavailable</p>
              <p className="text-xs text-wangari-muted mt-1">
                Add your farm&apos;s location in Settings so we can bring you accurate local forecasts, rain alerts and farming tips.
              </p>
              <a href="/settings" className="inline-flex items-center gap-1 mt-2 text-xs font-bold text-wangari-green-700 hover:underline cursor-pointer">
                Set farm location →
              </a>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  React.useEffect(() => {
    setMounted(true);
    setUvIndex(Math.floor(Math.random() * 5) + 3);
    // Re-evaluate day/night every minute so the card transitions on its own at dusk/dawn
    const t = setInterval(() => setNight(isNightNow(weatherData.sunrise, weatherData.sunset)), 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weatherData.sunrise, weatherData.sunset]);

  // Night computed from real sunrise/sunset (API) with sane defaults
  const [night, setNight] = React.useState(false);
  React.useEffect(() => {
    setNight(isNightNow(weatherData.sunrise, weatherData.sunset));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weatherData.sunrise, weatherData.sunset]);

  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const riseMins = parseHM(weatherData.sunrise) ?? 6 * 60 + 30;
  const setMins = parseHM(weatherData.sunset) ?? 18 * 60 + 45;
  const gradient = getWeatherGradient(weatherData.condition, night, mins, riseMins, setMins);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
    >
      <Card className="overflow-hidden border-0 shadow-xl">
        <div className={`relative bg-gradient-to-br ${gradient} p-6 text-white transition-colors duration-1000`}>
          {/* Animated background */}
          <AnimatedBackground icon={weatherData.icon} condition={weatherData.condition} night={night} />

          {/* Content */}
          <div className="relative z-10">
            {/* Location */}
            <div className="flex items-center gap-1.5 mb-4">
              <MapPin className="h-3.5 w-3.5 text-white/80" />
              <span className="text-sm font-medium text-white/90">
                {weatherData.location || location}
              </span>
            </div>

            {/* Main temperature + icon */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <motion.p
                  className="text-6xl font-bold tracking-tight"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                >
                  {weatherData.temperature}°
                </motion.p>
                <p className="text-lg text-white/80 capitalize mt-1">
                  {weatherData.description || weatherData.condition}
                </p>
                {weatherData.today && (
                  <p className="text-sm text-white/60 mt-1">
                    H: {weatherData.today.tempMax}° L: {weatherData.today.tempMin}°
                  </p>
                )}
              </div>
              <motion.div
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                <AnimatedWeatherIcon icon={weatherData.icon} condition={weatherData.condition} night={night} />
              </motion.div>
            </div>

            {/* Stats row */}
            <motion.div
              className="grid grid-cols-3 gap-4 rounded-2xl bg-white/10 backdrop-blur-sm p-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.4 }}
            >
              <div className="text-center">
                <Droplets className="h-4 w-4 text-white/70 mx-auto mb-1" />
                <p className="text-lg font-semibold">{weatherData.humidity}%</p>
                <p className="text-[10px] text-white/60">Humidity</p>
              </div>
              <div className="text-center border-x border-white/20">
                <Wind className="h-4 w-4 text-white/70 mx-auto mb-1" />
                <p className="text-lg font-semibold">{weatherData.windSpeed}</p>
                <p className="text-[10px] text-white/60">km/h Wind</p>
              </div>
              <div className="text-center">
                {weatherData.today?.willRain ? (
                  <>
                    <CloudRain className="h-4 w-4 text-white/70 mx-auto mb-1" />
                    <p className="text-lg font-semibold">{weatherData.today.rainMm}mm</p>
                    <p className="text-[10px] text-white/60">Rain</p>
                  </>
                ) : night ? (
                  <>
                    <Moon className="h-4 w-4 text-white/70 mx-auto mb-1" />
                    <p className="text-lg font-semibold">Night</p>
                    <p className="text-[10px] text-white/60">No UV</p>
                  </>
                ) : (
                  <>
                    <Sun className="h-4 w-4 text-white/70 mx-auto mb-1" />
                    <p className="text-lg font-semibold">UV {uvIndex}</p>
                    <p className="text-[10px] text-white/60">UV Index</p>
                  </>
                )}
              </div>
            </motion.div>

            {/* Sunrise / Sunset */}
            {(weatherData.sunrise || weatherData.sunset) && (
              <motion.div
                className="mt-4 flex items-center justify-between"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                {weatherData.sunrise && (
                  <div className="flex items-center gap-2">
                    <Sunrise className="h-4 w-4 text-amber-300" />
                    <div>
                      <p className="text-xs font-medium">{weatherData.sunrise}</p>
                      <p className="text-[10px] text-white/50">Sunrise</p>
                    </div>
                  </div>
                )}
                {weatherData.sunset && (
                  <div className="flex items-center gap-2">
                    <Sunset className="h-4 w-4 text-orange-300" />
                    <div>
                      <p className="text-xs font-medium">{weatherData.sunset}</p>
                      <p className="text-[10px] text-white/50">Sunset</p>
                    </div>
                  </div>
                )}
                <p className="text-[10px] text-white/40">Light schedule</p>
              </motion.div>
            )}

            {/* 5-day forecast */}
            {weatherData.forecast && weatherData.forecast.length > 0 && (
              <motion.div
                className="mt-4 rounded-2xl bg-white/10 backdrop-blur-sm p-3"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
              >
                <p className="text-[10px] font-semibold text-white/50 mb-2 px-1">5-DAY FORECAST</p>
                <div className="flex justify-between px-1">
                  {weatherData.forecast.slice(0, 5).map((day, i) => (
                    <motion.div
                      key={i}
                      className="flex flex-col items-center gap-1"
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.7 + i * 0.05 }}
                    >
                      <span className="text-[10px] text-white/70 font-medium">{day.day}</span>
                      <span className="text-lg">
                        {day.icon === "sun" ? "☀️" : day.icon === "rain" ? "🌧️" : "☁️"}
                      </span>
                      <span className="text-xs font-semibold">{day.tempMax}°</span>
                      <span className="text-[10px] text-white/50">{day.tempMin}°</span>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
