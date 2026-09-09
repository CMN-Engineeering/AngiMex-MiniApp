const BACKEND_URL = "https://cmnes.com:4488";

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