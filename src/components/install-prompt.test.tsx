import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { InstallPrompt } from './install-prompt'
import {
  __resetInstallPromptForTests,
  __setInstallPromptForTests,
  type BeforeInstallPromptEvent,
} from '@/lib/pwa-install'

const track = vi.fn()
vi.mock('@/lib/analytics', () => ({ track: (...args: unknown[]) => track(...args) }))

function fakeEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const prompt = vi.fn().mockResolvedValue(undefined)
  const event = {
    preventDefault: vi.fn(),
    prompt,
    userChoice: Promise.resolve({ outcome }),
  } as unknown as BeforeInstallPromptEvent
  return { event, prompt }
}

beforeEach(() => {
  __resetInstallPromptForTests()
  window.localStorage.clear()
  track.mockClear()
})

describe('InstallPrompt — visibility', () => {
  it('renders nothing when the browser never offered an install', () => {
    const { container } = render(<InstallPrompt surface="dashboard" />)
    expect(container).toBeEmptyDOMElement()
    expect(track).not.toHaveBeenCalled()
  })

  it('appears once an install offer is captured', async () => {
    render(<InstallPrompt surface="dashboard" />)
    __setInstallPromptForTests(fakeEvent().event)

    expect(await screen.findByText('Add to your home screen')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Install this as an app for quicker access and offline reading of the instrument library.',
      ),
    ).toBeInTheDocument()
  })

  it('stays hidden if the user previously said "Not now" on this device', () => {
    window.localStorage.setItem('pwa:install-dismissed', '1')
    __setInstallPromptForTests(fakeEvent().event)

    const { container } = render(<InstallPrompt surface="dashboard" />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('InstallPrompt — actions', () => {
  it('Install replays the deferred browser prompt and reports acceptance', async () => {
    const { event, prompt } = fakeEvent('accepted')
    __setInstallPromptForTests(event)
    render(<InstallPrompt surface="dashboard" />)

    fireEvent.click(screen.getByRole('button', { name: 'Install' }))

    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(track).toHaveBeenCalledWith('pwa_installed', { surface: 'dashboard' }))
  })

  it('does not report an install when the user declines the browser dialog', async () => {
    const { event, prompt } = fakeEvent('dismissed')
    __setInstallPromptForTests(event)
    render(<InstallPrompt surface="dashboard" />)

    fireEvent.click(screen.getByRole('button', { name: 'Install' }))

    await waitFor(() => expect(prompt).toHaveBeenCalled())
    expect(track).not.toHaveBeenCalledWith('pwa_installed', expect.anything())
  })

  it('never fires the single-use browser prompt twice on a double click', async () => {
    const { event, prompt } = fakeEvent('accepted')
    __setInstallPromptForTests(event)
    render(<InstallPrompt surface="dashboard" />)

    const button = screen.getByRole('button', { name: 'Install' })
    fireEvent.click(button)
    fireEvent.click(button)

    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1))
  })

  it('"Not now" hides the card and remembers the choice for next time', () => {
    __setInstallPromptForTests(fakeEvent().event)
    const { unmount } = render(<InstallPrompt surface="dashboard" />)

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByText('Add to your home screen')).not.toBeInTheDocument()
    unmount()

    const { container } = render(<InstallPrompt surface="dashboard" />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('InstallPrompt — analytics', () => {
  it('fires pwa_install_prompted once when the card becomes visible', async () => {
    __setInstallPromptForTests(fakeEvent().event)
    const { rerender } = render(<InstallPrompt surface="dashboard" />)

    await screen.findByText('Add to your home screen')
    rerender(<InstallPrompt surface="dashboard" />)

    expect(track.mock.calls.filter((c) => c[0] === 'pwa_install_prompted')).toHaveLength(1)
    expect(track).toHaveBeenCalledWith('pwa_install_prompted', { surface: 'dashboard' })
  })

  it('does not fire pwa_install_prompted for a card that never renders', () => {
    window.localStorage.setItem('pwa:install-dismissed', '1')
    __setInstallPromptForTests(fakeEvent().event)
    render(<InstallPrompt surface="dashboard" />)

    expect(track).not.toHaveBeenCalledWith('pwa_install_prompted', expect.anything())
  })
})
