import type { OnboardingStatus } from './api'

export function onboardingStepFor(status: OnboardingStatus): number | null {
  if (status.nextStep === 'MPESA_SETUP') return 2
  if (status.nextStep === 'FIRST_PLAN') return 3
  return null
}
