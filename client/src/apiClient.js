import { API_URL } from "./config";

export const authFetch = async (path, options = {}) => {
  const token = localStorage.getItem("token");
  const baseUrl = path.startsWith("http") ? path : `${API_URL}${path}`;

  const response = await fetch(baseUrl, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      Authorization: token ? `Bearer ${token}` : "",
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error((data && data.error) || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
};
