const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "readings.json");
const TARIFF = 8; // Demo rate only; replace with your applicable tariff
const MAX_READINGS = 20000;

let readings = [];

try {
  const saved = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  if (Array.isArray(saved)) readings = saved;
} catch (e) {
  if (e.code !== "ENOENT") console.error(e.message);
}

function save() {
  const temp = DATA_FILE + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(readings, null, 2));
  fs.renameSync(temp, DATA_FILE);
}

function sendJSON(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(data));
}

function getUsage(list) {
  if (list.length < 2) return 0;

  const first = Number(list[0].energyKWh);
  const last = Number(list[list.length - 1].energyKWh);

  if (!Number.isFinite(first) || !Number.isFinite(last)) return 0;
  return Math.max(0, last - first);
}

function getSummary() {
  const now = new Date();
  const today = now.toLocaleDateString("en-CA");
  const month = today.slice(0, 7);

  const daily = readings.filter(r => r.date === today);
  const monthly = readings.filter(r => r.date.startsWith(month));
  const latest = readings.length
    ? readings[readings.length - 1]
    : null;

  const todayKWh = getUsage(daily);
  const monthKWh = getUsage(monthly);

  return {
    meterNumber: latest ? latest.meterNumber : "1990107",
    sensorValue: latest ? latest.sensorValue : 0,
    pulseCount: latest ? latest.pulseCount : 0,
    energyKWh: latest ? latest.energyKWh : 0,
    powerW: latest ? latest.powerW : null,
    todayKWh,
    monthKWh,
    todayCost: todayKWh * TARIFF,
    monthCost: monthKWh * TARIFF,
    tariff: TARIFF,
    lastUpdated: latest ? latest.timestamp : null,
    history: readings.slice(-100)
  };
}

