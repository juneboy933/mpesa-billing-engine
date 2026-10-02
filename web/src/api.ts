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

export type OnboardingStatus = {
  merchantId: string
  businessName: string | null
  mpesaSetup: { status: string; completedAt: string | null }
  firstPlan: { status: string; plan?: unknown }
  nextStep: 'MPESA_SETUP' | 'FIRST_PLAN' | 'DASHBOARD'
}

export type Dashboard = { merchantId: string; metrics: { plansCount: number; subscriptionsCount: number; activeSubscriptionsCount: number; failedPaymentsCount: number }; recentSubscriptions: Subscription[] }
export type Analytics = { totalSubscriptions: number; activeSubscriptions: number; monthlyRecurringRevenue: number; totalRevenue: number; failedPayments: number; retryingSubscriptions: number; revenueTrend: { date: string; revenue: number }[] }
export type Plan = { id: string; name: string; amount: number | string; interval: string; createdAt: string; subscriptionCount?: number }
export type Subscription = { id: string; customerPhone: string; status: string; nextBillingDate: string; createdAt: string; plan?: { id?: string; name: string; amount: number | string } }
export type Receipt = { id: string; status: string; amount: number; createdAt: string; resolvedAt: string | null; receiptNumber: string }
export type SubscriptionReceipts = { subscriptionId: string; customerPhone: string; currentPlan: string; totalPayments: number; receipts: Receipt[] }

export const api = {
  registerMerchant: (name: string, phoneNumber: string) =>
    request<MerchantRegistration>('/merchants', { method: 'POST', body: { name, phoneNumber } }),
  requestOtp: (phone: string) =>
    request<{ message: string }>('/auth/otp/request', { method: 'POST', body: { phone } }),
  verifyOtp: (phone: string, code: string) =>
    request<{ merchantId: string; expiresIn: number }>('/auth/otp/verify', { method: 'POST', body: { phone, code } }),
  getOnboardingStatus: () => request<OnboardingStatus>('/merchants/me/onboarding'),
  setupMpesa: (credentials: { consumerKey: string; consumerSecret: string; shortcode: string; passkey: string }) =>
    request('/merchants/me/mpesa-setup', { method: 'POST', body: credentials }),
  createFirstPlan: (name: string, amount: number) =>
    request('/merchants/me/onboarding/plan', { method: 'POST', body: { name, amount } }),
  getDashboard: () => request<Dashboard>('/merchants/dashboard'),
  getAnalytics: () => request<Analytics>('/merchants/analytics'),
  getPlans: () => request<Plan[]>('/plans'),
  getPlanManagement: () => request<{ totalPlans: number; totalActiveSubscriptions: number; plans: Plan[] }>('/plans/management'),
  createPlan: (name: string, amount: number) => request<Plan>('/plans', { method: 'POST', body: { name, amount } }),
  getSubscriptions: () => request<{ subscriptions: Subscription[] }>('/subscriptions/management').then(data => data.subscriptions),
  getSubscriptionManagement: () => request<{ totalSubscriptions: number; activeSubscriptions: number; subscriptions: Subscription[] }>('/subscriptions/management'),
  createSubscription: (planId: string, customerPhone: string) => request('/subscriptions', { method: 'POST', body: { planId, customerPhone } }),
  getRetryQueue: () => request<{ total: number; retrying: number; pastDue: number; subscriptions: Subscription[] }>('/subscriptions/retry-queue'),
  getReceipts: (subscriptionId: string) => request<SubscriptionReceipts>(`/subscriptions/${subscriptionId}/receipts`),
  triggerRetry: (id: string) => request(`/subscriptions/${id}/retry`, { method: 'POST' }),
  payNow: (id: string) => request(`/subscriptions/${id}/pay-now`, { method: 'POST' }),
  cancelSubscription: (id: string) => request(`/subscriptions/${id}/cancel`, { method: 'PATCH' }),
  logout: () => request<{ message: string }>('/auth/logout', { method: 'POST' }),
}
