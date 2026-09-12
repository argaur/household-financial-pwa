import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ImportDropZone } from './import-drop-zone'
import { expectNoAxeViolations } from '@/test/axe'

/**
 * D-025 step H2 — the upload drop zone. SPEC.md §I4's "Upload" row: "A drop
 * zone with a file button, one file at a time, .xlsx only." This component
 * does not parse — it hands the accepted `File` to `onFileAccepted` and lets
 * the host (H3) orchestrate `readImportWorkbook`.
 */

function makeXlsxFile(name = 'household.xlsx') {
  return new File(['pretend workbook bytes'], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

function makeTextFile(name = 'notes.txt') {
  return new File(['hello'], name, { type: 'text/plain' })
}

describe('ImportDropZone', () => {
  it('has a visible file button, not just a drop zone', () => {
    render(<ImportDropZone onFileAccepted={vi.fn()} />)
    expect(screen.getByRole('button', { name: /choose file/i })).toBeInTheDocument()
  })

  it('accepts a valid .xlsx file chosen via the file button', () => {
    const onFileAccepted = vi.fn()
    render(<ImportDropZone onFileAccepted={onFileAccepted} />)
    const input = screen.getByLabelText(/choose an \.xlsx file/i) as HTMLInputElement
    const file = makeXlsxFile()
    fireEvent.change(input, { target: { files: [file] } })
    expect(onFileAccepted).toHaveBeenCalledTimes(1)
    expect(onFileAccepted).toHaveBeenCalledWith(file)
  })

  it('rejects a non-.xlsx file with a clear message and does not call onFileAccepted', () => {
    const onFileAccepted = vi.fn()
    render(<ImportDropZone onFileAccepted={onFileAccepted} />)
    const input = screen.getByLabelText(/choose an \.xlsx file/i) as HTMLInputElement
    fireEvent.change(input, { target: { files: [makeTextFile()] } })
    expect(onFileAccepted).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/\.xlsx/i)
  })

  it('does not silently take the first file when several are chosen at once', () => {
    const onFileAccepted = vi.fn()
    render(<ImportDropZone onFileAccepted={onFileAccepted} />)
    const input = screen.getByLabelText(/choose an \.xlsx file/i) as HTMLInputElement
    fireEvent.change(input, { target: { files: [makeXlsxFile('a.xlsx'), makeXlsxFile('b.xlsx')] } })
    expect(onFileAccepted).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/one file at a time/i)
  })

  it('accepts a single .xlsx file dropped onto the zone', () => {
    const onFileAccepted = vi.fn()
    render(<ImportDropZone onFileAccepted={onFileAccepted} />)
    const dropZone = screen.getByTestId('import-drop-zone')
    const file = makeXlsxFile()
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } })
    expect(onFileAccepted).toHaveBeenCalledTimes(1)
    expect(onFileAccepted).toHaveBeenCalledWith(file)
  })

  it('rejects several files dropped at once, saying so rather than taking the first', () => {
    const onFileAccepted = vi.fn()
    render(<ImportDropZone onFileAccepted={onFileAccepted} />)
    const dropZone = screen.getByTestId('import-drop-zone')
    fireEvent.drop(dropZone, { dataTransfer: { files: [makeXlsxFile('a.xlsx'), makeXlsxFile('b.xlsx')] } })
    expect(onFileAccepted).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/one file at a time/i)
  })

  it('rejects a non-.xlsx file dropped onto the zone', () => {
    const onFileAccepted = vi.fn()
    render(<ImportDropZone onFileAccepted={onFileAccepted} />)
    const dropZone = screen.getByTestId('import-drop-zone')
    fireEvent.drop(dropZone, { dataTransfer: { files: [makeTextFile()] } })
    expect(onFileAccepted).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/\.xlsx/i)
  })

  it('carries no sm: class — this project fires sm: at 390px, so full-width controls use md:', () => {
    const { container } = render(<ImportDropZone onFileAccepted={vi.fn()} />)
    const html = container.innerHTML
    expect(html).not.toMatch(/\bsm:(grid-cols|w-auto|flex-row|inline-flex)/)
  })

  it('has no axe violations', async () => {
    const { container } = render(<ImportDropZone onFileAccepted={vi.fn()} />)
    await expectNoAxeViolations(container)
  })
})