const dashboard = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WattGuard AI</title>
<style>
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 18px;
  background: #0b1020;
  color: #f3f6ff;
  font-family: Arial, sans-serif;
}
h1 { color: #5eead4; }
.muted { color: #aab5d0; }
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
  gap: 12px;
}
.card {
  background: #151e33;
  border: 1px solid #293653;
  border-radius: 14px;
  padding: 16px;
}
.label { font-size: 13px; color: #aab5d0; }
.value {
  font-size: 23px;
  font-weight: bold;
  margin-top: 12px;
  overflow-wrap: anywhere;
}
li { margin: 9px 0; overflow-wrap: anywhere; }
</style>
</head>
<body>
<h1>⚡ WattGuard AI</h1>
<p class="muted">Smart Energy Monitoring Dashboard</p>
<p id="status">Connecting...</p>

<div class="grid">
  <div class="card">
    <div class="label">Cumulative Energy</div>
    <div class="value" id="energy">0 kWh</div>
  </div>
  <div class="card">
    <div class="label">Usage Today</div>
    <div class="value" id="today">0 kWh</div>
  </div>
  <div class="card">
    <div class="label">Usage This Month</div>
    <div class="value" id="month">0 kWh</div>
  </div>
  <div class="card">
    <div class="label">Estimated Cost Today</div>
    <div class="value" id="todayCost">₹0.00</div>
  </div>
  <div class="card">
    <div class="label">Estimated Monthly Cost</div>
    <div class="value" id="monthCost">₹0.00</div>
  </div>
  <div class="card">
    <div class="label">Sensor Value</div>
    <div class="value" id="sensor">0</div>
  </div>
  <div class="card">
    <div class="label">Pulse Count</div>
    <div class="value" id="pulses">0</div>
  </div>
  <div class="card">
    <div class="label">Power</div>
    <div class="value" id="power">Not measured</div>
  </div>
</div>

<div class="card" style="margin-top:14px">
  <h3>Recent Readings</h3>
  <ul id="history">
    <li>Waiting for ESP32 data...</li>
  </ul>
</div>

<p class="muted">Meter: <span id="meter">1990107</span></p>
<p class="muted">Tariff: ₹<span id="tariff">8</span>/kWh</p>
<p class="muted">Last update: <span id="updated">No data</span></p>
<p class="muted">
  Cost is an estimate, not an official electricity bill.
  Daily and monthly usage need readings within each period.
</p>
<p class="muted">
  An LDR detects light pulses; it does not directly measure
  voltage, current, or instantaneous power. Verify the meter's
  pulses/kWh specification before relying on the energy calculation.
</p>

<script>
async function refresh() {
  try {
    const response = await fetch("/api/summary", {
      cache: "no-store"
    });

    if (!response.ok) throw new Error("Backend request failed");

    const d = await response.json();

    document.getElementById("energy").textContent =
      Number(d.energyKWh).toFixed(6) + " kWh";

    document.getElementById("today").textContent =
      Number(d.todayKWh).toFixed(6) + " kWh";

    document.getElementById("month").textContent =
      Number(d.monthKWh).toFixed(6) + " kWh";

    document.getElementById("todayCost").textContent =
      "₹" + Number(d.todayCost).toFixed(2);

    document.getElementById("monthCost").textContent =
      "₹" + Number(d.monthCost).toFixed(2);

    document.getElementById("sensor").textContent = d.sensorValue;
    document.getElementById("pulses").textContent = d.pulseCount;

    document.getElementById("power").textContent =
      d.powerW == null
        ? "Not measured"
        : Number(d.powerW).toFixed(2) + " W";

    document.getElementById("meter").textContent = d.meterNumber;
    document.getElementById("tariff").textContent = d.tariff;

    document.getElementById("updated").textContent =
      d.lastUpdated
        ? new Date(d.lastUpdated).toLocaleString()
        : "No data received";

    const list = document.getElementById("history");
    list.replaceChildren();

    d.history.slice(-8).reverse().forEach(r => {
      const item = document.createElement("li");
      item.textContent =
        new Date(r.timestamp).toLocaleString() +
        " — Energy: " +
        Number(r.energyKWh).toFixed(6) +
        " kWh; Pulses: " +
        r.pulseCount +
        "; Sensor: " +
        r.sensorValue;

      list.appendChild(item);
    });

    if (d.history.length === 0) {
      const item = document.createElement("li");
      item.textContent = "Waiting for ESP32 data...";
      list.appendChild(item);
    }

    document.getElementById("status").textContent =
      "Backend connected";

  } catch (error) {
    document.getElementById("status").textContent =
      "Cannot connect to backend";
  }
}

refresh();
setInterval(refresh, 3000);
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    return res.end();
  }

  const url = new URL(
    req.url,
    `http://${req.headers.host || "localhost"}`
  );

  if (req.method === "GET" && url.pathname === "/") {
    const indexPath = path.join(__dirname, "index.html");

    fs.readFile(indexPath, (error, html) => {
      if (error) {
        console.error("Unable to read index.html:", error.message);
        res.writeHead(500, {
          "Content-Type": "text/plain; charset=utf-8"
        });
        return res.end("Dashboard file could not be loaded.");
      }

      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8"
      });
      res.end(html);
    });

    return;
  }

  if (req.method === "GET" && url.pathname === "/api/summary") {
    return sendJSON(res, 200, getSummary());
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJSON(res, 200, {
      ok: true,
      savedReadings: readings.length
    });
  }

  if (req.method === "POST" && url.pathname === "/api/pulse") {
    let body = "";

    req.on("data", chunk => {
      body += chunk;

      if (body.length > 10000) {
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        const data = JSON.parse(body);

        const pulseCount = Number(data.pulseCount);
        const energyKWh = Number(data.energyKWh);
        const sensorValue = Number(data.sensorValue);

        if (
          !Number.isFinite(pulseCount) ||
          !Number.isFinite(energyKWh) ||
          !Number.isFinite(sensorValue) ||
          pulseCount < 0 ||
          energyKWh < 0
        ) {
          return sendJSON(res, 400, {
            error: "Invalid sensor data"
          });
        }

        const now = new Date();
        const suppliedPower = data.powerW == null
          ? null
          : Number(data.powerW);

        const reading = {
          timestamp: now.toISOString(),
          date: now.toLocaleDateString("en-CA"),
          meterNumber: String(data.meterNumber || "1990107"),
          pulseCount,
          pulseRate: Number(data.pulseRate || 0),
          sensorValue,
          energyKWh,
          powerW: Number.isFinite(suppliedPower)
            ? suppliedPower
            : null
        };

        readings.push(reading);

        if (readings.length > MAX_READINGS) {
          readings = readings.slice(-MAX_READINGS);
        }

        save();

        return sendJSON(res, 200, {
          ok: true,
          saved: true,
          totalReadings: readings.length
        });

      } catch (error) {
        console.error("Reading error:", error.message);

        return sendJSON(res, 400, {
          error: "Invalid JSON or unable to save data"
        });
      }
    });

    return;
  }

  return sendJSON(res, 404, {
    error: "Endpoint not found"
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("WattGuard AI server started");
  console.log("Dashboard: http://127.0.0.1:" + PORT);
  console.log("Health: http://127.0.0.1:" + PORT + "/api/health");
  console.log("Data file: " + DATA_FILE);
});
