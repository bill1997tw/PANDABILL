export async function parseJson<T>(response: Response): Promise<T> {
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? "發生未預期的錯誤。");
  }

  return payload as T;
}
