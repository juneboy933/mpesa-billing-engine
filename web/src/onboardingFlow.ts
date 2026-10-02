import type { OnboardingStatus } from './api'

export function onboardingStepFor(status: OnboardingStatus): number | null {
  if (status.nextStep === 'MPESA_SETUP') return 1
  if (status.nextStep === 'FIRST_PLAN') return 2
  return null
}
