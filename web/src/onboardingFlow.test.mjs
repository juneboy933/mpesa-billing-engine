import assert from 'node:assert/strict'
import test from 'node:test'
import { onboardingStepFor } from './onboardingFlow.ts'
import { safeReturnTo } from './authNavigation.ts'

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

test('allows only known local protected return paths', () => {
  assert.equal(safeReturnTo('/subscriptions?page=2'), '/subscriptions?page=2')
  assert.equal(safeReturnTo('//evil.example/path'), null)
  assert.equal(safeReturnTo('https://evil.example/path'), null)
  assert.equal(safeReturnTo('/onboarding'), null)
})
