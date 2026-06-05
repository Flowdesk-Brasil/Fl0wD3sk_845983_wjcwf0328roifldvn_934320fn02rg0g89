export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem("device_id");
  if (!id) {
    id = "dev-" + Math.random().toString(36).substring(2, 10);
    localStorage.setItem("device_id", id);
  }
  return id;
}

export function getDeviceName(): string {
  if (typeof window === "undefined") return "Servidor";
  let name = localStorage.getItem("device_name");
  if (!name) {
    name = "Terminal " + Math.floor(Math.random() * 1000);
    localStorage.setItem("device_name", name);
  }
  return name;
}

export function setDeviceName(name: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("device_name", name);
}
