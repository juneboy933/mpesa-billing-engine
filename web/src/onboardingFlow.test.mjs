import assert from 'node:assert/strict'
import test from 'node:test'
import { onboardingStepFor } from './onboardingFlow.ts'

const status = nextStep => ({
  merchantId: 'merchant-id',
  businessName: 'Example business',
  mpesaSetup: { status: 'PENDING', completedAt: null },
  firstPlan: { status: 'PENDING' },
  nextStep,
})

test('resumes at PayBill setup when it is the next onboarding step', () => {
  assert.equal(onboardingStepFor(status('MPESA_SETUP')), 2)
})

test('resumes at first plan creation after PayBill setup', () => {
  assert.equal(onboardingStepFor(status('FIRST_PLAN')), 3)
})

test('returns to the dashboard after onboarding is complete', () => {
  assert.equal(onboardingStepFor(status('DASHBOARD')), null)
})
