const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api'

type ApiOptions = Omit<RequestInit, 'body'> & { body?: unknown }

async function request<T>(path: string, options: ApiOptions = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = typeof data.message === 'string' ? data.message : 'Something went wrong. Please try again.'
    throw new Error(message)
  }
  return data as T
}

export type MerchantRegistration = {
  merchant: { id: string; name: string }
  apiKey: string
}

export const api = {
  registerMerchant: (name: string, phoneNumber: string) =>
    request<MerchantRegistration>('/merchants', { method: 'POST', body: { name, phoneNumber } }),
  requestOtp: (phone: string) =>
    request<{ message: string }>('/auth/otp/request', { method: 'POST', body: { phone } }),
  verifyOtp: (phone: string, code: string) =>
    request<{ merchantId: string; expiresIn: number }>('/auth/otp/verify', { method: 'POST', body: { phone, code } }),
  logout: () => request<{ message: string }>('/auth/logout', { method: 'POST' }),
}
