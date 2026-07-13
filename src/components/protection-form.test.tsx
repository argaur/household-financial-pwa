import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ProtectionForm } from './protection-form'
import type { FamilyMember } from '@/lib/family-members-api'
import type { Protection } from '@/lib/protection-api'

const getToken = vi.fn().mockResolvedValue('test-token')
vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ getToken }),
}))

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))

const createProtection = vi.fn()
const updateProtection = vi.fn()
vi.mock('@/lib/protection-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/protection-api')>()
  return {
    ...actual,
    createProtection: (...args: unknown[]) => createProtection(...args),
    updateProtection: (...args: unknown[]) => updateProtection(...args),
  }
})

const member: FamilyMember = {
  id: 'm1',
  householdId: 'h1',
  name: 'Gaurav Gupta',
  relationship: 'self',
  dateOfBirth: '1990-01-01',
  createdAt: '',
  updatedAt: '',
}

const protectionRecord: Protection = {
  id: 'prot1',
  householdId: 'h1',
  memberId: 'm1',
  type: 'term-life',
  coverAmount: '5000000',
  premium: null,
  provider: null,
  status: 'active',
  createdAt: '',
  updatedAt: '',
}

describe('ProtectionForm', () => {
  beforeEach(() => {
    createProtection.mockReset()
    updateProtection.mockReset()
  })

  it('submit is disabled until member and cover amount are filled', () => {
    render(
      <ProtectionForm members={[]} submitLabel="Add cover" submittingLabel="Adding…" analyticsSurface="test" onSaved={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: /add cover/i })).toBeDisabled()
  })

  it('creates a protection record with defaults (term-life, active) when only cover amount is entered', async () => {
    createProtection.mockResolvedValue(protectionRecord)
    const onSaved = vi.fn()
    render(
      <ProtectionForm
        members={[member]}
        submitLabel="Add cover"
        submittingLabel="Adding…"
        analyticsSurface="test"
        onSaved={onSaved}
      />,
    )

    fireEvent.change(screen.getByLabelText(/cover amount/i), { target: { value: '5000000' } })
    fireEvent.click(screen.getByRole('button', { name: /add cover/i }))

    await waitFor(() =>
      expect(createProtection).toHaveBeenCalledWith('test-token', {
        memberId: 'm1',
        type: 'term-life',
        coverAmount: '5000000',
        status: 'active',
      }),
    )
    expect(onSaved).toHaveBeenCalledWith(protectionRecord)
  })

  it('pre-fills fields from initialProtection and calls updateProtection on save (edit mode)', async () => {
    updateProtection.mockResolvedValue({ ...protectionRecord, coverAmount: '6000000' })
    const onSaved = vi.fn()
    render(
      <ProtectionForm
        members={[member]}
        initialProtection={protectionRecord}
        submitLabel="Save changes"
        submittingLabel="Saving…"
        analyticsSurface="test"
        onSaved={onSaved}
      />,
    )

    const coverAmountInput = screen.getByLabelText(/cover amount/i) as HTMLInputElement
    expect(coverAmountInput.value).toBe('5000000')

    fireEvent.change(coverAmountInput, { target: { value: '6000000' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() =>
      expect(updateProtection).toHaveBeenCalledWith('test-token', 'prot1', {
        memberId: 'm1',
        type: 'term-life',
        coverAmount: '6000000',
        status: 'active',
      }),
    )
    expect(onSaved).toHaveBeenCalled()
  })

  it('shows an inline error and does not call onSaved when the save fails', async () => {
    const { ProtectionApiError } = await import('@/lib/protection-api')
    createProtection.mockRejectedValue(new ProtectionApiError(400, 'invalid_protection'))
    const onSaved = vi.fn()
    render(
      <ProtectionForm
        members={[member]}
        submitLabel="Add cover"
        submittingLabel="Adding…"
        analyticsSurface="test"
        onSaved={onSaved}
      />,
    )

    fireEvent.change(screen.getByLabelText(/cover amount/i), { target: { value: '5000000' } })
    fireEvent.click(screen.getByRole('button', { name: /add cover/i }))

    await screen.findByText(/check the member, type, and cover amount/i)
    expect(onSaved).not.toHaveBeenCalled()
  })
})
