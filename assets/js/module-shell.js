const moduleName = document.body?.dataset.module || "dashboard";
const moduleRoutes = {
  login: "login", dashboard: "dashboard", passengers: "passengers",
  tickets: "passengers", cargo: "cargo", invoices: "cargo",
  transit: "transit", trips: "trips", buses: "buses",
  "driver-accounts": "drivers", finance: "financials",
  financial: "financials", financials: "financials",
  "payroll-employees": "salaries", users: "users"
};
const target = moduleRoutes[moduleName] || moduleName;
const url = new URL("index.html", window.location.href);
url.searchParams.set("module", target);
window.location.replace(url.href);
