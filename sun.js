// tw-web — daylight for the Calendar's time column: sunrise, sunset and civil twilight for a
// date and place, as minutes after local midnight. Loads after tw-api.js, which declares TW.
// Pure functions: tests/js/sun.test.cjs runs them in Node.
//
// The usual approximation (within a few minutes, plenty for a stripe): the sun's declination from
// the day of the year, the hour angle at which it crosses an altitude, and solar noon from the
// longitude, the browser's UTC offset for that day (DST included) and the equation of time.
TW.sun = (() => {
    const RAD = Math.PI / 180;
    const SUN   = -0.833;   // sunrise/sunset: the disc's top at the horizon, with refraction
    const CIVIL = -6;       // civil twilight: dawn and dusk

    // {dawn, sunrise, sunset, dusk}, minutes after local midnight, clamped to the day.
    // Midnight sun: dawn 0 and dusk 1440. Polar night: sunrise === sunset (no daylight).
    function times(date, lat, lon) {
        const day  = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
        const n    = Math.round((day - new Date(day.getFullYear(), 0, 0, 12)) / 864e5);
        const decl = -23.44 * Math.cos(2 * Math.PI / 365 * (n + 10));
        const b    = 2 * Math.PI * (n - 81) / 364;
        const eot  = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);   // minutes
        const noon = 720 + (-day.getTimezoneOffset() / 60 * 15 - lon) * 4 - eot;

        // Half the time the sun spends above alt, in minutes (0: never; 720: always)
        const half = alt => {
            const c = (Math.sin(alt * RAD) - Math.sin(lat * RAD) * Math.sin(decl * RAD)) /
                      (Math.cos(lat * RAD) * Math.cos(decl * RAD));
            if (c >= 1)  return 0;
            if (c <= -1) return 720;
            return Math.acos(c) / RAD * 4;
        };
        // Always above an altitude means all day, whatever the clock's noon
        const clamp = m => Math.min(1440, Math.max(0, m));
        const s = half(SUN), c = half(CIVIL);
        const from = h => h >= 720 ? 0 : clamp(noon - h), to = h => h >= 720 ? 1440 : clamp(noon + h);
        return { dawn: from(c), sunrise: from(s), sunset: to(s), dusk: to(c) };
    }

    return { times };
})();
