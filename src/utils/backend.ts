import { getUserID } from "zmp-sdk";

const BACKEND_URL = "https://cmnes.com:4488";

export async function getCurrentUserId() {
  const userId = await getUserID({});
  const normalizedUserId = userId?.trim();

  if (
    !normalizedUserId ||
    ["undefined", "unknown"].includes(normalizedUserId.toLowerCase())
  ) {
    return "DEMO_ID";
  }

  return normalizedUserId;
}

export async function backendRequest<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${BACKEND_URL}${path}`, options);
  if (!response.ok) {
    throw new Error(`Backend request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function backendPost<TRequest, TResponse>(
  path: string,
  payload: TRequest
): Promise<TResponse> {
  return backendRequest<TResponse>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function createQrUrl(amount: number, orderCode: number | string) {
  const url = new URL("https://vietqr.app/img");
  url.searchParams.set("acc", "0766992331");
  url.searchParams.set("bank", "MBBank");
  url.searchParams.set("amount", String(amount));
  url.searchParams.set("des", `Thanh toan don hang ${orderCode}`);
  url.searchParams.set("template", "compact");
  return url.toString();
}

export async function downloadQr(amount: number, orderCode: number | string) {
  const url = new URL(`${BACKEND_URL}/download_qr`);
  url.searchParams.set("amount", String(amount));
  url.searchParams.set("order_code", String(orderCode));
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`QR download failed: ${response.status}`);
  }

  const blobUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = `ma-qr-${orderCode}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(blobUrl);
}